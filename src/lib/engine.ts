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
  minReviews: number | null;
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
    minReviews: null,
    inStockOnly: true, // shoppers see what they can buy; sold-out is opt-in
    sort: 'trust',
  };
}

export function tokenize(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

// Fuzzy resolution against the catalog's own vocabulary, cheapest rule first:
// a token that already matches somewhere is kept; a plural is stripped until
// it matches ("towels" -> "towel"); a typo is replaced by the unique-ish
// nearest vocabulary word one edit away ("towles" -> "towel"). Deterministic,
// and it can only ever map to words that actually occur in the data.
export function expandTerms(vocabulary: string[], terms: string[]): string[] {
  const occurs = (w: string) => vocabulary.some((v) => v.includes(w));

  return terms.map((term) => {
    // Lightest stem first so "towles" tries "towle" before "towl".
    const forms = [term];
    if (term.endsWith('ies') && term.length > 4) forms.push(`${term.slice(0, -3)}y`);
    if (term.endsWith('s') && !term.endsWith('ss') && term.length > 3) {
      forms.push(term.slice(0, -1));
    }
    if (term.endsWith('es') && term.length > 4) forms.push(term.slice(0, -2));
    for (const f of forms) if (occurs(f)) return f;

    for (const f of forms) {
      if (f.length < 4) continue;
      const near = vocabulary.filter((v) => withinOneEdit(f, v));
      if (near.length > 0) {
        // Typos rarely hit the first letter; prefer words that keep it.
        near.sort(
          (a, b) =>
            Number(a[0] !== f[0]) - Number(b[0] !== f[0]) ||
            Math.abs(a.length - f.length) - Math.abs(b.length - f.length) ||
            a.localeCompare(b),
        );
        return near[0];
      }
    }
    return term; // matches nothing; the empty result stays honest
  });
}

// Optimal-string-alignment distance <= 1: one insertion, deletion,
// substitution, or adjacent transposition ("towle" -> "towel").
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const diff = a.length - b.length;
  if (Math.abs(diff) > 1) return false;

  if (diff !== 0) {
    const [short, long] = diff < 0 ? [a, b] : [b, a];
    let i = 0;
    while (i < short.length && short[i] === long[i]) i++;
    return short.slice(i) === long.slice(i + 1); // one indel
  }

  let first = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      first = i;
      break;
    }
  }
  if (first === -1) return true;
  if (a.slice(first + 1) === b.slice(first + 1)) return true; // substitution
  return (
    a[first] === b[first + 1] &&
    a[first + 1] === b[first] &&
    a.slice(first + 2) === b.slice(first + 2) // adjacent transposition
  );
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
  if (plan.minReviews !== null && item.reviews < plan.minReviews) return false;
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
