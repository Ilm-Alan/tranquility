// The design studio's client logic: photo -> structured space read (vision tool
// call) -> deterministic retrieval over the authored principle corpus ->
// suggestions that arrive as query plans for the engine to execute. The model
// talks about design; it never names a product, price, or review - those come
// from running its plans over the real catalog.

import type { Catalog } from './catalog';
import { normalizePlan } from './assistant';
import type { QueryPlan } from './engine';
import { DESIGN_CORPUS, type DesignPrinciple } from './designCorpus';

export interface SpaceRead {
  room: string;
  style: string;
  light: string;
  palette: string[];
  materials: string[];
  opportunities: { need: string; why: string }[];
}

export interface Suggestion {
  title: string;
  principle: string | null; // name of a corpus entry, or null
  why: string;
  plan: QueryPlan;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

// Lexical retrieval over the corpus. Deterministic and inspectable; with 18
// entries this outranks embedding infrastructure it would take a demo to see.
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

function vocabulary(catalog: Catalog): string {
  return [
    `Categories: ${catalog.categories.join(', ')}.`,
    `Brands: ${catalog.brands.join(', ')}.`,
    `Tags: ${catalog.tags.join(', ')}.`,
  ].join('\n');
}

function principlesBlock(principles: DesignPrinciple[]): string {
  return principles.map((p) => `- ${p.name}: ${p.body}`).join('\n');
}

const READ_SPACE_TOOL = {
  name: 'read_space',
  description: 'Report what you can actually see in the photo of the room. Always answer with this tool.',
  input_schema: {
    type: 'object',
    properties: {
      room: { type: 'string', description: 'What kind of room or corner this is' },
      style: { type: 'string', description: 'The style the room currently leans toward, in a few words' },
      light: { type: 'string', description: 'What the light is like: sources, direction, warmth' },
      palette: { type: 'array', items: { type: 'string' }, description: 'Dominant colors, plain words' },
      materials: { type: 'array', items: { type: 'string' }, description: 'Visible materials' },
      opportunities: {
        type: 'array',
        description: '2-4 concrete gaps or opportunities you can see, grounded in what is visible',
        items: {
          type: 'object',
          properties: {
            need: { type: 'string', description: 'The gap, e.g. "no task lighting near the chair"' },
            why: { type: 'string', description: 'What in the photo shows it' },
          },
          required: ['need', 'why'],
        },
      },
    },
    required: ['room', 'style', 'light', 'palette', 'materials', 'opportunities'],
  },
};

// Kept deliberately flat: this endpoint does not enforce schemas, and the model
// drifts off nested shapes. Flat fields survive; the validator coerces the rest.
function suggestTool(catalog: Catalog, principles: DesignPrinciple[]) {
  return {
    name: 'suggest_searches',
    description:
      'Propose 3-5 catalog searches for this space, most impactful first. Each suggestion becomes a search the engine runs over real products; you never name specific products. Every suggestion MUST have title and why.',
    input_schema: {
      type: 'object',
      properties: {
        suggestions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Short shopper-facing label, e.g. "A reading lamp for the dark corner"' },
              why: { type: 'string', description: 'One sentence tying the suggestion to what the photo shows' },
              principle: {
                type: 'string',
                enum: principles.map((p) => p.name),
                description: 'The provided design principle this applies, if one fits',
              },
              tags: { type: 'array', items: { type: 'string', enum: catalog.tags }, description: 'Tags to search, from the vocabulary' },
              categories: { type: 'array', items: { type: 'string', enum: catalog.categories } },
              terms: { type: 'array', items: { type: 'string' }, description: '0-2 extra single lowercase keywords, only if no tag fits' },
              priceMax: { type: ['number', 'null'] },
              inStockOnly: { type: 'boolean' },
            },
            required: ['title', 'why', 'tags'],
          },
        },
      },
      required: ['suggestions'],
    },
  };
}

interface ContentBlock {
  type: string;
  name?: string;
  text?: string;
  input?: unknown;
}

async function callProxy(body: object): Promise<ContentBlock[] | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return ((await res.json()) as { content?: ContentBlock[] }).content ?? null;
  } catch {
    return null;
  }
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function validateSpaceRead(input: unknown): SpaceRead | null {
  const raw = (input ?? {}) as Record<string, unknown>;
  if (typeof raw.room !== 'string' || raw.room === '') return null;
  // The model sometimes flattens opportunities to plain strings; accept both.
  const opps = Array.isArray(raw.opportunities) ? raw.opportunities : [];
  return {
    room: raw.room,
    style: typeof raw.style === 'string' ? raw.style : '',
    light: typeof raw.light === 'string' ? raw.light : '',
    palette: strings(raw.palette).slice(0, 6),
    materials: strings(raw.materials).slice(0, 6),
    opportunities: opps
      .map((o) =>
        typeof o === 'string'
          ? { need: o, why: '' }
          : typeof (o as Record<string, unknown>).need === 'string'
            ? {
                need: (o as Record<string, unknown>).need as string,
                why:
                  typeof (o as Record<string, unknown>).why === 'string'
                    ? ((o as Record<string, unknown>).why as string)
                    : '',
              }
            : null,
      )
      .filter((o): o is { need: string; why: string } => o !== null)
      .slice(0, 5),
  };
}

// Last-resort grounding: when a suggestion arrives as prose with no search
// fields, read tags and categories out of its own title against the real
// vocabulary. Deterministic, and it only ever narrows to words the model used.
function planFromText(text: string, catalog: Catalog): { tags: string[]; categories: string[] } {
  const stem = (w: string) => w.replace(/s$/, '');
  const words = new Set(
    text.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem),
  );
  const lower = text.toLowerCase();
  return {
    tags: catalog.tags.filter((t) => words.has(stem(t.toLowerCase()))).slice(0, 3),
    categories: catalog.categories.filter((c) => lower.includes(c.toLowerCase())),
  };
}

// Coercive on purpose: the model has been observed inventing its own field
// names ("query" instead of terms, plans hoisted out of their object) and
// omitting required fields outright. Map what it plausibly meant onto the
// strict shape; drop only what stays unusable.
function validateSuggestions(
  input: unknown,
  catalog: Catalog,
  principles: DesignPrinciple[],
): Suggestion[] {
  const raw = (input ?? {}) as Record<string, unknown>;
  const list = Array.isArray(raw.suggestions) ? raw.suggestions : [];
  const names = new Set(principles.map((p) => p.name));
  return list
    .map((s) => s as Record<string, unknown>)
    .map((s): Suggestion => {
      const nested = (s.plan ?? {}) as Record<string, unknown>;
      const pick = (key: string) => s[key] ?? nested[key];
      const query = typeof s.query === 'string' ? s.query : '';
      const plan = normalizePlan(
        {
          terms: pick('terms') ?? query.split(/\s+/),
          categories: pick('categories'),
          tags: pick('tags'),
          brands: pick('brands'),
          priceMax: pick('priceMax'),
          priceMin: pick('priceMin'),
          inStockOnly: pick('inStockOnly'),
          sort: pick('sort'),
        },
        catalog,
      );
      const title =
        typeof s.title === 'string' && s.title !== ''
          ? s.title
          : query || [...plan.tags, ...plan.terms].join(' ');
      if (plan.terms.length === 0 && plan.tags.length === 0 && plan.categories.length === 0) {
        const derived = planFromText(title, catalog);
        plan.tags = derived.tags;
        plan.categories = derived.categories;
      }
      return {
        title,
        why: typeof s.why === 'string' ? s.why : '',
        principle:
          typeof s.principle === 'string' && names.has(s.principle) ? s.principle : null,
        plan,
      };
    })
    .filter(
      (s) =>
        s.title !== '' &&
        (s.plan.terms.length > 0 || s.plan.tags.length > 0 || s.plan.categories.length > 0),
    )
    .slice(0, 5);
}

export async function readSpace(
  image: { data: string; mediaType: string },
  note: string,
  catalog: Catalog,
): Promise<SpaceRead | null> {
  const content = await callProxy({
    system:
      'You are reading a photo of a home space for an interior design assistant. Report only what is visible; do not flatter, do not invent. Always answer with the read_space tool.',
    tools: [READ_SPACE_TOOL],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
          {
            type: 'text',
            text: note
              ? `Read this space. The owner adds: ${note}`
              : 'Read this space.',
          },
        ],
      },
    ],
  });
  const call = content?.find((b) => b.type === 'tool_use' && b.name === 'read_space');
  void catalog;
  return call ? validateSpaceRead(call.input) : null;
}

function studioSystem(
  read: SpaceRead,
  principles: DesignPrinciple[],
  catalog: Catalog,
): string {
  return [
    'You are the design assistant for a home goods catalog. You help the shopper think about their space and find pieces for it. Answer in plain text without markdown, and keep answers short.',
    'Hard rules: products, prices, ratings, and review counts exist ONLY as given in the provided context - cite those freely and by name when comparing or answering questions, but never invent, guess, or extrapolate ones that are not provided. NEW product suggestions happen only through the suggest_searches tool, whose plans a deterministic engine runs over the real catalog. When you reference design ideas, use the provided principles by name; do not cite sources you were not given.',
    `The space, as read from the shopper's photo: ${JSON.stringify(read)}`,
    'Design principles retrieved for this space:',
    principlesBlock(principles),
    'Catalog vocabulary for plans:',
    vocabulary(catalog),
  ].join('\n\n');
}

export async function suggestForSpace(
  read: SpaceRead,
  note: string,
  catalog: Catalog,
  principles: DesignPrinciple[],
): Promise<Suggestion[] | null> {
  const content = await callProxy({
    system: studioSystem(read, principles, catalog),
    tools: [suggestTool(catalog, principles)],
    messages: [
      {
        role: 'user',
        content: `Suggest what would improve this space, based on the read and the principles. Use the suggest_searches tool.${note ? ` The owner adds: ${note}` : ''}`,
      },
    ],
  });
  const call = content?.find((b) => b.type === 'tool_use' && b.name === 'suggest_searches');
  return call ? validateSuggestions(call.input, catalog, principles) : null;
}

export interface ChatResult {
  text: string;
  suggestions: Suggestion[] | null;
}

export async function studioChat(
  history: ChatTurn[],
  read: SpaceRead,
  catalog: Catalog,
  principles: DesignPrinciple[],
  shelvesSummary: string,
): Promise<ChatResult | null> {
  const content = await callProxy({
    system:
      studioSystem(read, principles, catalog) +
      `\n\nCurrent suggestion shelves and their top real products (for grounded questions):\n${shelvesSummary}`,
    tools: [suggestTool(catalog, principles)],
    messages: history.map((t) => ({ role: t.role, content: t.text })),
  });
  if (!content) return null;
  const text = content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();
  const call = content.find((b) => b.type === 'tool_use' && b.name === 'suggest_searches');
  return {
    text,
    suggestions: call ? validateSuggestions(call.input, catalog, principles) : null,
  };
}

// Downscale client-side so a phone photo doesn't ship 8 MB through the proxy.
export function prepareImage(file: File): Promise<{ data: string; mediaType: string }> {
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
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      resolve({ data: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}
