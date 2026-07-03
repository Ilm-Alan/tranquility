import { useEffect, useMemo, useState } from 'react';
import { loadCatalog, type Catalog } from './lib/catalog';
import { emptyPlan, runPlan, tokenize, type QueryPlan, type SortKey } from './lib/engine';
import {
  checkAssistant,
  interpretQuery,
  type AssistantStatus,
} from './lib/assistant';
import { ItemCard } from './components/ItemCard';

const PAGE_SIZE = 96;

const SORT_LABELS: Record<SortKey, string> = {
  trust: 'Most trusted',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  newest: 'Newest',
};

const usd = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  });

// If an interpreted plan matches nothing, drop its least important terms until
// it matches - all the way to none, since the structured filters still express
// the request. The chips always show exactly what ran.
function relaxPlan(plan: QueryPlan, catalog: Catalog): QueryPlan {
  let candidate = plan;
  while (candidate.terms.length > 0 && runPlan(catalog.items, candidate).length === 0) {
    candidate = { ...candidate, terms: candidate.terms.slice(0, -1) };
  }
  return candidate;
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queryText, setQueryText] = useState('');
  const [plan, setPlan] = useState<QueryPlan>(emptyPlan());
  const [status, setStatus] = useState<AssistantStatus>('offline');
  // After a successful interpretation the chips carry the state; typing then
  // drafts the next utterance instead of live-replacing the plan's terms.
  const [interpreted, setInterpreted] = useState(false);

  useEffect(() => {
    loadCatalog().then(setCatalog, (e: Error) => setLoadError(e.message));
    checkAssistant().then((ok) => setStatus(ok ? 'idle' : 'offline'));
  }, []);

  const results = useMemo(
    () => (catalog ? runPlan(catalog.items, plan) : []),
    [catalog, plan],
  );

  // Render in pages of 96 to keep the DOM light; the count stays honest.
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => setLimit(PAGE_SIZE), [plan]);
  const visible = results.slice(0, limit);

  const setQuery = (text: string) => {
    setQueryText(text);
    if (!interpreted) setPlan((p) => ({ ...p, terms: tokenize(text) }));
    if (status === 'failed') setStatus('idle');
  };

  const submitQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catalog || status === 'offline' || status === 'thinking') return;
    const query = queryText.trim();
    if (!query) return;
    setStatus('thinking');
    const next = await interpretQuery(query, catalog, plan, results);
    if (next) {
      setPlan(relaxPlan(next, catalog));
      setInterpreted(true);
      setQueryText('');
      setStatus('idle');
    } else {
      // Fall back to treating the words as plain keywords, and say so.
      setPlan((p) => ({ ...p, terms: tokenize(query) }));
      setInterpreted(false);
      setStatus('failed');
    }
  };

  const patchPlan = (patch: Partial<QueryPlan>) => setPlan((p) => ({ ...p, ...patch }));

  const toggleCategory = (c: string) =>
    patchPlan({
      categories: plan.categories.includes(c)
        ? plan.categories.filter((x) => x !== c)
        : [...plan.categories, c],
    });

  const clearAll = () => {
    setQueryText('');
    setPlan(emptyPlan());
    setInterpreted(false);
    if (status === 'failed') setStatus('idle');
  };

  if (loadError) {
    return (
      <main className="page">
        <p role="alert">Could not load the catalog: {loadError}</p>
      </main>
    );
  }
  if (!catalog) {
    return (
      <main className="page">
        <p>Loading the catalog…</p>
      </main>
    );
  }

  // Chips for the plan fields that have no dedicated control; category buttons
  // and the stock toggle already show their own state.
  // While typing keywords the box itself shows the terms; chips would jitter.
  // Term chips appear only once a plan came from interpretation.
  const chips: { label: string; remove: () => void }[] = [
    ...(interpreted
      ? plan.terms.map((t) => ({
          label: t,
          remove: () => patchPlan({ terms: plan.terms.filter((x) => x !== t) }),
        }))
      : []),
    ...plan.brands.map((b) => ({
      label: b,
      remove: () => patchPlan({ brands: plan.brands.filter((x) => x !== b) }),
    })),
    ...plan.tags.map((t) => ({
      label: `#${t}`,
      remove: () => patchPlan({ tags: plan.tags.filter((x) => x !== t) }),
    })),
    ...(plan.priceMin !== null
      ? [{ label: `Over ${usd(plan.priceMin)}`, remove: () => patchPlan({ priceMin: null }) }]
      : []),
    ...(plan.priceMax !== null
      ? [{ label: `Under ${usd(plan.priceMax)}`, remove: () => patchPlan({ priceMax: null }) }]
      : []),
    ...(plan.minRating !== null
      ? [{ label: `Rated ${plan.minRating}+`, remove: () => patchPlan({ minRating: null }) }]
      : []),
  ];

  const filtered =
    chips.length > 0 || plan.categories.length > 0 || plan.inStockOnly;

  return (
    <main className="page">
      <header className="masthead">
        <h1>Downshift</h1>
        <p>Home goods catalog · {catalog.items.length.toLocaleString('en-US')} items</p>
      </header>

      <section className="controls" aria-label="Search and filters">
        <form className="controls-row" onSubmit={submitQuery}>
          <input
            type="search"
            value={queryText}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              status === 'offline'
                ? 'Search the catalog'
                : interpreted
                  ? 'Refine ("cheaper", "more like the second one") or start a new search'
                  : 'Search, or describe what you need — "warm light for a reading nook under $100"'
            }
            aria-label="Search the catalog"
          />
          <select
            value={plan.sort}
            onChange={(e) => patchPlan({ sort: e.target.value as SortKey })}
            aria-label="Sort results"
          >
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </form>
        <p className="assistant-status" aria-live="polite">
          {status === 'offline' && 'Assistant offline. Keyword search is active.'}
          {status === 'thinking' && 'Interpreting your request… keyword matches shown meanwhile.'}
          {status === 'failed' && 'Could not interpret that. Showing keyword matches.'}
          {status === 'idle' && ' '}
        </p>
        {chips.length > 0 && (
          <div className="controls-row chips" aria-label="Active constraints">
            {chips.map(({ label, remove }) => (
              <button
                key={label}
                type="button"
                className="chip chip-plan"
                onClick={remove}
                title="Remove this constraint"
              >
                {label} ×
              </button>
            ))}
          </div>
        )}
        <div className="controls-row chips">
          {catalog.categories.map((c) => (
            <button
              key={c}
              type="button"
              className={plan.categories.includes(c) ? 'chip chip-active' : 'chip'}
              aria-pressed={plan.categories.includes(c)}
              onClick={() => toggleCategory(c)}
            >
              {c}
            </button>
          ))}
          <label className="chip chip-toggle">
            <input
              type="checkbox"
              checked={plan.inStockOnly}
              onChange={(e) => patchPlan({ inStockOnly: e.target.checked })}
            />
            In stock only
          </label>
        </div>
        <p className="result-count" aria-live="polite">
          {results.length.toLocaleString('en-US')} of{' '}
          {catalog.items.length.toLocaleString('en-US')} items
          {filtered && (
            <button type="button" className="clear" onClick={clearAll}>
              Clear all
            </button>
          )}
        </p>
      </section>

      {results.length > 0 ? (
        <>
          <section className="grid" aria-label="Results">
            {visible.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </section>
          {results.length > limit && (
            <p className="show-more">
              <button type="button" onClick={() => setLimit(limit + PAGE_SIZE)}>
                Show {Math.min(PAGE_SIZE, results.length - limit)} more of{' '}
                {(results.length - limit).toLocaleString('en-US')} remaining
              </button>
            </p>
          )}
        </>
      ) : (
        <section className="empty">
          <p>Nothing matches that combination.</p>
          <button type="button" onClick={clearAll}>
            Clear search and filters
          </button>
        </section>
      )}
    </main>
  );
}
