// A compact, deterministic digest of everything aggregate the catalog can
// teach the assistant: price landscape, brand personalities, category depth,
// standout products, arrivals. Computed once per catalog; every number the
// model quotes from here is real.

import type { Catalog, Item } from './catalog';

const cache = new WeakMap<Catalog, string>();

const money = (n: number) => `$${Math.round(n)}`;

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.floor(p * (sorted.length - 1))];
}

function prices(items: Item[]): number[] {
  return items
    .map((i) => i.price)
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);
}

function topCounts(values: string[], k: number): string[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, k)
    .map(([v]) => v);
}

function standout(items: Item[]): Item | null {
  const reviewed = items.filter((i) => i.reviewed && i.inStock);
  if (reviewed.length === 0) return null;
  return reviewed.reduce((best, i) => (i.trust > best.trust ? i : best));
}

function describe(item: Item): string {
  return `${item.title} (${(item.rating as number).toFixed(1)} from ${item.reviews.toLocaleString('en-US')} reviews${item.price !== null ? `, ${money(item.price)}` : ''})`;
}

export function catalogDigest(catalog: Catalog): string {
  const cached = cache.get(catalog);
  if (cached) return cached;

  const { items } = catalog;
  const today = new Date().toISOString().slice(0, 10);
  const all = prices(items);
  const inStock = items.filter((i) => i.inStock).length;
  const unreviewed = items.filter((i) => !i.reviewed).length;
  const comingSoon = items.filter((i) => i.comingSoon).length;

  const lines: string[] = [
    `Catalog: ${items.length} items, ${inStock} in stock, ${comingSoon} marked coming soon, ${unreviewed} with no reviews yet.`,
    `Prices overall: typical ${money(quantile(all, 0.5))}, budget tier under ${money(quantile(all, 0.2))}, premium tier over ${money(quantile(all, 0.8))}. This catalog runs expensive; respect the shopper's numbers, not normal retail instincts.`,
  ];

  lines.push('', 'Categories:');
  for (const c of catalog.categories) {
    const catItems = items.filter((i) => i.category === c);
    const p = prices(catItems);
    const tags = topCounts(catItems.flatMap((i) => i.tags), 5).join(', ');
    const brand = topCounts(catItems.map((i) => i.brand), 1)[0];
    const best = standout(catItems);
    lines.push(
      `- ${c}: ${catItems.length} items, typical ${money(quantile(p, 0.5))} (${money(quantile(p, 0.1))}-${money(quantile(p, 0.9))}). Common: ${tags}. Deepest brand: ${brand}.${best ? ` Standout: ${describe(best)}.` : ''}`,
    );
  }

  lines.push('', 'Brands:');
  for (const b of catalog.brands) {
    const brandItems = items.filter((i) => i.brand === b);
    const p = prices(brandItems);
    const cats = topCounts(brandItems.map((i) => i.category), 2).join('/');
    lines.push(
      `- ${b}: ${brandItems.length} items, typical ${money(quantile(p, 0.5))}, strongest in ${cats}.`,
    );
  }

  const recent = items
    .filter((i) => !i.comingSoon && i.releasedAt > shiftDate(today, -120))
    .length;
  lines.push(
    '',
    `Arrivals: ${recent} items released in the last four months; "newest" sort surfaces them. Coming-soon items are browsable but not yet buyable.`,
  );

  const digest = lines.join('\n');
  cache.set(catalog, digest);
  return digest;
}

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
