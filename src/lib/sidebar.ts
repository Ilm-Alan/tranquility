// The design assistant that lives in the sidebar. Text-first: "I'm thinking of
// redesigning my garage" is a complete input; a photo is an optional upgrade
// that adds a structured read of the space. Every turn is one structured call
// returning {reply, space, suggestions}; suggestion search fields are
// whitelisted against the real catalog and executed by the engine, so every
// product shown is real. The model invents nothing the validator would keep.

import type { Catalog } from './catalog';
import { emptyPlan, type QueryPlan, type SortKey } from './engine';
import { DESIGN_CORPUS, type DesignPrinciple } from './designCorpus';
import { structuredCall, type ChatMessage } from './llm';

const SORT_KEYS: SortKey[] = ['trust', 'price-asc', 'price-desc', 'newest'];

// Strict whitelist against the real catalog. Filters invalid values; never
// invents or reshapes. A plan that filters down to nothing stays nothing.
export function validatePlan(input: unknown, catalog: Catalog): QueryPlan {
  const raw = (input ?? {}) as Record<string, unknown>;
  const plan = emptyPlan();

  const asStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const bound = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

  plan.categories = asStrings(raw.categories).filter((c) => catalog.categories.includes(c));
  plan.brands = asStrings(raw.brands).filter((b) => catalog.brands.includes(b));
  plan.tags = asStrings(raw.tags).filter((t) => catalog.tags.includes(t));
  plan.terms = [...new Set(
    asStrings(raw.terms)
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

export interface SpaceRead {
  room: string;
  style: string;
  light: string;
  palette: string[];
  materials: string[];
  gaps: string[];
}

export interface Suggestion {
  title: string;
  why: string;
  principle: string | null;
  plan: QueryPlan;
}

export interface ConsultResult {
  reply: string;
  space: SpaceRead | null;
  suggestions: Suggestion[];
  followups: string[];
}

// Lexical retrieval over the authored corpus. Deterministic and inspectable;
// at 18 entries this beats embedding infrastructure nobody would see working.
export function retrievePrinciples(text: string, k = 4): DesignPrinciple[] {
  const tokens = new Set(text.toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2));
  const scored = DESIGN_CORPUS.map((p) => {
    let score = 0;
    for (const t of tokens) {
      if (p.keywords.some((kw) => kw.startsWith(t) || t.startsWith(kw))) score += 3;
      if (p.name.toLowerCase().includes(t)) score += 2;
      if (p.body.toLowerCase().includes(t)) score += 1;
    }
    return { p, score };
  }).sort((a, b) => b.score - a.score);

  const hits = scored.filter((s) => s.score > 0).slice(0, k).map((s) => s.p);
  for (const fallbackId of ['layered-lighting', 'anchor-piece', 'sixty-thirty-ten']) {
    if (hits.length >= 3) break;
    const p = DESIGN_CORPUS.find((c) => c.id === fallbackId) as DesignPrinciple;
    if (!hits.includes(p)) hits.push(p);
  }
  return hits;
}

function consultSchema(catalog: Catalog, principles: DesignPrinciple[]): object {
  return {
    type: 'object',
    properties: {
      reply: {
        type: 'string',
        description: 'Short plain-text conversational reply to the shopper. No markdown.',
      },
      space: {
        type: ['object', 'null'],
        description: 'ONLY when a photo is attached to the latest message: what is visible in it. Otherwise null.',
        properties: {
          room: { type: 'string' },
          style: { type: 'string' },
          light: { type: 'string' },
          palette: { type: 'array', items: { type: 'string' } },
          materials: { type: 'array', items: { type: 'string' } },
          gaps: {
            type: 'array',
            items: { type: 'string' },
            description: '2-4 concrete gaps or opportunities grounded in what is visible',
          },
        },
        required: ['room', 'style', 'light', 'palette', 'materials', 'gaps'],
      },
      suggestions: {
        type: ['array', 'null'],
        description: 'Catalog searches worth showing, most impactful first; null when the turn does not call for product suggestions.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short shopper-facing label' },
            why: { type: 'string', description: 'One sentence tying it to the space or request' },
            principle: {
              type: ['string', 'null'],
              enum: [...principles.map((p) => p.name), null],
              description: 'The provided design principle this applies, if one fits',
            },
            tags: { type: 'array', items: { type: 'string', enum: catalog.tags } },
            categories: { type: 'array', items: { type: 'string', enum: catalog.categories } },
            terms: {
              type: 'array',
              items: { type: 'string' },
              description: '0-2 extra single lowercase keywords, only if no tag fits',
            },
            priceMax: { type: ['number', 'null'] },
            inStockOnly: { type: 'boolean' },
          },
          required: ['title', 'why', 'principle', 'tags', 'categories', 'terms', 'priceMax', 'inStockOnly'],
        },
      },
      followups: {
        type: ['array', 'null'],
        items: { type: 'string' },
        description:
          '2-4 short options the shopper could tap as their next message: direct answers to any question you asked, or natural next steps. Each under 8 words, first person ("It\'s a small powder room"). null only if nothing sensible.',
      },
    },
    required: ['reply', 'space', 'suggestions', 'followups'],
  };
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function validateSpace(raw: unknown): SpaceRead | null {
  if (raw === null || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.room !== 'string' || s.room === '') return null;
  return {
    room: s.room,
    style: typeof s.style === 'string' ? s.style : '',
    light: typeof s.light === 'string' ? s.light : '',
    palette: strings(s.palette).slice(0, 6),
    materials: strings(s.materials).slice(0, 8),
    gaps: strings(s.gaps).slice(0, 5),
  };
}

function validateConsult(
  raw: unknown,
  catalog: Catalog,
  principles: DesignPrinciple[],
): ConsultResult | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.reply !== 'string') return null;
  const names = new Set(principles.map((p) => p.name));
  const suggestions = (Array.isArray(r.suggestions) ? r.suggestions : [])
    .map((s) => s as Record<string, unknown>)
    .filter((s) => typeof s.title === 'string' && s.title !== '' && typeof s.why === 'string')
    .map((s): Suggestion => ({
      title: s.title as string,
      why: s.why as string,
      principle:
        typeof s.principle === 'string' && names.has(s.principle) ? s.principle : null,
      plan: validatePlan(s, catalog),
    }))
    .filter(
      (s) =>
        s.plan.terms.length > 0 || s.plan.tags.length > 0 || s.plan.categories.length > 0,
    )
    .slice(0, 5);
  return {
    reply: r.reply,
    space: validateSpace(r.space),
    suggestions,
    followups: strings(r.followups)
      .map((f) => f.trim())
      .filter((f) => f !== '' && f.length <= 60)
      .slice(0, 4),
  };
}

export function consultSystem(
  catalog: Catalog,
  principles: DesignPrinciple[],
  space: SpaceRead | null,
  groundedContext: string,
): string {
  return [
    'You are the design assistant for a home goods catalog, embedded next to the search results. You help the shopper think about their space and find pieces for it. Keep replies short and plain-text.',
    'When the shopper describes a project or space - even vaguely ("redesigning my garage") - always include best-guess suggestions in the same turn. Ask a clarifying question in the reply if useful, but never instead of suggesting. Only leave suggestions null when the shopper is asking about products already shown.',
    'Suggestions must be SPECIFIC enough to shop from: one category plus the one or two most specific tags that fit (a suggestion matching a whole category is too broad). The shopper sees the top few products of each suggestion, ranked by trusted reviews.',
    'Hard rules: products, prices, ratings, and review counts exist ONLY as given in the provided context - cite those freely by name when comparing or answering, but never invent, guess, or extrapolate ones that are not provided. Product suggestions happen only through the suggestions field; a deterministic engine runs them over the real catalog. When you reference design ideas, use the provided principles by name; do not cite sources you were not given.',
    `Design principles retrieved for this conversation:\n${principles.map((p) => `- ${p.name}: ${p.body}`).join('\n')}`,
    `Catalog vocabulary for suggestion fields:\nCategories: ${catalog.categories.join(', ')}.\nTags: ${catalog.tags.join(', ')}.`,
    space ? `The shopper's space, read from their photo earlier: ${JSON.stringify(space)}` : '',
    groundedContext ? `Current suggestions and their top real products:\n${groundedContext}` : '',
  ].filter(Boolean).join('\n\n');
}

export async function consult(
  history: ChatMessage[],
  catalog: Catalog,
  space: SpaceRead | null,
  groundedContext: string,
): Promise<ConsultResult | null> {
  const conversationText = history
    .map((m) => m.content)
    .concat(space ? [JSON.stringify(space)] : [])
    .join(' ');
  const principles = retrievePrinciples(conversationText);
  return structuredCall(
    consultSystem(catalog, principles, space, groundedContext),
    consultSchema(catalog, principles),
    history,
    (raw) => validateConsult(raw, catalog, principles),
  );
}

// Downscale client-side so a phone photo doesn't ship 8 MB through the proxy.
// Returns bare base64 (Ollama's native images format). Nothing is stored.
export function prepareImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}
