import { useMemo, useRef, useState } from 'react';
import type { Catalog } from '../lib/catalog';
import { relaxPlan, runPlan, type QueryPlan } from '../lib/engine';
import {
  prepareImage,
  readSpace,
  retrievePrinciples,
  studioChat,
  suggestForSpace,
  type ChatTurn,
  type SpaceRead,
  type Suggestion,
} from '../lib/studio';
import { ItemCard } from './ItemCard';

type Phase = 'empty' | 'reading' | 'suggesting' | 'ready' | 'error';

interface Shelf extends Suggestion {
  key: number;
}

export function Studio({
  catalog,
  online,
  openInCatalog,
}: {
  catalog: Catalog;
  online: boolean;
  openInCatalog: (plan: QueryPlan) => void;
}) {
  const [phase, setPhase] = useState<Phase>('empty');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [read, setRead] = useState<SpaceRead | null>(null);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [noSuggestions, setNoSuggestions] = useState(false);
  const shelfKey = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const principles = useMemo(() => {
    if (!read) return [];
    const basis = [
      read.room,
      read.style,
      read.light,
      ...read.palette,
      ...read.materials,
      ...read.opportunities.map((o) => `${o.need} ${o.why}`),
      note,
    ].join(' ');
    return retrievePrinciples(basis);
  }, [read, note]);

  // Every shelf's products come from running its plan over the real catalog.
  const shelfItems = useMemo(
    () =>
      shelves.map((s) => {
        const plan = relaxPlan(catalog.items, s.plan);
        return { shelf: s, plan, items: runPlan(catalog.items, plan).slice(0, 4) };
      }),
    [shelves, catalog],
  );

  const addShelves = (suggestions: Suggestion[]) => {
    const withKeys = suggestions.map((s) => ({ ...s, key: shelfKey.current++ }));
    setShelves((prev) => [...withKeys, ...prev]);
  };

  const analyze = async (file: File) => {
    setPhase('reading');
    setRead(null);
    setShelves([]);
    setChat([]);
    try {
      const image = await prepareImage(file);
      setPreview(`data:${image.mediaType};base64,${image.data}`);
      const spaceRead = await readSpace(image, note, catalog);
      if (!spaceRead) {
        setPhase('error');
        return;
      }
      setRead(spaceRead);
      setPhase('suggesting');
      const basis = [
        spaceRead.room, spaceRead.style, spaceRead.light,
        ...spaceRead.palette, ...spaceRead.materials,
        ...spaceRead.opportunities.map((o) => `${o.need} ${o.why}`), note,
      ].join(' ');
      const suggestions = await suggestForSpace(
        spaceRead, note, catalog, retrievePrinciples(basis),
      );
      if (suggestions && suggestions.length > 0) {
        addShelves(suggestions);
        setNoSuggestions(false);
      } else {
        setNoSuggestions(true);
      }
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  };

  const shelvesSummary = () =>
    shelfItems
      .map(({ shelf, items }) => {
        const lines = items.map(
          (i) =>
            `  - ${i.title} (${i.price !== null ? `$${i.price.toFixed(2)}` : 'price unknown'}, ` +
            `${i.reviewed ? `${(i.rating as number).toFixed(1)} from ${i.reviews} reviews` : 'no reviews yet'}, ` +
            `${i.inStock ? 'in stock' : 'sold out'})`,
        );
        return `${shelf.title}:\n${lines.join('\n')}`;
      })
      .join('\n');

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatText.trim();
    if (!text || !read || chatBusy) return;
    const history: ChatTurn[] = [...chat, { role: 'user', text }];
    setChat(history);
    setChatText('');
    setChatBusy(true);
    const result = await studioChat(history, read, catalog, principles, shelvesSummary());
    if (result) {
      if (result.suggestions && result.suggestions.length > 0) addShelves(result.suggestions);
      setChat([
        ...history,
        {
          role: 'assistant',
          text:
            result.text ||
            (result.suggestions?.length
              ? 'Added suggestions below, from the catalog.'
              : 'I could not come up with anything useful for that.'),
        },
      ]);
    } else {
      setChat([
        ...history,
        { role: 'assistant', text: 'That request did not go through. Try again.' },
      ]);
    }
    setChatBusy(false);
  };

  if (!online) {
    return (
      <section className="studio-offline">
        <p>
          The design studio needs the assistant, which is offline right now. The
          catalog search works fully without it.
        </p>
      </section>
    );
  }

  return (
    <section className="studio" aria-label="Design studio">
      <div className="studio-intake">
        <div className="studio-upload">
          {preview ? (
            <img src={preview} alt="Your space" />
          ) : (
            <p>
              A photo of the space you're working on. It stays between you and the
              assistant; nothing is kept.
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void analyze(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={phase === 'reading' || phase === 'suggesting'}
          >
            {preview ? 'Use a different photo' : 'Upload a photo'}
          </button>
        </div>
        <div className="studio-side">
          <label>
            Anything the photo doesn't say
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder='e.g. "rental, can’t paint", "budget around $200"'
            />
          </label>
          {phase === 'reading' && <p className="studio-status">Reading the photo…</p>}
          {phase === 'suggesting' && (
            <p className="studio-status">Read done — building suggestions…</p>
          )}
          {phase === 'error' && (
            <p className="studio-status">
              Could not read that photo. Try another one, or try again.
            </p>
          )}
          {read && (
            <dl className="space-read">
              <div><dt>Space</dt><dd>{read.room}</dd></div>
              {read.style && <div><dt>Leans</dt><dd>{read.style}</dd></div>}
              {read.light && <div><dt>Light</dt><dd>{read.light}</dd></div>}
              {read.palette.length > 0 && <div><dt>Palette</dt><dd>{read.palette.join(', ')}</dd></div>}
              {read.materials.length > 0 && <div><dt>Materials</dt><dd>{read.materials.join(', ')}</dd></div>}
              {read.opportunities.map((o) => (
                <div key={o.need}>
                  <dt>Gap</dt>
                  <dd>{o.need}{o.why ? ` — ${o.why}` : ''}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {shelfItems.map(({ shelf, plan, items }) =>
        items.length === 0 ? null : (
          <div className="shelf" key={shelf.key}>
            <div className="shelf-head">
              <div>
                <h2>{shelf.title}</h2>
                <p>
                  {shelf.why}
                  {shelf.principle && (
                    <span className="principle" title={
                      principles.find((p) => p.name === shelf.principle)?.body
                    }>
                      {' '}· {shelf.principle}
                    </span>
                  )}
                </p>
              </div>
              <div className="shelf-actions">
                <button type="button" onClick={() => openInCatalog(plan)}>
                  Open in catalog
                </button>
                <button
                  type="button"
                  onClick={() => setShelves((prev) => prev.filter((s) => s.key !== shelf.key))}
                >
                  Dismiss
                </button>
              </div>
            </div>
            <div className="shelf-grid">
              {items.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        ),
      )}

      {noSuggestions && shelves.length === 0 && (
        <p className="studio-status">
          No suggestions came back for this read. Ask for some below.
        </p>
      )}

      {read && (
        <div className="studio-chat">
          {chat.map((turn, i) => (
            <p key={i} className={turn.role === 'user' ? 'turn turn-user' : 'turn'}>
              {turn.text}
            </p>
          ))}
          {chatBusy && <p className="studio-status">Thinking…</p>}
          <form onSubmit={sendChat}>
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder='Brainstorm — "which of these fits a dark room?", "cheaper options for the lamp"'
              aria-label="Message the design assistant"
            />
            <button type="submit" disabled={chatBusy || chatText.trim() === ''}>
              Send
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
