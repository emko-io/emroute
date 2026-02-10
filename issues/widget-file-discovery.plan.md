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

SPA router (`src/renderer/spa/html.renderer.ts` line 329):

```
context = await this.core.buildComponentContext(route.pattern, route, params)
→ fetches route.files.{html,md,css} via HTTP
→ passes context to component.getData() and component.renderHTML()
```

## How Widgets Work Today

SSR: `loadWidgetFiles()` in `route.core.ts:188` reads `widget.files` paths
(supports both relative and absolute URLs), fetches content, caches it. Both
SSR renderers pass loaded files as `context.files`.

SPA: `ComponentElement` (`src/element/component.element.ts`) calls
`renderHTML({ data, params })` — no context, no files, `widget.files` ignored.

## Changes

### 1. Remove `readonly` from `Component.files`

**File**: `src/component/abstract.component.ts` (line 54)

Allow auto-discovery to set files on widget instances after construction.

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

### 3. Widget file discovery utility

**File**: `tool/widget.generator.ts` (new)

```typescript
export async function discoverWidgetFiles(
  widgetsDir: string,
  widgets: Iterable<{ name: string; files?: { html?: string; md?: string; css?: string } }>,
  fs: FileSystem,
  pathPrefix?: string,
): Promise<void>;
```

For each widget, checks for `{widgetsDir}/{name}/{name}.widget.{html,md,css}`
using `fs.exists()`. Merges with explicit `widget.files`:

```
discovered = { css: 'widgets/nav/nav.widget.css' }  // from filesystem
explicit   = { css: 'https://cdn.example.com/nav.css' }  // on class
result     = { ...discovered, ...explicit }  // explicit wins
```

**Important**: Skip discovery entirely for widgets that already declare `files`
with local (relative) paths. Auto-discovery only makes sense for widgets that
either have no `files` at all, or declare `files` with absolute URLs (external
overrides). Scanning the filesystem for companion files that the widget already
explicitly points to is redundant work.

### 4. ComponentElement fetches files and passes context

**File**: `src/element/component.element.ts`

- Add `private context: ComponentContext | undefined`
- Add `private async loadFiles()` — reads `this.component.files`, fetches
  content via HTTP (same URL resolution as `loadWidgetFiles`: absolute URLs
  pass through, relative paths get `'/' +` prefix)
- Call `loadFiles()` in `connectedCallback` before `loadData()`
- Pass `this.context` to `getData()` and `renderHTML()`
- Static `Map<string, string>` cache to avoid re-fetching across mounts

### 5. Server-side integration

**File**: `test/browser/setup.ts`

After registering widgets, call `discoverWidgetFiles()` to auto-populate
`widget.files` for SSR.

### 6. SPA integration

**File**: `test/browser/setup.ts` — generate `widget-files.manifest.ts`
alongside `routes.manifest.ts` with discovered file paths.

**File**: `test/browser/fixtures/main.ts` — import manifest, apply discovered
files to widget instances before `ComponentElement.register()`.

### 7. Remove manual `files` from convention-following widgets

- `widgets/nav/nav.widget.ts` — remove `override readonly files`
- `widgets/file-widget/file-widget.widget.ts` — remove `override readonly files`
- `widgets/remote-widget/remote-widget.widget.ts` — **keep** (absolute URLs)

### 8. Remove nav CSS workaround

**File**: `test/browser/fixtures/index.html`

Remove `.site-nav` CSS rules from global `<style>`. Nav CSS now loads via
ComponentElement → context → renderHTML() → `<style>` injection.

### 9. Export from package

**File**: `src/index.ts` — export `discoverWidgetFiles`.

## Verification

1. `deno task test` — all existing tests pass
2. SSR: widget-files page still renders file widget with CSS and data-ssr
3. SSR: nav widget still has CSS on all pages
4. SPA: nav widget now has CSS (loaded via ComponentElement context)
5. SPA: file caching — nav CSS fetched once, reused across navigations
6. Remote widget: absolute URL files still work (explicit override)
7. `nav.widget.ts` and `file-widget.widget.ts` have no manual `files`
