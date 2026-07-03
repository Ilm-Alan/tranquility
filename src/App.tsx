import { useEffect, useMemo, useState } from 'react';
import { loadCatalog, type Catalog } from './lib/catalog';
import { emptyPlan, runPlan, tokenize, type SortKey } from './lib/engine';
import { ItemCard } from './components/ItemCard';

const PAGE_SIZE = 96;

const SORT_LABELS: Record<SortKey, string> = {
  trust: 'Most trusted',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  newest: 'Newest',
};

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queryText, setQueryText] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('trust');

  useEffect(() => {
    loadCatalog().then(setCatalog, (e: Error) => setLoadError(e.message));
  }, []);

  const plan = useMemo(
    () => ({ ...emptyPlan(), terms: tokenize(queryText), categories, inStockOnly, sort }),
    [queryText, categories, inStockOnly, sort],
  );

  const results = useMemo(
    () => (catalog ? runPlan(catalog.items, plan) : []),
    [catalog, plan],
  );

  // Render in pages of 96 to keep the DOM light; the count stays honest.
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => setLimit(PAGE_SIZE), [plan]);
  const visible = results.slice(0, limit);

  const toggleCategory = (c: string) =>
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  const clearAll = () => {
    setQueryText('');
    setCategories([]);
    setInStockOnly(false);
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

  const filtered = queryText !== '' || categories.length > 0 || inStockOnly;

  return (
    <main className="page">
      <header className="masthead">
        <h1>Downshift</h1>
        <p>Home goods catalog · {catalog.items.length.toLocaleString('en-US')} items</p>
      </header>

      <section className="controls" aria-label="Search and filters">
        <div className="controls-row">
          <input
            type="search"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search the catalog"
            aria-label="Search the catalog"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort results"
          >
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="controls-row chips">
          {catalog.categories.map((c) => (
            <button
              key={c}
              type="button"
              className={categories.includes(c) ? 'chip chip-active' : 'chip'}
              aria-pressed={categories.includes(c)}
              onClick={() => toggleCategory(c)}
            >
              {c}
            </button>
          ))}
          <label className="chip chip-toggle">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
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
