// Data layer: loads items.json and normalizes its (deliberate) dirt once, up front.
// Raw values are never rendered directly; every field the UI shows comes from here.

export interface RawItem {
  id: number;
  title: string;
  brand: string;
  category: string;
  tags: string[];
  price: number | string | null;
  rating: number | null;
  reviews: number;
  inStock: boolean;
  releasedAt: string;
  image: string | null;
  imageWidth: number;
  imageHeight: number;
  description: string;
}

// One availability state per item: a future release is 'soon' whatever its
// stock flag says (you can't be sold out of something that isn't out).
export type Availability = 'now' | 'soon' | 'out';

export interface Item {
  id: number;
  title: string; // display-cleaned; raw title stays in searchText
  brand: string;
  category: string;
  tags: string[];
  price: number | null; // null = unknown (covers null, 0, and unparseable strings)
  rating: number | null;
  reviews: number;
  reviewed: boolean; // false when rating is null OR reviews is 0
  inStock: boolean;
  releasedAt: string;
  availability: Availability;
  image: string | null;
  description: string;
  searchText: string;
  trust: number;
}

export interface Catalog {
  items: Item[];
  categories: string[];
  brands: string[];
  tags: string[];
  vocabulary: string[]; // every word that appears anywhere searchable
  priorRating: number; // catalog-wide mean over reviewed items
}

// A zero or unknown price both mean "we can't tell you the price"; $0.00 is a lie.
function parsePrice(raw: RawItem['price']): number | null {
  if (raw === null) return null;
  const n = typeof raw === 'string' ? Number(raw.replace(/,/g, '')) : raw;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Some titles arrive padded and ALL CAPS or all lowercase; fix for display only.
function cleanTitle(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (t !== t.toUpperCase() && t !== t.toLowerCase()) return t;
  return t
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

// How many average-rated reviews it takes to pull an item's score to its own
// rating. Raw ratings only span 3.0-5.0 here, so review depth is the signal.
const TRUST_WEIGHT = 25;

export function normalize(raw: RawItem[], now = new Date()): Catalog {
  const today = now.toISOString().slice(0, 10);

  // A rating with zero reviews is a score nobody gave; treat it as unreviewed.
  const reviewed = raw.filter((r) => r.rating !== null && r.reviews > 0);
  const priorRating =
    reviewed.reduce((sum, r) => sum + (r.rating as number), 0) / reviewed.length;

  const items = raw.map((r): Item => {
    const isReviewed = r.rating !== null && r.reviews > 0;
    return {
      id: r.id,
      title: cleanTitle(r.title),
      brand: r.brand,
      category: r.category,
      tags: r.tags,
      price: parsePrice(r.price),
      rating: isReviewed ? r.rating : null,
      reviews: r.reviews,
      reviewed: isReviewed,
      inStock: r.inStock,
      releasedAt: r.releasedAt,
      availability: r.releasedAt > today ? 'soon' : r.inStock ? 'now' : 'out',
      image: r.image,
      description: r.description,
      searchText: [r.title, r.brand, r.category, r.tags.join(' '), r.description]
        .join(' ')
        .toLowerCase(),
      trust: isReviewed
        ? (r.reviews * (r.rating as number) + TRUST_WEIGHT * priorRating) /
          (r.reviews + TRUST_WEIGHT)
        : priorRating,
    };
  });

  const uniqueSorted = (values: string[]) => [...new Set(values)].sort();

  return {
    items,
    categories: uniqueSorted(items.map((i) => i.category)),
    brands: uniqueSorted(items.map((i) => i.brand)),
    tags: uniqueSorted(items.flatMap((i) => i.tags)),
    vocabulary: uniqueSorted(
      items.flatMap((i) => i.searchText.split(/[^a-z0-9]+/)).filter((w) => w.length >= 3),
    ),
    priorRating,
  };
}

export async function loadCatalog(): Promise<Catalog> {
  const res = await fetch('/items.json');
  if (!res.ok) throw new Error(`Failed to load catalog: ${res.status}`);
  return normalize((await res.json()) as RawItem[]);
}
