# Widget Companion File Auto-Discovery + SPA Context Passing

**Status**: Complete — implemented in beta.9, verified with 545 unit + 62 browser tests.

## Problem

Two gaps in how widgets handle companion files compared to pages:

1. **No auto-discovery**: Pages get companion files (`.page.html`, `.page.md`,
   `.page.css`) auto-discovered by the route generator and grouped into
   `route.files`. Widgets require manual `readonly files = {...}` declarations.

2. **No SPA context**: `ComponentElement` never passes `context` to widgets, so
   even widgets with declared `files` can't use them in SPA mode — CSS,
   HTML templates, and markdown files are all ignored client-side.

## Goal

Unified experience: widget companion files are auto-discovered like pages,
explicit `files` (including absolute URLs) serve as overrides, and SPA
`ComponentElement` fetches and passes file content via context.

## How Pages Work (reference)

`tool/route.generator.ts` → `generateRoutesManifest()`:

1. Walks `routes/` directory, collects all files
2. `getPageFileType()` identifies `.page.{ts,html,md,css}`
3. `filePathToPattern()` converts path to URL pattern
4. `groupFilesByPattern()` merges files with same pattern into `RouteFiles`
5. Result stored on `RouteConfig.files` in the manifest

SPA router (`src/renderer/spa/html.renderer.ts`):

```
context = await this.core.buildComponentContext(routeInfo, route)
→ fetches route.files.{html,md,css} via HTTP
→ returns { ...routeInfo, files: { html, md, css } }
→ passes context to component.getData() and component.renderHTML()
```

## How Widgets Work Today

SSR: `resolveWidgetTags()` in `widget-resolve.util.ts` receives a `RouteInfo`
and an optional `loadFiles` callback. For each widget tag, if `widget.files`
is truthy **and** `loadFiles` is provided, it calls `loadFiles(widget.files)`
to fetch content, then builds context via `{ ...routeInfo, files }` and passes
it to `widget.getData()` and `widget.renderHTML()`.

`RouteCore.loadWidgetFiles()` handles the actual fetching with caching,
supporting both relative paths and absolute URLs.

SPA: `ComponentElement` calls `renderHTML({ data, params })` — no context, no
files. `widget.files` is completely ignored client-side.

**Critical gap for auto-discovery**: `resolveWidgetTags` guards file loading
with `if (widget.files && loadFiles)`. Widgets that don't declare `files` (the
ones that would benefit most from auto-discovery) never trigger the callback.

## Changes

### 1. Widget file discovery utility (pure, no mutation)

**File**: `tool/widget.generator.ts` (new)

```typescript
type WidgetFiles = { html?: string; md?: string; css?: string };

export async function discoverWidgetFiles(
  widgetsDir: string,
  widgets: Iterable<{ name: string; files?: WidgetFiles }>,
  fs: FileSystem,
  pathPrefix?: string,
): Promise<Map<string, WidgetFiles>>;
```

Returns a `Map<widgetName, WidgetFiles>` — does **not** mutate inputs.

For each widget, checks for `{widgetsDir}/{name}/{name}.widget.{html,md,css}`
using `fs.exists()`. Merges **per key** with explicit `widget.files` — explicit
values win per file type, discovered values fill gaps:

```
discovered = { html: 'widgets/nav/nav.widget.html', css: 'widgets/nav/nav.widget.css' }
explicit   = { css: 'https://cdn.example.com/nav.css' }
result     = { html: 'widgets/nav/nav.widget.html', css: 'https://cdn.example.com/nav.css' }
```

Per-key merge means a widget that declares `files = { css: '...' }` still gets
auto-discovered `html` and `md` if they exist on disk. No all-or-nothing
skip — `fs.exists()` is cheap.

`pathPrefix` controls the path prefix in the returned map values (e.g.
`'widgets'` → `'widgets/nav/nav.widget.css'`).

### 2. Add `files` to `WidgetManifestEntry`

**File**: `src/type/widget.type.ts`

```typescript
export interface WidgetManifestEntry {
  name: string;
  modulePath: string;
  tagName: string;
  files?: { html?: string; md?: string; css?: string };
}
```

### 3. Widget files manifest generation

**File**: `tool/widget.generator.ts`

Add a `generateWidgetFilesManifestCode()` function that takes the discovery
result (`Map<string, WidgetFiles>`) and produces a TypeScript module:

```typescript
export function generateWidgetFilesManifestCode(
  discoveredFiles: Map<string, WidgetFiles>,
): string;
```

Generated output (`widget-files.manifest.ts`):

```typescript
/** Auto-generated — do not edit. */
export const widgetFiles: Record<string, { html?: string; md?: string; css?: string }> = {
  'nav': { css: 'widgets/nav/nav.widget.css' },
  'file-widget': {
    html: 'widgets/file-widget/file-widget.widget.html',
    md: 'widgets/file-widget/file-widget.widget.md',
    css: 'widgets/file-widget/file-widget.widget.css',
  },
};
```

This is a plain data module — no imports, no side effects. The SPA entry point
imports it and passes file paths to `ComponentElement` at registration time.

### 4. Change `resolveWidgetTags` loadFiles callback signature

**File**: `src/util/widget-resolve.util.ts`

Current signature:

```typescript
loadFiles?: (
  files: { html?: string; md?: string; css?: string },
) => Promise<{ html?: string; md?: string; css?: string }>
```

Current guard: `if (widget.files && loadFiles)` — skips widgets with no
declared `files`, blocking auto-discovery.

New signature — callback receives widget name and declared files:

```typescript
loadFiles?: (
  widgetName: string,
  declaredFiles?: { html?: string; md?: string; css?: string },
) => Promise<{ html?: string; md?: string; css?: string }>
```

New guard: `if (loadFiles)` — always called when a callback is provided.
The callback is responsible for merging discovered + declared files and
returning empty `{}` when there's nothing to load.

Call site change:

```typescript
// Before:
if (widget.files && loadFiles) {
  files = await loadFiles(widget.files);
}

// After:
if (loadFiles) {
  files = await loadFiles(widgetName, widget.files);
}
```

This is a breaking change to the `resolveWidgetTags` API. Both SSR renderers
(`html.renderer.ts`, `md.renderer.ts`) must update their callbacks.

### 5. ComponentElement loads files and passes context

**File**: `src/element/component.element.ts`

Extract file-loading into a static helper on `ComponentElement`:

- `private static fileCache = new Map<string, Promise<string | undefined>>()`
- `private static loadFile(path: string): Promise<string | undefined>` — single
  file fetch with URL resolution (absolute URLs pass through, relative paths
  get `'/' +` prefix). Returns cached promise to deduplicate concurrent
  requests for the same path.
- `private async loadFiles(): Promise<WidgetFiles>` — reads effective files
  (from registration, falling back to `this.component.files`), calls
  `loadFile` for each, returns loaded content. If no files, returns `{}`
  immediately.

In `connectedCallback`, before `loadData()`:

```typescript
const files = await this.loadFiles();
if (signal?.aborted) return;

// Always create context so all widgets have access to route info.
// Uses real browser location for pathname/searchParams.
this.context = {
  pathname: globalThis.location?.pathname ?? '/',
  pattern: '',
  params: {},
  searchParams: new URLSearchParams(globalThis.location?.search ?? ''),
  files: (files.html || files.md || files.css) ? files : undefined,
};
```

Pass `this.context` to both `getData()` and `renderHTML()` / `renderError()`.

**Implementation note**: An earlier version used `pathname: ''` and only created
context when files existed. This caused a regression — widgets like nav that
check `context?.pathname ?? '/'` got an empty string instead of the fallback.
Fixed by using `globalThis.location?.pathname` and always creating context.

**Error handling**: individual file fetch failures return `undefined` for that
key (same as SSR `loadWidgetFiles` behavior). The widget still renders — it
just won't have that file's content. Warn via `console.warn`.

**Abort handling**: check `signal?.aborted` after `loadFiles()` await, same
pattern as the existing `loadData()`. `loadFile` itself is not abortable (the
cached promise is shared across mounts), but we bail before touching DOM.

**Note**: `ComponentContext extends RouteInfo`. The `RouteInfo` interface
(`pathname`, `pattern`, `params`, `searchParams`) already exists. The remaining
gap is that `ComponentElement` doesn't receive `RouteInfo` from the SPA router.
For now, stub values are used. Wiring `RouteInfo` into `ComponentElement` is a
separate task (tracked in `context-aware-widget-links.design.md`).

### 6. `Component.files` stays `readonly`

No change to `src/component/abstract.component.ts`. The `files` property
remains `readonly` on the class — widget instances are not mutated.

Instead, the discovery result flows through data:

- **SSR**: `discoverWidgetFiles()` returns a `Map`. The `loadFiles` callback
  merges discovered files with declared files per-widget (see step 7).
- **SPA**: the generated manifest is imported as data. `ComponentElement`
  receives file paths at registration time (see step 8).

### 7. ComponentElement accepts file paths at registration

**File**: `src/element/component.element.ts`

Extend `ComponentElement.register()` to accept optional file paths:

```typescript
static register<TP, TD>(
  component: Component<TP, TD>,
  files?: { html?: string; md?: string; css?: string },
): void;
```

When `files` is provided, it takes precedence over `component.files` for SPA
file loading. This is how discovered files reach `ComponentElement` without
mutating the widget instance:

```typescript
// In BoundElement constructor or as a closure:
// effectiveFiles = files ?? component.files
```

### 8. Server-side integration

**File**: `test/browser/setup.ts` (test harness example — real apps do the same
in their server setup)

After generating the routes manifest, call `discoverWidgetFiles()` to get
the file map. Update the `loadFiles` callbacks in both SSR renderers to use
the new `(widgetName, declaredFiles?)` signature:

```typescript
const fs = createFs();
const discoveredFiles = await discoverWidgetFiles(
  `${FIXTURES_DIR}/widgets`,
  widgets,
  fs,
  'widgets',
);
```

**Implementation note**: Rather than merging in the callback, the implementation
adds `widgetFiles?: Record<string, WidgetFiles>` to `SsrHtmlRouterOptions`,
`SsrMdRouterOptions`, and `DevServerConfig`. Each SSR renderer stores the map
and merges internally: `const files = this.widgetFiles[name] ?? declared`. The
dev server pipes the config through to both renderers. This keeps the merge
logic encapsulated in the renderers rather than exposed in setup code.

Also generate the widget files manifest for the SPA bundle:

```typescript
const manifestCode = generateWidgetFilesManifestCode(discoveredFiles);
await Deno.writeTextFile(`${FIXTURES_DIR}/widget-files.manifest.ts`, manifestCode);
```

### 9. SPA integration

**File**: `test/browser/fixtures/main.ts` (test harness example — real apps do
the same in their SPA entry point)

```typescript
import { widgetFiles } from './widget-files.manifest.ts';

for (const widget of widgets) {
  ComponentElement.register(widget, widgetFiles[widget.name]);
}
```

**Implementation note**: No manual merge needed in main.ts — the
`discoverWidgetFiles()` function already produces merged results (discovered
fills gaps, explicit wins per key). The manifest contains final merged paths.
`ComponentElement.loadFiles()` uses `effectiveFiles ?? component.files` as
fallback for widgets not in the manifest.

### 10. Remove manual `files` from convention-following widgets

- `widgets/nav/nav.widget.ts` — remove `override readonly files`
- `widgets/file-widget/file-widget.widget.ts` — remove `override readonly files`
- `widgets/remote-widget/remote-widget.widget.ts` — **keep** (absolute URLs)

### 11. Remove nav CSS workaround

**File**: `test/browser/fixtures/index.html`

Remove `.site-nav` CSS rules from global `<style>`. Nav CSS now loads via
ComponentElement → context → renderHTML() → `<style>` injection.

### 12. Export from package

**File**: `deno.json` — added `"./widget-generator": "./tool/widget.generator.ts"`
sub-export (same pattern as `"./generator"` for route generator). Importable as
`@emkodev/emroute/widget-generator`.

## Dependencies

- **Steps 1–3, 6–7, 10–12**: Independent of other work.
- **Step 4 (resolveWidgetTags signature change)**: Breaking change to internal
  API. Both SSR renderers must be updated in the same commit.
- **Step 5 (ComponentElement context)**: `RouteInfo` already exists and
  `ComponentContext extends RouteInfo`. The file-loading and `context.files`
  part can land now with stub `RouteInfo` values. Wiring real `RouteInfo` from
  the SPA router into `ComponentElement` is tracked separately in
  `context-aware-widget-links.design.md`.

## Verification

1. `deno task test` — all existing tests pass
2. SSR: widget-files page still renders file widget with CSS and data-ssr
3. SSR: nav widget still has CSS on all pages
4. SPA: nav widget now has CSS (loaded via ComponentElement context)
5. SPA: file caching — nav CSS fetched once, reused across navigations
6. Remote widget: absolute URL files still work (explicit override)
7. `nav.widget.ts` and `file-widget.widget.ts` have no manual `files`
8. `Component.files` is still `readonly` — no widget instances mutated
9. Widgets with no declared `files` still get auto-discovered companion files
   in SSR (the new `loadFiles` callback fires regardless of `widget.files`)
