import { useMemo, useRef, useState } from 'react';
import type { Catalog } from '../lib/catalog';
import { relaxPlan, runPlan, type QueryPlan } from '../lib/engine';
import type { ChatMessage } from '../lib/llm';
import {
  consult,
  prepareImage,
  type ConsultResult,
  type SpaceRead,
  type Suggestion,
} from '../lib/sidebar';

type Turn =
  | { role: 'user'; text: string; imagePreview: string | null }
  | { role: 'assistant'; result: ConsultResult };

export function Assistant({
  catalog,
  online,
  onShowPlan,
}: {
  catalog: Catalog;
  online: boolean;
  onShowPlan: (plan: QueryPlan) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [space, setSpace] = useState<SpaceRead | null>(null);
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ b64: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The latest suggestions, with their plans executed against the real catalog.
  const latestSuggestions = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (t.role === 'assistant' && t.result.suggestions.length > 0) {
        return t.result.suggestions.map((s) => {
          const plan = relaxPlan(catalog.items, s.plan);
          return { suggestion: s, plan, items: runPlan(catalog.items, plan) };
        });
      }
    }
    return [];
  }, [turns, catalog]);

  const groundedContext = () =>
    latestSuggestions
      .map(({ suggestion, items }) => {
        const lines = items.slice(0, 4).map(
          (i) =>
            `  - ${i.title} (${i.price !== null ? `$${i.price.toFixed(2)}` : 'price unknown'}, ` +
            `${i.reviewed ? `${(i.rating as number).toFixed(1)} from ${i.reviews} reviews` : 'no reviews yet'}, ` +
            `${i.inStock ? 'in stock' : 'sold out'})`,
        );
        return `${suggestion.title} (${items.length} matches):\n${lines.join('\n')}`;
      })
      .join('\n');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    if ((message === '' && !image) || busy) return;
    setFailed(false);
    setBusy(true);

    const userMessage: ChatMessage = {
      role: 'user',
      content: message || 'Here is a photo of my space.',
      ...(image ? { images: [image.b64] } : {}),
    };
    const nextHistory = [...history, userMessage];
    setTurns((prev) => [
      ...prev,
      { role: 'user', text: userMessage.content, imagePreview: image?.preview ?? null },
    ]);
    setText('');
    setImage(null);

    const result = await consult(nextHistory, catalog, space, groundedContext());
    if (result) {
      setHistory([
        ...nextHistory,
        { role: 'assistant', content: JSON.stringify(result) },
      ]);
      setTurns((prev) => [...prev, { role: 'assistant', result }]);
      if (result.space) setSpace(result.space);
    } else {
      // The turn failed validation twice; say so and let them retry.
      setHistory(nextHistory);
      setFailed(true);
    }
    setBusy(false);
  };

  const attach = async (file: File) => {
    try {
      const b64 = await prepareImage(file);
      setImage({ b64, preview: `data:image/jpeg;base64,${b64}` });
    } catch {
      setFailed(true);
    }
  };

  if (!online) {
    return (
      <aside className="sidebar" aria-label="Design assistant">
        <div className="sidebar-head">Design assistant</div>
        <div className="sidebar-body">
          <p className="sidebar-hint">
            Offline. The catalog search works fully without it.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar" aria-label="Design assistant">
      <div className="sidebar-head">Design assistant</div>
      <div className="sidebar-body">
        {turns.length === 0 && (
          <p className="sidebar-hint">
            Describe what you're working on — "I'm thinking of redesigning my
            garage" — or attach a photo of the space. Suggestions come from the
            real catalog.
          </p>
        )}
        {turns.map((turn, i) =>
          turn.role === 'user' ? (
            <div className="turn turn-user" key={i}>
              {turn.imagePreview && <img src={turn.imagePreview} alt="Attached space" />}
              <p>{turn.text}</p>
            </div>
          ) : (
            <div className="turn" key={i}>
              {turn.result.reply && <p>{turn.result.reply}</p>}
              {turn.result.space && (
                <dl className="space-read">
                  <div><dt>Space</dt><dd>{turn.result.space.room}</dd></div>
                  {turn.result.space.style && (
                    <div><dt>Leans</dt><dd>{turn.result.space.style}</dd></div>
                  )}
                  {turn.result.space.light && (
                    <div><dt>Light</dt><dd>{turn.result.space.light}</dd></div>
                  )}
                  {turn.result.space.palette.length > 0 && (
                    <div><dt>Palette</dt><dd>{turn.result.space.palette.join(', ')}</dd></div>
                  )}
                  {turn.result.space.gaps.map((g) => (
                    <div key={g}><dt>Gap</dt><dd>{g}</dd></div>
                  ))}
                </dl>
              )}
              {turn.result.suggestions.map((s) => (
                <SuggestionEntry
                  key={s.title}
                  suggestion={s}
                  catalog={catalog}
                  onShow={onShowPlan}
                />
              ))}
            </div>
          ),
        )}
        {busy && <p className="sidebar-hint">Thinking…</p>}
        {failed && (
          <p className="sidebar-hint" role="alert">
            That didn't go through. Try again.
          </p>
        )}
      </div>
      <form className="sidebar-form" onSubmit={send}>
        {image && (
          <p className="attach-chip">
            Photo attached
            <button type="button" onClick={() => setImage(null)} aria-label="Remove photo">
              ×
            </button>
          </p>
        )}
        <div className="sidebar-input-row">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void attach(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="attach"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            Photo
          </button>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={space ? 'Ask or refine' : 'Describe your space or project'}
            aria-label="Message the design assistant"
            disabled={busy}
          />
          <button type="submit" disabled={busy || (text.trim() === '' && !image)}>
            Send
          </button>
        </div>
      </form>
    </aside>
  );
}

function SuggestionEntry({
  suggestion,
  catalog,
  onShow,
}: {
  suggestion: Suggestion;
  catalog: Catalog;
  onShow: (plan: QueryPlan) => void;
}) {
  const { plan, count } = useMemo(() => {
    const relaxed = relaxPlan(catalog.items, suggestion.plan);
    return { plan: relaxed, count: runPlan(catalog.items, relaxed).length };
  }, [suggestion, catalog]);

  return (
    <div className="suggestion">
      <div className="suggestion-head">
        <h3>{suggestion.title}</h3>
        <button type="button" onClick={() => onShow(plan)} disabled={count === 0}>
          Show {count.toLocaleString('en-US')}
        </button>
      </div>
      <p>
        {suggestion.why}
        {suggestion.principle && <span className="principle"> · {suggestion.principle}</span>}
      </p>
    </div>
  );
}
