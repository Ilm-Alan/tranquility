import { useEffect, useMemo, useState } from 'react';
import { loadCatalog, type Availability, type Catalog } from './lib/catalog';
import { emptyPlan, expandTerms, runPlan, tokenize, type QueryPlan, type SortKey } from './lib/engine';
import { checkAssistant } from './lib/llm';
import { ItemCard } from './components/ItemCard';
import { Assistant } from './components/Assistant';

const PAGE_SIZE = 96;

const SORT_LABELS: Record<SortKey, string> = {
  trust: 'Top reviewed',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  newest: 'Newest',
};

const RATING_STEPS = [3, 3.5, 4, 4.5];
const REVIEW_STEPS = [50, 200, 1000];

const AVAILABILITY_CELLS: { key: Availability; label: string }[] = [
  { key: 'now', label: 'In stock' },
  { key: 'soon', label: 'Coming soon' },
  { key: 'out', label: 'Sold out' },
];

const usd = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  });

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queryText, setQueryText] = useState('');
  const [plan, setPlan] = useState<QueryPlan>(emptyPlan());
  const [online, setOnline] = useState(false);

  useEffect(() => {
    loadCatalog().then(setCatalog, (e: Error) => setLoadError(e.message));
    checkAssistant().then(setOnline);
  }, []);

  const results = useMemo(
    () => (catalog ? runPlan(catalog.items, plan) : []),
    [catalog, plan],
  );

  // Render in pages of 96 to keep the DOM light; the count stays honest.
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => setLimit(PAGE_SIZE), [plan]);
  const visible = results.slice(0, limit);

  // The search box is instant keyword search, nothing else; the assistant
  // lives in the sidebar and applies plans through the same state. Terms are
  // resolved against the catalog's vocabulary so plurals and one-letter typos
  // still land ("towels", "towles" -> "towel").
  const setQuery = (text: string) => {
    setQueryText(text);
    if (!catalog) return;
    setPlan((p) => ({ ...p, terms: expandTerms(catalog.vocabulary, tokenize(text)) }));
  };

  const patchPlan = (patch: Partial<QueryPlan>) => setPlan((p) => ({ ...p, ...patch }));

  const toggleCategory = (c: string) =>
    patchPlan({
      categories: plan.categories.includes(c)
        ? plan.categories.filter((x) => x !== c)
        : [...plan.categories, c],
    });

  // At least one availability state stays on; a zero-state view means nothing.
  const toggleAvailability = (a: Availability) => {
    const next = plan.availability.includes(a)
      ? plan.availability.filter((x) => x !== a)
      : [...plan.availability, a];
    if (next.length > 0) patchPlan({ availability: next });
  };

  const availabilityCounts = useMemo(() => {
    const counts = { now: 0, soon: 0, out: 0 };
    for (const i of catalog?.items ?? []) counts[i.availability]++;
    return counts;
  }, [catalog]);

  const clearAll = () => {
    setQueryText('');
    setPlan(emptyPlan());
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

  // Chips for plan fields that have no dedicated control. Term chips appear
  // only when the box is empty (terms applied by the assistant); while typing,
  // the box itself is the display.
  const chips: { label: string; remove: () => void }[] = [
    ...(queryText.trim() === ''
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
  ];

  const defaultAvailability =
    plan.availability.length === 2 &&
    plan.availability.includes('now') &&
    plan.availability.includes('soon');

  const filtered =
    queryText.trim() !== '' ||
    chips.length > 0 ||
    plan.categories.length > 0 ||
    plan.minRating !== null ||
    plan.minReviews !== null ||
    !defaultAvailability;

  return (
    <main className="page">
      <header className="masthead">
        <h1 className="wordmark">tranquility</h1>
      </header>

      <div className="layout">
        <div className="main-col">
          <section className="controls" aria-label="Search and filters">
            <form className="controls-row" onSubmit={(e) => e.preventDefault()}>
              <input
                type="search"
                value={queryText}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the catalog"
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
            <div className="cat-rail" role="group" aria-label="Categories">
              {catalog.categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={plan.categories.includes(c) ? 'cat-cell cat-active' : 'cat-cell'}
                  aria-pressed={plan.categories.includes(c)}
                  onClick={() => toggleCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="toolbar">
              <p className="result-count" aria-live="polite">
                {results.length.toLocaleString('en-US')} of{' '}
                {catalog.items.length.toLocaleString('en-US')} items
                {filtered && (
                  <button type="button" className="clear" onClick={clearAll}>
                    Clear all
                  </button>
                )}
              </p>
              <div className="toolbar-filters">
                <select
                  className="filter-select"
                  value={plan.minRating ?? ''}
                  onChange={(e) =>
                    patchPlan({ minRating: e.target.value === '' ? null : Number(e.target.value) })
                  }
                  aria-label="Minimum rating"
                >
                  <option value="">Any rating</option>
                  {RATING_STEPS.map((r) => (
                    <option key={r} value={r}>
                      Rated {r}+
                    </option>
                  ))}
                </select>
                <select
                  className="filter-select"
                  value={plan.minReviews ?? ''}
                  onChange={(e) =>
                    patchPlan({ minReviews: e.target.value === '' ? null : Number(e.target.value) })
                  }
                  aria-label="Minimum review count"
                >
                  <option value="">Any review count</option>
                  {REVIEW_STEPS.map((r) => (
                    <option key={r} value={r}>
                      {r.toLocaleString('en-US')}+ reviews
                    </option>
                  ))}
                </select>
                <div className="avail-rail" role="group" aria-label="Availability">
                  {AVAILABILITY_CELLS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      className={
                        plan.availability.includes(key)
                          ? 'avail-cell avail-active'
                          : 'avail-cell'
                      }
                      aria-pressed={plan.availability.includes(key)}
                      onClick={() => toggleAvailability(key)}
                    >
                      {label} {availabilityCounts[key].toLocaleString('en-US')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
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
        </div>

        <Assistant
          catalog={catalog}
          online={online}
          onShowPlan={(p) => {
            setPlan(p);
            setQueryText('');
          }}
        />
      </div>
    </main>
  );
}
