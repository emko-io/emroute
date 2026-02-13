# Router-slot fenced block with JSON body breaks SSR markdown slot injection

## Problem

The SSR markdown renderer matches router-slot blocks with a literal string:

````ts
const ROUTER_SLOT_BLOCK = '```router-slot\n```';
````

When a `.md` file contains a JSON body inside the fenced block:

````md
```router-slot
{"some": "attribute"}
```
````

The literal match fails and slot injection does not happen. Child content is
never inserted into the parent.

The SSR HTML path is unaffected — emko-md converts the fenced block to
`<router-slot some="attribute"></router-slot>`, and the regex
`/<router-slot[^>]*><\/router-slot>/` matches it. However, attributes are
silently discarded when the slot is replaced with child content.

Widget fenced blocks handle JSON bodies correctly in both pipelines — the
widget parser extracts params, and emko-md converts them to HTML attributes.

## Current behaviour by pipeline

| Pipeline     | `router-slot` (no body) | `router-slot` (JSON body) | `widget:name` (JSON body) |
| ------------ | ----------------------- | ------------------------- | ------------------------- |
| SSR HTML     | works                   | matches, attrs discarded  | works (attrs → params)    |
| SSR Markdown | works                   | **broken** (no match)     | works (JSON → params)     |
| SPA          | works                   | matches, attrs unused     | works (attrs → params)    |

## Expected behaviour

Router-slot fenced blocks with a JSON body should produce
`<router-slot some="attribute"></router-slot>` in HTML mode and pass attributes
to the slot element. The markdown renderer should handle the JSON body the same
way it does for widgets — parse it, and either forward the attributes or ignore
them cleanly without breaking slot injection.

## Blocked by

emko-md is migrating from Rust/WASM to a full TypeScript implementation. The
new version will expose parsing and transformation tooling that can be used
equally on both SSR and SPA sides, unifying fenced block handling. Once that
lands, the router-slot and widget fenced block processing can be consolidated
into a single pipeline instead of the current split between literal string
matching (SSR markdown), regex matching (SSR HTML), and renderer-side
conversion (SPA).

## Scope

- Unify fenced block processing for `router-slot` and `widget:*` across all
  three rendering pipelines once emko-md TypeScript tooling is available
- Decide whether router-slot attributes should carry semantic meaning (e.g.,
  passed to child components) or be ignored
- Remove the literal `ROUTER_SLOT_BLOCK` string match in favour of proper
  parsing
