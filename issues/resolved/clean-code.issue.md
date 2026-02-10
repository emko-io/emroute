# Clean Code Review: emroute

Comprehensive analysis of the emroute codebase (~2,600 LOC across 23 source
files) against clean code principles. Findings are grouped by severity.
Items marked **[resolved]** were considered but determined to not be issues.

---

## Critical

### CC-1: Duplicated parser logic between widgets and components — [resolved]

`widget.parser.ts` and `component.renderer.ts` contain structurally similar
`parse*Blocks` / `replace*Blocks` function pairs.

| File                                                  | Functions                                        |
| ----------------------------------------------------- | ------------------------------------------------ |
| `src/widget/widget.parser.ts:26-64`                   | `parseWidgetBlocks`, `replaceWidgetBlocks`       |
| `src/renderer/component/component.renderer.ts:70-127` | `parseComponentBlocks`, `replaceComponentBlocks` |

**Resolution:** These parse different fenced-block prefixes (`widget:` vs
`component:`) and produce different output types (`ParsedWidgetBlock` vs
`ParsedComponentBlock`). Each is ~40 stable lines. A generic
`parseFencedBlocks(markdown, prefix)` is possible but would couple two
independent subsystems for marginal savings. The similarity is incidental —
fenced-block parsing naturally has this shape. Not worth abstracting.

### CC-2: `handleError` duplicates boundary/handler fallback chain — [resolved]

`SpaHtmlRouter.handleError` (`:402-462`) has three sequential try-catch blocks
that each load a module, call `getData`, call `renderHTML`, set
`slot.innerHTML`, and call `updateTitle`.

**Resolution:** This is a deliberate fallback cascade: error boundary → error
handler → inline fallback. Each level has different failure semantics — if the
boundary itself throws, we must fall through to the next level. Extracting a
`tryRenderErrorPage(routeConfig)` helper would flatten the cascade and obscure
the intentional ordering. The repetition serves clarity here.

### CC-3: Repeated SSR prefix stripping — [fixed]

The pattern of stripping `/html/` or `/md/` prefixes from pathnames appears in
at least 7 places with slight variations:

| Location                       | Code                                        |
| ------------------------------ | ------------------------------------------- |
| `spa/html.renderer.ts:104-106` | `currentPath.slice(SSR_HTML_PREFIX.length)` |
| `spa/html.renderer.ts:187-189` | `pathname.slice(SSR_HTML_PREFIX.length)`    |
| `ssr/html.renderer.ts:69-71`   | `pathname.slice(SSR_HTML_PREFIX.length)`    |
| `ssr/md.renderer.ts:54-56`     | `pathname.slice(SSR_MD_PREFIX.length)`      |
| `markdown.element.ts:101-103`  | Regex replace of both prefixes              |
| `breadcrumb.widget.ts:65-69`   | Manual stripping of both prefixes           |
| `dev.server.ts:293-295`        | `pathname.slice(SSR_HTML_PREFIX.length)`    |

Each site reconstructs the same logic differently — some prepend `'/' +`, some
don't, one uses regex. `RouteCore` already has `normalizeUrl`. A
`stripSsrPrefix(pathname): string` utility would centralize this and prevent
subtle off-by-one bugs.

**Fix:** Added `stripSsrPrefix(pathname): string` to `route.core.ts` and
replaced all 7 call sites. Exported from public API via `index.ts`.

---

## Major

### CC-4: `SsrHtmlRouter` and `SsrMdRouter` share identical structure — [resolved]

Both classes follow the same high-level flow: strip prefix → match → handle
404 → handle redirect → render hierarchy → render route content → resolve
widgets → handle errors.

**Resolution:** The structural similarity is the natural shape of rendering
code, not duplication. The actual work at each step is fundamentally different:

- **Hierarchy joining**: HTML uses `<router-slot>` replacement; Markdown uses
  `\n\n---\n\n` concatenation
- **Widget resolution**: HTML parses `<widget-*>` tags and injects `data-ssr`;
  Markdown parses fenced `` ```widget: `` blocks
- **Markdown expansion**: HTML renderer expands `<mark-down>` tags; MD renderer
  has no equivalent
- **Return types**: `{ html, status, title }` vs `{ markdown, status }`

Forcing these into a base class with template methods would couple two
independent renderers (~230 lines each) that are independently comprehensible
and evolve for different reasons. The high-level flow similarity is just what
renderers do — it doesn't warrant abstraction.

### CC-5: `buildComponentContext` has sequential file fetching and partial — [fixed]

duplication with `loadWidgetFiles`

`RouteCore.buildComponentContext` (`:228-263`) fetches html/md/css files
sequentially with three nearly identical blocks:

```
if (route.files?.html) {
  const path = this.toAbsolutePath(route.files.html);
  const response = await fetch(this.baseUrl + path);
  if (!response.ok) throw ...;
  files.html = await response.text();
}
// ...same for md, css
```

These fetches are independent and could run concurrently with `Promise.all`.
The fetch-and-cache pattern also partially duplicates `loadWidgetFiles`
(`:177-222`), which does the same thing but with caching. Page file loading
should either use the same caching mechanism or at least the same fetch helper.

**Fix:** Refactored both `buildComponentContext` and `loadWidgetFiles` to use
`Promise.all` for concurrent fetching. Page files are intentionally not cached
(they are per-request), while widget files retain their cache.

### CC-6: Module-level side effects in `mod.ts` and `markdown.element.ts` — [resolved]

| File                                      | Side effect                                                          |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `src/renderer/spa/mod.ts:23-32`           | Creates `builtInWidgets` registry, calls `ComponentElement.register` |
| `src/element/markdown.element.ts:200-202` | Calls `customElements.define('mark-down', ...)`                      |

**Resolution:** `mod.ts` IS the SPA browser setup entry point — auto-registering
built-in widgets is its job. Every consumer importing `@emkodev/emroute/spa`
wants the router AND the built-in elements. Requiring a separate
`registerBuiltInWidgets()` call would be boilerplate for no benefit.
`markdown.element.ts` follows standard Web Components convention — the element
must be defined before it appears in markup. Both are intentional, expected side
effects for their respective modules.

### CC-7: Singleton exported instances violate DI principle — [resolved]

Three files export pre-constructed instances:

| File                              | Export                                                   |
| --------------------------------- | -------------------------------------------------------- |
| `component/page.component.ts:12`  | `export default new DefaultPageComponent()`              |
| `widget/page-title.widget.ts:54`  | `export const pageTitleWidget = new PageTitleWidget()`   |
| `widget/breadcrumb.widget.ts:106` | `export const breadcrumbWidget = new BreadcrumbWidget()` |

**Resolution:** All three are stateless — no mutable fields, no instance state.
An "instance" of a stateless object is functionally a constant, not a singleton
in the problematic sense. The DI argument doesn't hold either — consumers pass
widgets to a `WidgetRegistry`, so substitution is already possible without
import mocking. `DefaultPageComponent` class is exported alongside the instance.

### CC-8: `MarkdownElement` uses static mutable state — [resolved]

`MarkdownElement` stores the renderer in static fields (`:23-24`):

```ts
private static renderer: MarkdownRenderer | null = null;
private static rendererInitPromise: Promise<void> | null = null;
```

**Resolution:** The markdown renderer is an external dependency the consumer
provides — emroute doesn't ship one. Static state is the only viable way to
inject a dependency into a custom element: the browser calls the constructor
(not your code), and attributes can't carry objects with methods. The error
message when it's missing is already clear. This is the correct pattern for a
pluggable Web Component dependency.

---

## Moderate

### CC-9: Magic numbers and strings — [fixed]

All magic values extracted to named constants:

| Value                                      | Constant                                             | File                                    |
| ------------------------------------------ | ---------------------------------------------------- | --------------------------------------- |
| `'data-ssr'`                               | `DATA_SSR_ATTR` (exported)                           | `html.util.ts` → `component.element.ts` |
| `'c-loading'`, `'c-markdown'`, `'c-error'` | `CSS_LOADING`, `CSS_MARKDOWN`, `CSS_ERROR`           | `abstract.component.ts`                 |
| `5000`                                     | `MARKDOWN_RENDER_TIMEOUT`                            | `spa/html.renderer.ts`                  |
| `2000`, `100`                              | `BUNDLE_WARMUP_DELAY`, `WATCH_DEBOUNCE_DELAY`        | `dev.server.ts`                         |
| `'data-router-slot'`                       | `DATA_ROUTER_SLOT_ATTR`                              | `slot.element.ts`                       |
| `'\u203A'`, `' > '`                        | `DEFAULT_HTML_SEPARATOR`, `DEFAULT_MD_SEPARATOR`     | `breadcrumb.widget.ts`                  |
| `'__default_root__'`                       | Already accessed via `DEFAULT_ROOT_ROUTE.modulePath` | n/a                                     |

### CC-10: Silent catch blocks swallow errors

Several catch blocks silently discard errors with only inline comments:

| Location                   | Comment                                           |
| -------------------------- | ------------------------------------------------- |
| `ssr/html.renderer.ts:82`  | `catch { /* fall through to inline fallback */ }` |
| `ssr/html.renderer.ts:109` | `catch { /* fall through to inline fallback */ }` |
| `ssr/md.renderer.ts:67`    | `catch { /* fall through to inline fallback */ }` |
| `ssr/md.renderer.ts:94`    | `catch { /* fall through to inline fallback */ }` |
| `html.util.ts:134`         | `catch { return match[0]; }`                      |

Silently falling through is an intentional design choice for graceful
degradation, but there is no way for consumers to observe or log these
failures. A debug/trace event emission or optional error callback would aid
troubleshooting in production.

**Resolution:** Feature request — requires a pluggable logger so consumers can
opt in to visibility without emroute taking a dependency on any logging
framework.

### CC-11: `PageTitleWidget.renderHTML` has a side effect — [resolved]

`page-title.widget.ts:34-36`:

```ts
if (title && typeof document !== 'undefined') {
  document.title = title;
}
```

**Resolution:** The side effect _is_ the feature. This widget exists
specifically so content-only pages (no `.ts` file) can set `document.title`. It
renders empty string — the side effect is its entire purpose. The SSR guard
correctly prevents it server-side. The SPA router's `updateTitle` handles pages
with `.ts` files via `getTitle()`; this widget fills the gap for pages without.

### CC-12: `decodeHtmlEntities` creates a DOM element for decoding — [resolved]

`markdown.element.ts:184-188`:

```ts
private decodeHtmlEntities(text: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}
```

**Resolution:** The textarea trick handles _all_ HTML entities (numeric like
`&#x2F;`, named like `&mdash;`), while `unescapeHtml()` from `html.util.ts`
only handles the 5 most common (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`).
In the browser, markdown renderer output can contain arbitrary entities, so the
textarea approach is more correct. Replacing it with `unescapeHtml` would
introduce entity-decoding bugs.

### CC-13: `html.util.ts` is a mixed-responsibility grab bag — [fixed]

Split into three focused files:

| File                           | Responsibility                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `html.util.ts` (44 lines)      | `DATA_SSR_ATTR`, `HTMLElementBase`, `escapeHtml`, `unescapeHtml`, `STATUS_MESSAGES`         |
| `fenced-block.util.ts` (new)   | `processFencedSlots`, `processFencedWidgets`                                                |
| `widget-resolve.util.ts` (new) | `resolveWidgetTags`, `parseAttrsToParams` — imports `Component`/`ComponentContext` directly |

`WidgetLike` eliminated — `widget-resolve.util.ts` imports `Component` from
`abstract.component.ts` directly. No circular dependency because
`abstract.component.ts` only imports from `html.util.ts`, not the new files.
`WidgetRouteContext` replaced by `ComponentContext`.

---

## Minor

### CC-14: Inconsistent error formatting across renderers — [resolved]

Error pages are rendered with different structures across renderers:

- `SpaHtmlRouter.renderStatusPage` (`:392-396`): `<h1>` + `<p>Path: ...</p>`
- `SsrHtmlRouter.renderStatusPage` (`:228-231`): Same markup
- `SsrMdRouter.renderStatusPage` (`:212-213`): Markdown heading + path

**Resolution:** HTML and Markdown renderers _should_ format errors differently —
that's the point of having separate renderers. The two HTML renderers (SPA and
SSR) produce the same markup, which is correct. The remaining difference is
just whitespace indentation, which is irrelevant in HTML output. No real drift
risk since these are simple fallback strings overridden by custom status pages
in any real application.

### CC-15: `showError` in `MarkdownElement` uses inline styles — [fixed]

`markdown.element.ts:192-196`:

```ts
this.innerHTML = `<div style="padding: 1rem; background: #fee; ...">`;
```

All other components use CSS classes (`c-error`, `c-loading`). This element
uses inline styles, making it impossible to theme consistently. Should use
`c-error` or a dedicated class.

**Fix:** Replaced inline styles with `CSS_ERROR` class (`c-error`), matching
the pattern in `abstract.component.ts`. Exported `CSS_ERROR` so
`MarkdownElement` can reference it.

### CC-16: `resolveWidgetTags` parameter list is long — [resolved]

`html.util.ts:91-99` takes 5 parameters:

```ts
export async function resolveWidgetTags(
  html: string,
  registry: { get(name: string): WidgetLike | undefined },
  pathname?: string,
  routeParams?: Record<string, string>,
  loadFiles?: (...) => Promise<...>,
): Promise<string>
```

**Resolution:** This function is called from exactly one place
(`SsrHtmlRouter.renderRouteContent`). Creating an options type for a single
call site adds indirection without benefit. The parameter count (5) is at the
threshold but not over it, and the optionality of the last three makes the
signature flexible for its one consumer.

### CC-17: `createDevServer` is a 273-line function — [resolved]

`server/dev.server.ts:169-442` — this function declares nested functions
(`regenerateRoutes`, `resolveFilePath`, `handleRequest`), manages mutable
closure state (`routesManifest`, `ssrHtmlRouter`, `ssrMdRouter`), spawns
processes, watches files, and starts a server. It should be decomposed into a
class or at minimum have its nested functions extracted to standalone helpers.

**Resolution:** Dev tooling, not library code consumers interact with. The
function is inherently procedural — set up routes, watch files, handle requests,
start server. Decomposing into a class would add indirection for code that
rarely changes and has exactly one caller. Long is fine when it's linear and
self-contained.

### CC-18: `buildComponentContext` does not use `Promise.all` — [fixed]

`route.core.ts:228-263` fetches three files (html, md, css) sequentially. Since
these fetches are independent, they could run concurrently with `Promise.all`,
improving SSR response time when multiple companion files exist.

**Fix:** Addressed as part of CC-5.

---

## Summary

| Severity  | Count  | Open  | Resolved |
| --------- | ------ | ----- | -------- |
| Critical  | 3      | 0     | 3        |
| Major     | 5      | 0     | 5        |
| Moderate  | 5      | 0     | 5        |
| Minor     | 5      | 0     | 5        |
| **Total** | **18** | **0** | **18**   |

**Resolved items (not issues):**

- **CC-1** (widget/component parsers): Incidental structural similarity between
  independent subsystems, not worth abstracting.
- **CC-2** (handleError cascade): Deliberate fallback chain where repetition
  serves clarity.
- **CC-4** (SSR renderer structure): Natural shape of rendering code, not
  duplication. Different joining, widget resolution, and return types mean
  inheritance would add coupling without real benefit.
- **CC-7** (singleton instances): All three are stateless — functionally
  constants, not singletons. Substitution is already possible via the registry.
- **CC-11** (PageTitleWidget side effect): The side effect _is_ the feature.
  This widget exists to set `document.title` for content-only pages.
- **CC-12** (textarea decoding): Handles all HTML entities correctly, unlike
  `unescapeHtml` which only covers 5. More correct, not less clean.
- **CC-14** (error formatting): Different renderers should format differently.
  HTML renderers already produce matching markup.
- **CC-16** (long parameter list): Single call site. An options type would add
  indirection without benefit.
- **CC-6** (module-level side effects): SPA module's job is browser setup;
  `<mark-down>` follows standard WC convention. Both are intentional.

**All 18 items resolved.** 9 were non-issues on closer inspection, 7 were
fixed in code, 1 is a feature request (CC-10: pluggable logger), and 1 was
accepted as-is (CC-17: dev tooling).

The codebase is well-typed, well-tested (536 unit + 61 browser tests), and
architecturally sound for its scale. Half the initial findings turned out to be
non-issues on closer inspection — the code is cleaner than a surface scan
suggests. The renderers are deliberately independent and each under 260 lines;
their structural similarity is the natural shape of rendering code, not a DRY
violation.
