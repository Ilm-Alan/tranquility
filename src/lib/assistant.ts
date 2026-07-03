// The search box's AI: a natural-language request becomes a QueryPlan via one
// structured call. The model never returns products - it returns a plan the
// deterministic engine executes. Any failure degrades to keyword search.

import type { Catalog, Item } from './catalog';
import { emptyPlan, type QueryPlan, type SortKey } from './engine';
import { structuredCall } from './llm';

export type AssistantStatus = 'offline' | 'idle' | 'thinking' | 'failed';
export { checkAssistant } from './llm';

const SORT_KEYS: SortKey[] = ['trust', 'price-asc', 'price-desc', 'newest'];

export function planSchema(catalog: Catalog): object {
  return {
    type: 'object',
    properties: {
      terms: {
        type: 'array',
        items: { type: 'string' },
        description:
          '0-4 single lowercase keywords, most important first, drawn from the catalog vocabulary. AND-matched substrings: extra terms shrink results.',
      },
      categories: { type: 'array', items: { type: 'string', enum: catalog.categories } },
      brands: { type: 'array', items: { type: 'string', enum: catalog.brands } },
      tags: { type: 'array', items: { type: 'string', enum: catalog.tags } },
      priceMin: { type: ['number', 'null'], description: 'USD lower bound, only if stated' },
      priceMax: { type: ['number', 'null'], description: 'USD upper bound, only if stated' },
      minRating: {
        type: ['number', 'null'],
        description: 'Only when the shopper asks for well-reviewed items; 3.0-5.0',
      },
      inStockOnly: { type: 'boolean' },
      sort: {
        type: 'string',
        enum: SORT_KEYS,
        description: 'trust unless asked otherwise; price-asc for "cheapest", newest for "new"',
      },
    },
    required: ['terms', 'categories', 'brands', 'tags', 'priceMin', 'priceMax', 'minRating', 'inStockOnly', 'sort'],
  };
}

// Strict whitelist against the real catalog. Filters invalid values; never
// invents or reshapes. A plan that filters down to nothing stays nothing.
export function validatePlan(input: unknown, catalog: Catalog): QueryPlan {
  const raw = (input ?? {}) as Record<string, unknown>;
  const plan = emptyPlan();

  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const bound = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

  plan.categories = strings(raw.categories).filter((c) => catalog.categories.includes(c));
  plan.brands = strings(raw.brands).filter((b) => catalog.brands.includes(b));
  plan.tags = strings(raw.tags).filter((t) => catalog.tags.includes(t));
  plan.terms = [...new Set(
    strings(raw.terms)
      .map((t) => t.toLowerCase().trim())
      .filter((t) => t !== '' && !t.includes(' ') && !plan.tags.includes(t)),
  )].slice(0, 4);
  plan.priceMin = bound(raw.priceMin);
  plan.priceMax = bound(raw.priceMax);
  const rating = bound(raw.minRating);
  plan.minRating = rating !== null ? Math.min(5, Math.max(3, rating)) : null;
  plan.inStockOnly = raw.inStockOnly === true;
  plan.sort = SORT_KEYS.includes(raw.sort as SortKey) ? (raw.sort as SortKey) : 'trust';
  return plan;
}

function vocabulary(catalog: Catalog): string {
  return [
    `Categories: ${catalog.categories.join(', ')}.`,
    `Brands: ${catalog.brands.join(', ')}.`,
    `Tags: ${catalog.tags.join(', ')}.`,
  ].join('\n');
}

// Enough context to refine against, cheap enough to send every time.
function resultsContext(results: Item[], plan: QueryPlan): string | null {
  if (results.length === 0 && plan.terms.length === 0) return null;
  const top = results.slice(0, 8).map(
    (r, i) =>
      `${i + 1}. ${r.title} (${r.category}, ${r.brand}, tags: ${r.tags.join('/')}, ` +
      `${r.price !== null ? `$${r.price}` : 'price unknown'})`,
  );
  return [
    `Current plan: ${JSON.stringify(plan)}`,
    `Top results now: ${top.length ? '' : '(none)'}`,
    ...top,
  ].join('\n');
}

export async function interpretQuery(
  query: string,
  catalog: Catalog,
  currentPlan: QueryPlan,
  currentResults: Item[],
): Promise<QueryPlan | null> {
  const system = [
    'You translate a shopper request into a structured query plan for a home goods catalog.',
    'You do not know individual products; a deterministic engine runs your plan over real data.',
    vocabulary(catalog),
    'Prefer tags and categories over free terms. Translate only stated constraints: "under $50" is priceMax 50; "cheap" alone is sort price-asc, not a price bound.',
    'When a current plan is given, decide: a refinement ("cheaper", "in oak instead", "more like the second one") mutates that plan; a new request replaces it.',
  ].join('\n');

  const context = resultsContext(currentResults, currentPlan);
  const plan = await structuredCall(
    system,
    planSchema(catalog),
    [{ role: 'user', content: context ? `${context}\n\nShopper: ${query}` : query }],
    (raw) => (raw && typeof raw === 'object' ? validatePlan(raw, catalog) : null),
  );
  if (!plan) return null;
  // A plan with no constraints at all means the model gave us nothing usable.
  const hasConstraint =
    plan.terms.length > 0 || plan.tags.length > 0 || plan.categories.length > 0 ||
    plan.brands.length > 0 || plan.priceMin !== null || plan.priceMax !== null ||
    plan.minRating !== null || plan.inStockOnly;
  return hasConstraint ? plan : null;
}
