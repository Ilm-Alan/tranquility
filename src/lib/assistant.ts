// Client side of the AI layer. The model never returns products - it returns a
// QueryPlan via tool call, which the engine executes like any hand-built one.
// Every function here degrades to null; the caller falls back to keyword search.

import type { Catalog, Item } from './catalog';
import { emptyPlan, type QueryPlan, type SortKey } from './engine';

export type AssistantStatus = 'offline' | 'idle' | 'thinking' | 'failed';

const SORT_KEYS: SortKey[] = ['trust', 'price-asc', 'price-desc', 'newest'];

export async function checkAssistant(): Promise<boolean> {
  try {
    const res = await fetch('/api/assistant');
    return res.ok && (await res.json()).configured === true;
  } catch {
    return false;
  }
}

function planTool(catalog: Catalog) {
  return {
    name: 'set_query_plan',
    description:
      'Translate the shopper request into a catalog query plan. Always answer with this tool.',
    input_schema: {
      type: 'object',
      properties: {
        terms: {
          type: 'array',
          items: { type: 'string' },
          description:
            '0-4 single lowercase keywords, most important first. Use words from the catalog vocabulary (tags, materials, product kinds). Never invent constraints the shopper did not state.',
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
          description:
            'trust unless the shopper asks otherwise; price-asc for "cheapest", newest for "new"',
        },
      },
      required: ['terms'],
    },
  };
}

function systemPrompt(catalog: Catalog): string {
  return [
    'You translate a shopper request into a structured query plan for a home goods catalog.',
    'You do not know individual products; a deterministic engine runs your plan over real data.',
    `Categories: ${catalog.categories.join(', ')}.`,
    `Brands: ${catalog.brands.join(', ')}.`,
    `Tags: ${catalog.tags.join(', ')}.`,
    'Prefer tags and categories over free terms. Terms are AND-matched substrings, so extra or compound terms shrink results; keep them few and single-word.',
    'Translate only stated constraints. "Under $50" is priceMax 50; "cheap" alone is sort price-asc, not a price bound.',
    'When a current plan is given, decide: a refinement ("cheaper", "in oak instead", "more like the second one") mutates that plan; a new request replaces it.',
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

// The endpoint has no tool_choice, so treat the model as untrusted input:
// whitelist every field against the real catalog and normalize shapes.
export function normalizePlan(input: unknown, catalog: Catalog): QueryPlan {
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
      .flatMap((t) => t.toLowerCase().split(/\s+/))
      .filter((t) => t && !plan.tags.includes(t)), // a chosen tag already covers it
  )].slice(0, 5);
  plan.priceMin = bound(raw.priceMin);
  plan.priceMax = bound(raw.priceMax);
  const rating = bound(raw.minRating);
  plan.minRating = rating !== null ? Math.min(5, Math.max(3, rating)) : null;
  plan.inStockOnly = raw.inStockOnly === true;
  plan.sort = SORT_KEYS.includes(raw.sort as SortKey) ? (raw.sort as SortKey) : 'trust';
  return plan;
}

interface ContentBlock {
  type: string;
  name?: string;
  input?: unknown;
}

export async function interpretQuery(
  query: string,
  catalog: Catalog,
  currentPlan: QueryPlan,
  currentResults: Item[],
): Promise<QueryPlan | null> {
  try {
    const context = resultsContext(currentResults, currentPlan);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        system: systemPrompt(catalog),
        tools: [planTool(catalog)],
        messages: [
          {
            role: 'user',
            content: context ? `${context}\n\nShopper: ${query}` : query,
          },
        ],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: ContentBlock[] };
    const call = data.content?.find(
      (b) => b.type === 'tool_use' && b.name === 'set_query_plan',
    );
    return call ? normalizePlan(call.input, catalog) : null;
  } catch {
    return null;
  }
}
