# Tranquility

A product discovery page over a 4,000-item home goods catalog, built for the
Downshift founding engineer take-home. Search is instant, ranking and filters
run on the review signal, and a design assistant in the sidebar turns "I'm
thinking of redesigning my garage" into real products from the catalog.

## Running it

```
npm install
npm run dev
```

The store works fully with no configuration. For the assistant, copy
`.env.example` to `.env` and add a key; any Ollama-compatible host works,
cloud or local. I ran kimi-k2.7-code on Ollama Cloud. Without a key the
assistant reports itself offline and everything else keeps working. That
degradation is deliberate.

## The data is the spec

The catalog file is 1.4 MB and deliberately dirty. Most of the decisions came
from reading it before writing any code.

- 205 items have a null rating and zero reviews. Their cards say "No reviews
  yet". Two more carry a rating with zero reviews; a score nobody gave is not
  a score, so they render unreviewed too.
- Prices arrive as floats, strings with commas, nulls, and 14 hard zeros.
  Zero is not a price. Both render "Price unavailable", and the page never
  says $0.00.
- 183 items have no image, and the placeholder image host flakes. The
  brand-name tile is a deliberate empty state.
- As of early July 2026, 332 items have future release dates and 415 carry
  an out-of-stock flag; 37 of those are also future-dated and count as coming
  soon, since they aren't out yet. Availability is one control with honest
  counts: in stock, coming soon (badged with the real arrival month), sold
  out. What you can buy always ranks first, and sold out is opt-in.
- 16 titles arrive as padded caps and 26 all lowercase; display is cleaned,
  data left intact. 620 titles recur across 1,359 items, which is why ids do the
  identifying.
- imageWidth and imageHeight go unused on purpose. They only matter for a
  masonry layout, and a uniform grid scans better when you are comparing
  products.

## Ranking and search

Every rating in this catalog sits between 3.0 and 5.0, so raw stars cannot
order anything. The default sort weighs a rating by its review depth, a
Bayesian shrink worth 25 average reviews of pull. What 1,400 people
agreed on beats what 3 people said. Review score and review count are also
filters, because depth is the only trust signal this data carries.

Search filters on every keystroke; a full scan of the catalog takes a couple
of milliseconds in memory, so there is nothing to debounce. Typos and plurals
resolve against the catalog's own vocabulary ("towles" finds towels), and the
correction can only land on words that actually occur in the data. Garbage
still returns an honest zero.

## The assistant

The sidebar is the only AI surface, and it runs on one rule: the model never
invents a product, a price, or a review. It answers with structured search
plans. Every field is whitelisted against the real catalog, and the same
deterministic engine behind the search box executes them, so everything on a
suggestion shelf is a real item with its real price and review count.

It is text-first: a vague project sentence gets suggestions with live result
counts and tappable follow-ups. A photo is optional; the model reads it into
palette, light, and concrete gaps, and the gaps become shopping ideas. It
knows the catalog through a digest computed from the data (price tiers, brand
medians, the standout of each category), so its budget advice quotes real
numbers, and its design talk cites named principles from a small corpus that
ships in this repo.

Structured output is JSON mode with the schema stated in the prompt, strict
validation on the way back, one retry, then honest failure. Invalid replies
are rejected and retried, never repaired; enumerated fields are whitelisted,
and free search terms can only resolve onto the catalog's own vocabulary. If
a valid plan over-filters, the engine relaxes it and the interpretation chips
show exactly what ran.

## Shape

React, TypeScript, Vite. The catalog normalizes once at load. Every search,
filter, and AI suggestion compiles to one QueryPlan type, and the engine that
runs it is about 150 lines of pure functions (`src/lib/engine.ts`). The only
server code is a small proxy that keeps the key out of the client
(`server/assistant.ts`), mounted by the Vite dev server locally and as a
serverless function in the deployed demo.

There is no test suite; that was the timebox call. The engine is pure
functions verified against the live page as I built. With one more hour,
tests come first.

AI tools did the typing here. The decisions were mine, and so were the
catches; the most useful one was noticing that a compatibility endpoint was
silently breaking my structured output schemas, reading the raw responses,
and moving to the provider's native API with JSON mode instead of patching
around bad output.

## Next

The social layer. Real identity attached to products, and a place where
actual people show what they are working on and what they bought, so reviews
stop being anonymous stars. The ranking's known cost until then: depth
weighted scoring compounds attention on already-proven items and keeps new
arrivals down until someone reviews them. Watching new-arrival conversion,
and testing a small exploration slot, comes before any other ranking change.
