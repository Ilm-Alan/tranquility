// The deterministic engine. Everything that can change the result set - typed
// keywords, clicked filters, and (later) the AI's reading of a request - compiles
// to the same QueryPlan, and this module is the only thing that executes one.

import type { Item } from './catalog';

export type SortKey = 'trust' | 'price-asc' | 'price-desc' | 'newest';

export interface QueryPlan {
  terms: string[];
  categories: string[];
  brands: string[];
  tags: string[];
  priceMin: number | null;
  priceMax: number | null;
  minRating: number | null;
  inStockOnly: boolean;
  sort: SortKey;
}

export function emptyPlan(): QueryPlan {
  return {
    terms: [],
    categories: [],
    brands: [],
    tags: [],
    priceMin: null,
    priceMax: null,
    minRating: null,
    inStockOnly: false,
    sort: 'trust',
  };
}

export function tokenize(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function matches(item: Item, plan: QueryPlan): boolean {
  if (plan.terms.some((t) => !item.searchText.includes(t))) return false;
  if (plan.categories.length && !plan.categories.includes(item.category)) return false;
  if (plan.brands.length && !plan.brands.includes(item.brand)) return false;
  if (plan.tags.length && !plan.tags.some((t) => item.tags.includes(t))) return false;
  // Price bounds exclude unknown prices: an item we can't price doesn't
  // qualify for "under $50", and a rating floor needs actual reviews.
  if (plan.priceMin !== null && (item.price === null || item.price < plan.priceMin)) return false;
  if (plan.priceMax !== null && (item.price === null || item.price > plan.priceMax)) return false;
  if (plan.minRating !== null && (!item.reviewed || (item.rating as number) < plan.minRating)) return false;
  if (plan.inStockOnly && !item.inStock) return false;
  return true;
}

const comparators: Record<SortKey, (a: Item, b: Item) => number> = {
  trust: (a, b) => b.trust - a.trust || b.reviews - a.reviews,
  'price-asc': (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
  'price-desc': (a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity),
  newest: (a, b) => b.releasedAt.localeCompare(a.releasedAt),
};

export function runPlan(items: Item[], plan: QueryPlan): Item[] {
  const compare = comparators[plan.sort];
  return items
    .filter((i) => matches(i, plan))
    .sort(
      // Sold-out items stay findable but never outrank what you can buy today.
      (a, b) => Number(b.inStock) - Number(a.inStock) || compare(a, b),
    );
}

// If a model-built plan matches nothing, drop its least important terms until
// it matches - all the way to none, since the structured filters still express
// the request. Whatever ran is what the UI shows.
export function relaxPlan(items: Item[], plan: QueryPlan): QueryPlan {
  let candidate = plan;
  while (candidate.terms.length > 0 && runPlan(items, candidate).length === 0) {
    candidate = { ...candidate, terms: candidate.terms.slice(0, -1) };
  }
  return candidate;
}
