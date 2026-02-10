# Widget Companion File Auto-Discovery + SPA Context Passing

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
context = await this.core.buildComponentContext(route.pattern, route, params)
→ fetches route.files.{html,md,css} via HTTP
→ passes context to component.getData() and component.renderHTML()
```

## How Widgets Work Today

SSR: `loadWidgetFiles()` in `route.core.ts` reads `widget.files` paths
(supports both relative and absolute URLs), fetches content, caches it.
`resolveWidgetTags()` in `widget-resolve.util.ts` builds a `ComponentContext`
and passes it to `widget.getData()` and `widget.renderHTML()`.

SPA: `ComponentElement` calls `renderHTML({ data, params })` — no context, no
files. `widget.files` is completely ignored client-side.

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

### 4. ComponentElement loads files and passes context

**File**: `src/element/component.element.ts`

Reuse `RouteCore.loadWidgetFiles()` logic instead of duplicating it. Extract
the file-loading concern into a static helper on `ComponentElement`:

- `private static fileCache = new Map<string, Promise<string | undefined>>()`
- `private static loadFile(path: string): Promise<string | undefined>` — single
  file fetch with URL resolution (absolute URLs pass through, relative paths
  get `'/' +` prefix). Returns cached promise to deduplicate concurrent
  requests for the same path.
- `private async loadFiles(): Promise<WidgetFiles>` — reads
  `this.component.files`, calls `loadFile` for each, returns loaded content.
  If `this.component.files` is undefined, returns `{}` immediately.

In `connectedCallback`, before `loadData()`:

```typescript
const files = await this.loadFiles();
if (signal?.aborted) return;
this.context = { pathname: '', params: {}, files };
```

Pass `this.context` to both `getData()` and `renderHTML()` / `renderError()`.

**Error handling**: individual file fetch failures return `undefined` for that
key (same as SSR `loadWidgetFiles` behavior). The widget still renders — it
just won't have that file's content. Warn via `console.warn`.

**Abort handling**: check `signal?.aborted` after `loadFiles()` await, same
pattern as the existing `loadData()`. `loadFile` itself is not abortable (the
cached promise is shared across mounts), but we bail before touching DOM.

**Note**: `ComponentContext` shape in SPA is incomplete — `pathname` and
`searchParams` require the context rework (happening in parallel). For now,
pass `pathname: ''` and omit `searchParams`. Once the context rework lands,
`ComponentElement` will receive the current pathname from the router.

### 5. `Component.files` stays `readonly`

No change to `src/component/abstract.component.ts`. The `files` property
remains `readonly` on the class — widget instances are not mutated.

Instead, the discovery result flows through data:

- **SSR**: `discoverWidgetFiles()` returns a `Map`. The server passes this map
  to `resolveWidgetTags()` (or the setup code merges it with
  `widget.files` before calling `loadWidgetFiles`).
- **SPA**: the generated manifest is imported as data. `ComponentElement`
  receives file paths at registration time (see step 6).

### 6. ComponentElement accepts file paths at registration

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

### 7. Server-side integration

**File**: `test/browser/setup.ts` (test harness example — real apps do the same
in their server setup)

After generating the routes manifest, call `discoverWidgetFiles()` to get
the file map. Then update `resolveWidgetTags` call site to merge discovered
files with widget-declared files:

```typescript
const fs = createFs();
const discoveredFiles = await discoverWidgetFiles(
  `${FIXTURES_DIR}/widgets`,
  widgets,
  fs,
  'widgets',
);

// Pass a loadFiles callback that merges discovered + declared files
const loadFiles = (widget: Component) => {
  const declared = widget.files ?? {};
  const discovered = discoveredFiles.get(widget.name) ?? {};
  const merged = { ...discovered, ...declared };
  return core.loadWidgetFiles(merged);
};
```

Also generate the widget files manifest for the SPA bundle:

```typescript
const manifestCode = generateWidgetFilesManifestCode(discoveredFiles);
await Deno.writeTextFile(`${FIXTURES_DIR}/widget-files.manifest.ts`, manifestCode);
```

### 8. SPA integration

**File**: `test/browser/fixtures/main.ts` (test harness example — real apps do
the same in their SPA entry point)

```typescript
import { widgetFiles } from './widget-files.manifest.ts';

for (const widget of widgets) {
  const files = widgetFiles[widget.name];
  const merged = files
    ? { ...files, ...widget.files } // declared wins over discovered
    : widget.files;
  ComponentElement.register(widget, merged);
}
```

### 9. Remove manual `files` from convention-following widgets

- `widgets/nav/nav.widget.ts` — remove `override readonly files`
- `widgets/file-widget/file-widget.widget.ts` — remove `override readonly files`
- `widgets/remote-widget/remote-widget.widget.ts` — **keep** (absolute URLs)

### 10. Remove nav CSS workaround

**File**: `test/browser/fixtures/index.html`

Remove `.site-nav` CSS rules from global `<style>`. Nav CSS now loads via
ComponentElement → context → renderHTML() → `<style>` injection.

### 11. Export from package

**File**: `src/index.ts` — export `discoverWidgetFiles` and
`generateWidgetFilesManifestCode`.

## Dependencies

- **Steps 1–3, 5–6, 9–11**: Independent of other work.
- **Step 4 (ComponentElement context)**: partially blocked by the **context
  rework** (parallel effort). The file-loading and `context.files` part can
  land now with `pathname: ''` as a placeholder. Full `ComponentContext`
  population (pathname, searchParams) will be completed when the context
  rework merges.

## Verification

1. `deno task test` — all existing tests pass
2. SSR: widget-files page still renders file widget with CSS and data-ssr
3. SSR: nav widget still has CSS on all pages
4. SPA: nav widget now has CSS (loaded via ComponentElement context)
5. SPA: file caching — nav CSS fetched once, reused across navigations
6. Remote widget: absolute URL files still work (explicit override)
7. `nav.widget.ts` and `file-widget.widget.ts` have no manual `files`
8. `Component.files` is still `readonly` — no widget instances mutated
