# Adopt Baseline 2025 JavaScript Features

Audit of `src/` against Baseline 2025 web platform features (per MDN / web.dev).

## Applied

| Change                                                            | Location(s)                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `[\s\S]*?` → `/s` (dotAll) flag with `.*?`                        | `widget.parser.ts`, `component.renderer.ts`, `fenced-block.util.ts`                       |
| Named capture groups `(?<name>...)` + `match.groups`              | `widget.parser.ts`, `component.renderer.ts`, `widget-resolve.util.ts`, `route.matcher.ts` |
| `Promise.withResolvers()` replacing manual promise/resolve fields | `element/component.element.ts`                                                            |
| `toSorted()` replacing `[...array].sort()` copy-to-sort           | `route.matcher.ts`                                                                        |
| `matchAll().toArray()` replacing `[...matchAll()]` spread         | `widget-resolve.util.ts`                                                                  |

## Applied (TypeScript / ES2021+ features)

| Change                                                                        | Location(s)                                                      |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `lib` bumped from `es2020` to `esnext`                                        | `deno.json`                                                      |
| `replaceAll()` replacing `.replace(/literal/g, ...)`                          | `html.util.ts`, `fenced-block.util.ts`, `widget-resolve.util.ts` |
| `accessor` keyword replacing manual getter/setter + backing field             | `route.core.ts` (`currentRoute`)                                 |
| `PromiseWithResolvers` single field replacing `readyPromise` + `readyResolve` | `element/component.element.ts`                                   |
| Template literal type `` `widget-${string}` `` for `tagName`                  | `widget.type.ts` (`WidgetManifestEntry`)                         |
| Named capture groups in fenced-block patterns                                 | `fenced-block.util.ts`                                           |
| Removed dead `?? 0` fallback on `match.index` from `matchAll()`               | `widget.parser.ts`                                               |

## Not Applicable

Evaluated but no matching code patterns found:

- **`RegExp.escape()`** — no dynamic `RegExp` construction in `src/`
- **`Error.cause`** — no error re-throwing with wrapping; catch blocks log, store strings, or pass through
- **Iterator helpers on Map/Set** — `for...of` loops are plain iteration, no filter/map chains
- **`satisfies` on `STATUS_MESSAGES`** — consumers index by arbitrary `number` (status codes); `as const satisfies` narrows the key type to `401 | 403 | 404 | 500` which breaks lookup by arbitrary status
- **`using` / `await using`** — AbortControllers live as instance state across `connectedCallback`/`disconnectedCallback` (different scopes); `using` requires same-scope lifecycle
- **Import attributes** — no JSON file imports; all `JSON.parse` calls parse runtime strings
- **`Promise.try()`** — all code is already `async`; sync throws are already caught as rejections
- **Set methods** (`union`, `intersection`, `difference`) — no set operations
- **`Object.groupBy` / `Map.groupBy`** — no grouping logic
- **`Array.fromAsync`** — no async-iterable-to-array conversion
- **`structuredClone`** — no deep-copy operations
- **`Intl.DurationFormat`** — no duration formatting
- **`Float16Array` / `Atomics.pause` / `Atomics.waitAsync`** — no typed-array or shared-memory work
- **`Uint8Array` base64/hex** — no binary encoding
- **`ClipboardItem.supports()`** — no clipboard operations
- **Temporal API** — not yet Baseline; no date operations in codebase

## Already Modern (no changes needed)

- **URLPattern** — already used in `route.matcher.ts`; officially Baseline Sep 2025
- **AbortController / AbortSignal** — proper usage with `{ signal }` event listener cleanup
- **`globalThis`** — used throughout for isomorphic code
- **Custom Elements v1** — `connectedCallback` / `disconnectedCallback` lifecycle
- **Dynamic `import()`** — used for lazy module loading

## Reference

- [Baseline 2025 — web.dev](https://web.dev/baseline/2025)
- [Baseline monthly digests — web.dev](https://web.dev/blog)
- [Baseline glossary — MDN](https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility)
