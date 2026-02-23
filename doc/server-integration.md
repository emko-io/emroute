# Server Integration Guide

How to wire emroute into your own HTTP server.

## Overview

emroute ships a composable server via `createEmrouteServer()`. It returns an
`EmrouteServer` object whose `handleRequest(req)` method accepts a standard
`Request` and returns `Response | null`. When it returns `null`, the request
didn't match any emroute route or static file — your server handles it.

This design lets you own the HTTP layer. emroute never calls `Deno.serve()`,
`Bun.serve()`, or `http.createServer()` — you do.

## Quick Start

```ts
import { createEmrouteServer } from '@emkodev/emroute/server';
import { DenoFsRuntime } from '@emkodev/emroute/runtime/deno/fs';

const runtime = new DenoFsRuntime(Deno.cwd());

const emroute = await createEmrouteServer({
  routesDir: 'routes',
  spa: 'root',
}, runtime);

Deno.serve(async (req) => {
  const response = await emroute.handleRequest(req);
  return response ?? new Response('Not Found', { status: 404 });
});
```

## API Surface

### `createEmrouteServer(config, runtime)`

Returns `Promise<EmrouteServer>`.

**Config** (`EmrouteServerConfig`):

| Field              | Type                          | Default     | Description                                                     |
| ------------------ | ----------------------------- | ----------- | --------------------------------------------------------------- |
| `routesDir`        | `string`                      | `'routes'`  | Directory containing `.page.ts`, `.page.html`, `.page.md` files |
| `routesManifest`   | `RoutesManifest`              | —           | Pre-built manifest (alternative to `routesDir`)                 |
| `widgetsDir`       | `string`                      | `'widgets'` | Widgets directory (auto-detected if it exists)                  |
| `widgets`          | `WidgetRegistry`              | —           | Pre-built widget registry                                       |
| `spa`              | `SpaMode`                     | `'root'`    | `'none'` · `'leaf'` · `'root'` · `'only'`                      |
| `basePath`         | `BasePath`                    | `{ html: '/html', md: '/md' }` | SSR endpoint prefixes                    |
| `entryPoint`       | `string`                      | —           | SPA entry point (e.g. `'main.ts'`)                              |
| `shell`            | `string \| { path: string }`  | auto        | HTML shell (inline string or path to `index.html`)              |
| `title`            | `string`                      | `'emroute'` | Fallback page title                                             |
| `markdownRenderer` | `MarkdownRenderer`            | —           | Server-side `<mark-down>` expansion                             |
| `extendContext`     | `ContextProvider`            | —           | Inject app-level services into every component                  |
| `moduleLoader`     | `(path: string) => Promise<unknown>` | — | Custom `.page.ts` / `.widget.ts` loader                         |

**`EmrouteServer`** returned object:

| Member           | Type                                      | Description                              |
| ---------------- | ----------------------------------------- | ---------------------------------------- |
| `handleRequest`  | `(req: Request) => Promise<Response \| null>` | The handler — wire this into your server |
| `rebuild`        | `() => Promise<void>`                     | Re-scan routes and widgets               |
| `htmlRouter`     | `SsrHtmlRouter \| null`                   | SSR HTML router (null in `'only'` mode)  |
| `mdRouter`       | `SsrMdRouter \| null`                     | SSR Markdown router                      |
| `manifest`       | `RoutesManifest`                          | Resolved routes manifest                 |
| `widgetEntries`  | `WidgetManifestEntry[]`                   | Discovered widgets                       |
| `shell`          | `string`                                  | Resolved HTML shell                      |

### `handleRequest` Flow

```
Request
  │
  ├─ /md/*   → SSR Markdown renderer → Response (text/markdown)
  ├─ /html/* → SSR HTML renderer → Response (text/html, injected into shell)
  ├─ /html/* or /md/* in 'only' mode → SPA shell (client handles rendering)
  ├─ *.ext   → Runtime file passthrough (JS, CSS, images) → Response or null
  └─ bare    → root/only: SPA shell │ none/leaf: 302 redirect to /html/*
```

When `handleRequest` returns `null`, the request was a file path that didn't
resolve to an existing file. Your server provides the 404.

## Composition Patterns

### Standalone (emroute handles everything)

```ts
Deno.serve(async (req) => {
  return await emroute.handleRequest(req)
    ?? new Response('Not Found', { status: 404 });
});
```

### With API routes

Handle your API first, then delegate to emroute:

```ts
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Your API
  if (url.pathname.startsWith('/api/')) {
    return handleApi(req);
  }

  // emroute handles SSR, SPA, static files
  const response = await emroute.handleRequest(req);
  if (response) return response;

  return new Response('Not Found', { status: 404 });
});
```

### With middleware (auth, logging, CORS)

```ts
Deno.serve(async (req) => {
  // Middleware: logging
  const start = performance.now();

  // Middleware: auth
  if (requiresAuth(req) && !isAuthenticated(req)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const response = await emroute.handleRequest(req)
    ?? new Response('Not Found', { status: 404 });

  console.log(`${req.method} ${new URL(req.url).pathname} ${response.status} ${(performance.now() - start).toFixed(0)}ms`);
  return response;
});
```

### With Hono

```ts
import { Hono } from 'hono';

const app = new Hono();

// Your routes
app.get('/api/health', (c) => c.json({ ok: true }));

// emroute fallback
app.all('*', async (c) => {
  const response = await emroute.handleRequest(c.req.raw);
  return response ?? c.notFound();
});

Deno.serve(app.fetch);
```

### With Oak

```ts
import { Application } from 'oak';

const app = new Application();

app.use(async (ctx) => {
  const response = await emroute.handleRequest(ctx.request.originalRequest);
  if (response) {
    ctx.response.status = response.status;
    ctx.response.headers = new Headers(response.headers);
    ctx.response.body = response.body;
  } else {
    ctx.response.status = 404;
    ctx.response.body = 'Not Found';
  }
});

app.listen({ port: 8000 });
```

## Runtime

emroute doesn't touch the filesystem directly. All I/O goes through a `Runtime`
instance — an abstract class with three methods:

- **`handle(path)`** — raw passthrough for file serving (returns `Response`)
- **`query(path)`** — read a file (returns `Response` or `string` with `{ as: 'text' }`)
- **`command(path, body)`** — write a file

The shipped `DenoFsRuntime` maps these to the local filesystem:

```ts
import { DenoFsRuntime } from '@emkodev/emroute/runtime/deno/fs';

// Root = your project directory. All paths are relative to this.
const runtime = new DenoFsRuntime('/path/to/project');
```

To serve from a different source (S3, KV store, in-memory), implement your own
`Runtime` subclass.

## SPA Modes

The `spa` config controls what the server bundles and serves:

| Mode     | SSR HTML | SSR Markdown | JS bundles | SPA router | Bare path behavior        |
| -------- | -------- | ------------ | ---------- | ---------- | ------------------------- |
| `'none'` | yes      | yes          | no         | no         | redirect to `/html/*`     |
| `'leaf'` | yes      | yes          | yes        | no         | redirect to `/html/*`     |
| `'root'` | yes      | yes          | yes        | yes        | serve SPA shell           |
| `'only'` | no       | no           | yes        | yes        | serve SPA shell           |

- **`none`**: Pure server-rendered. No JavaScript at all. Links go to `/html/*`.
- **`leaf`**: Server-rendered with JS hydration. Widgets hydrate, but no
  client-side routing. Good for embedding mini-apps.
- **`root`**: Full progressive enhancement. Server renders HTML, client hydrates
  and takes over navigation.
- **`only`**: Client-only SPA. Server sends an empty shell, client renders
  everything.

## Bundles

emroute's server does **not** bundle JavaScript — that's a build step you run
separately. The server detects pre-built bundles and wires them via import maps:

| File           | Contains                            |
| -------------- | ----------------------------------- |
| `/emroute.js`  | Framework core (router, elements)   |
| `/widgets.js`  | Widget modules                      |
| `/app.js`      | Consumer entry point                |

If these files exist at the runtime root, the server injects an import map into
the HTML shell. If they don't exist, JS features are disabled with a console
warning.

Bundle with any tool. Example with `deno bundle`:

```bash
deno bundle -o emroute.js src/renderer/spa/mod.ts
deno bundle -o widgets.js --external '@emkodev/emroute/spa' widgets.manifest.g.ts
deno bundle -o app.js --external '@emkodev/emroute/spa' main.ts
```

Or use the CLI's `build` command, which handles bundling automatically:

```bash
deno run -A jsr:@emkodev/emroute/server/cli build
```

## Rebuild on File Changes

Call `emroute.rebuild()` to re-scan routes and widgets after file changes:

```ts
const watcher = Deno.watchFs('routes');
for await (const event of watcher) {
  if (event.paths.some(p => p.endsWith('.page.ts') || p.endsWith('.page.html'))) {
    await emroute.rebuild();
  }
}
```

The CLI (`deno run -A jsr:@emkodev/emroute/server/cli start`) does this
automatically with debouncing.

## Custom Shell

The HTML shell is the wrapper around SSR content. Resolution order:

1. `config.shell` as inline string
2. `config.shell.path` — read from file
3. `/index.html` at runtime root — auto-discovered
4. Built-in default shell

The shell must contain a `<router-slot></router-slot>` element. SSR content is
injected into this slot.

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>My App</title>
</head>
<body>
  <nav>...</nav>
  <router-slot></router-slot>
  <footer>...</footer>
</body>
</html>
```

When `spa !== 'none'`, the server auto-injects:
- `<script type="importmap">` before `</head>` (maps `@emkodev/emroute/spa` to
  the local bundle)
- `<script type="module" src="/app.js">` before `</body>`
- `<link rel="stylesheet" href="/main.css">` if `/main.css` exists

## Markdown Renderer

For server-side `<mark-down>` expansion in SSR HTML, provide a
`MarkdownRenderer`:

```ts
const emroute = await createEmrouteServer({
  routesDir: 'routes',
  markdownRenderer: {
    render: (markdown: string) => myParser.toHtml(markdown),
  },
}, runtime);
```

Without a renderer, `<mark-down>` elements pass through as-is (the client can
render them if JS is available).

## Context Extension

Inject app-level services into every page and widget:

```ts
const emroute = await createEmrouteServer({
  routesDir: 'routes',
  extendContext: (context) => ({
    ...context,
    db: myDatabaseClient,
    auth: myAuthService,
  }),
}, runtime);
```

Components access these via `context.db`, `context.auth`, etc. Use TypeScript
module augmentation for type safety.
