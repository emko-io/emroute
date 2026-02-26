# Migrating from 1.6 to 1.7

Version 1.7 replaces the SPA router layer, switches from a flat route manifest
to a tree structure, and separates bundling from the Runtime. Your routes, pages,
widgets, and companion files stay exactly the same — the changes are in server
setup and SPA initialization.

## Quick summary

| 1.6 | 1.7 |
|-----|-----|
| `SpaHtmlRouter` / `SpaHashRouter` | `EmrouteApp` via `bootEmrouteApp()` |
| `RoutesManifest` (flat array) | `RouteNode` (tree) |
| `runtime.bundle()` | `buildClientBundles()` |
| `RuntimeConfig.entryPoint` | `BuildOptions.entryPoint` |
| `emroute:routes` / `emroute:widgets` virtual modules | JSON manifests fetched at boot |
| `createSpaHtmlRouter(manifest)` | `bootEmrouteApp()` |
| `SsrHtmlRouter.render(pathname)` | `SsrHtmlRouter.render(url, signal)` |

## Server setup

### Before (1.6)

```ts
import { createEmrouteServer } from '@emkodev/emroute/server';
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';

const runtime = new BunFsRuntime('.', {
  routesDir: '/routes',
  widgetsDir: '/widgets',
  entryPoint: '/main.ts',   // bundling config lived on runtime
});

const emroute = await createEmrouteServer({
  spa: 'root',
  markdownRenderer: { render },
}, runtime);

Bun.serve({ fetch: (req) => emroute.handleRequest(req) ?? new Response('Not Found', { status: 404 }) });
```

### After (1.7)

```ts
import { createEmrouteServer } from '@emkodev/emroute/server';
import { buildClientBundles } from '@emkodev/emroute/server/build';
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';

const runtime = new BunFsRuntime('.', {
  routesDir: '/routes',
  widgetsDir: '/widgets',
  // entryPoint removed — bundling is a separate step
});

// Build client bundles (transpile+merge modules, bundle consumer main.ts)
await buildClientBundles({
  runtime,
  root: import.meta.dirname!,
  spa: 'root',
  // entryPoint: '/main.ts',  // optional, defaults to '/main.ts'
});

const emroute = await createEmrouteServer({
  spa: 'root',
  markdownRenderer: { render },
}, runtime);

Bun.serve({ fetch: (req) => emroute.handleRequest(req) ?? new Response('Not Found', { status: 404 }) });
```

Key changes:
1. `entryPoint` moves from `RuntimeConfig` to `buildClientBundles()`
2. Call `buildClientBundles()` **before** `createEmrouteServer()`
3. The build step transpiles `.ts` modules to `.js`, inlines companion files,
   and updates manifests — the server reads the processed `.js` files

## Consumer main.ts

### Before (1.6)

```ts
import { routesManifest } from 'emroute:routes';
import { widgetsManifest } from 'emroute:widgets';
import { ComponentElement, createSpaHtmlRouter } from '@emkodev/emroute/spa';

for (const widget of widgetsManifest.widgets) {
  ComponentElement.register(widget, widgetsManifest.moduleLoaders);
}

await createSpaHtmlRouter(routesManifest);
```

### After (1.7)

```ts
import { bootEmrouteApp, MarkdownElement } from '@emkodev/emroute/spa';
import { renderMarkdown } from '@emkodev/emkoma/render';

MarkdownElement.setRenderer({ render: renderMarkdown });
await bootEmrouteApp();
```

Key changes:
1. No more `emroute:routes` / `emroute:widgets` virtual modules — manifests are
   fetched as JSON at boot time
2. No manual widget registration — `bootEmrouteApp()` handles everything
3. Set up your markdown renderer **before** calling `bootEmrouteApp()`
4. If you don't provide a `main.ts`, one is auto-generated (without markdown
   renderer — add your own if you have `.md` pages)

## Route format

The route manifest changed from a flat array to a tree. If you only use
`createEmrouteServer()` and let it read manifests from the runtime, this is
transparent — the runtime produces the new format automatically.

If you construct manifests programmatically:

### Before (1.6)

```ts
const manifest: RoutesManifest = {
  routes: [
    { pattern: '/', type: 'page', modulePath: '/routes/index.page.ts', files: {} },
    { pattern: '/about', type: 'page', modulePath: '/routes/about.page.ts', files: { md: '...' } },
    { pattern: '/users/:id', type: 'page', modulePath: '/routes/users/[id].page.ts', files: {} },
  ],
  errorBoundaries: [{ pattern: '/', modulePath: '/routes/index.error.ts' }],
};

const emroute = await createEmrouteServer({ routesManifest: manifest }, runtime);
```

### After (1.7)

```ts
const routeTree: RouteNode = {
  files: { ts: '/routes/index.page.ts' },
  errorBoundary: '/routes/index.error.ts',
  children: {
    about: { files: { md: '/routes/about.page.md' } },
  },
  dynamic: {
    param: 'id',
    child: { files: { ts: '/routes/users/[id].page.ts' } },
  },
};

const emroute = await createEmrouteServer({ routeTree }, runtime);
```

## Base paths

`BasePath` gained an `app` field for the SPA shell endpoint:

### Before (1.6)

```ts
const emroute = await createEmrouteServer({
  basePath: { html: '/html', md: '/md' },
}, runtime);
```

### After (1.7)

```ts
const emroute = await createEmrouteServer({
  basePath: { html: '/html', md: '/md', app: '/app' },
}, runtime);
```

The default is `{ html: '/html', md: '/md', app: '/app' }`. In `root` and
`only` modes, bare paths (e.g. `/`, `/about`) now redirect to `/app/*` instead
of `/html/*`.

## Runtime changes

### Removed from Runtime

| Method | Replacement |
|--------|-------------|
| `runtime.bundle()` | `buildClientBundles({ runtime, root, spa })` |
| `Runtime.compress()` | Removed (use native compression) |
| `Runtime.stopBundler()` | `esbuild.stop()` is called internally |
| `runtime.writeShell()` | Handled by `buildClientBundles()` |

### Removed from RuntimeConfig

| Field | Replacement |
|-------|-------------|
| `entryPoint` | `BuildOptions.entryPoint` |
| `bundlePaths` | `BuildOptions.bundlePaths` |
| `spa` | `BuildOptions.spa` |

### Added to Runtime

| Method | Purpose |
|--------|---------|
| `transpile(source)` | TypeScript → JavaScript (instance method, not static) |

If you have a custom Runtime, implement `transpile()` to enable per-file module
merging during the build step.

## Removed exports

These are no longer available from `@emkodev/emroute/spa`:

- `SpaHtmlRouter`, `createSpaHtmlRouter()`, `SpaHtmlRouterOptions`
- `SpaHashRouter` / `HashRouter`, `createHashRouter()`, `HashRouterOptions`,
  `HashRouteConfig`
- `RoutesManifest`, `RouteConfig`, `RouteInfo`, `ErrorBoundary`, `RouteFileType`

These are no longer available from `@emkodev/emroute`:

- `RoutesManifest`
- `prefixManifest()`

## New exports

From `@emkodev/emroute/spa`:

- `EmrouteApp`, `createEmrouteApp()`, `EmrouteAppOptions`
- `bootEmrouteApp()`, `BootOptions`

From `@emkodev/emroute`:

- `RouteNode`, `RouteFiles`
- `RouteResolver`, `ResolvedRoute`
- `RouteTrie`

From `@emkodev/emroute/server/build`:

- `buildClientBundles()`, `BuildOptions`

From `@emkodev/emroute/runtime/fetch`:

- `FetchRuntime` — browser-compatible Runtime for thin client

## Hash router

`SpaHashRouter` / `createHashRouter()` is removed. If you used hash routing for
embedded apps in `leaf` mode, use a lightweight hash router library or implement
your own with `window.addEventListener('hashchange', ...)`. emroute's hash
router was 200 lines — most apps need far less.

## SSR renderer signature

If you call `htmlRouter.render()` or `mdRouter.render()` directly:

### Before (1.6)

```ts
const result = await emroute.htmlRouter.render('/about');
```

### After (1.7)

```ts
const url = new URL('/about', 'http://localhost');
const result = await emroute.htmlRouter.render(url, AbortSignal.timeout(5000));
```

The render method now takes a full `URL` (for query string access) and an
`AbortSignal` (for cancellation). If you only use `handleRequest()`, this
change is transparent.

## What didn't change

- **Route files** — `*.page.ts`, `*.page.html`, `*.page.md`, `*.page.css` work
  exactly the same
- **Widget files** — `*.widget.ts` with companion files, same lifecycle
- **PageComponent / WidgetComponent** — same interface, same `getData`,
  `renderHTML`, `renderMarkdown`, `hydrate`
- **`<mark-down>` element** — same API
- **`<widget-*>` elements** — same SSR hydration with `ssr` attribute
- **Error boundaries** — `*.error.ts` files work the same
- **Redirects** — `*.redirect.ts` files work the same
- **Markdown rendering** — same `MarkdownRenderer` interface
- **Context provider** — same `extendContext` on server config
- **`handleRequest()` composability** — same `Response | null` pattern
