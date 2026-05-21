# Hono Integration

emroute composes with any HTTP framework that uses Web Standard `Request` /
`Response`. This guide uses [Hono](https://hono.dev).

## Install

```bash
bun add hono @emkodev/emroute marked
```

## Markdown renderer

Create a shared renderer used by both server and client. It must handle
emroute's fenced block conventions — `router-slot` (for nested routes) and
`widget:name` (for embedded widgets):

````md
```router-slot
```
````

renders as `<router-slot></router-slot>`, and

````md
```widget:counter
{"start": "42"}
```
````

renders as `<widget-counter start="42"></widget-counter>`.

See [Markdown Renderers](markdown-renderer) for full setup with
[marked](markdown-renderer/marked) or [markdown-it](markdown-renderer/markdown-it).

## Server

```ts filepath=server.ts
// server.ts
import { Hono } from 'hono';
import { Emroute } from '@emkodev/emroute/server';
import { buildClientBundles } from '@emkodev/emroute/server/build';
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';
import { render } from './renderer.ts';

const appRoot = import.meta.dirname!;

const runtime = new BunFsRuntime(appRoot);

await buildClientBundles({ runtime, root: appRoot, spa: 'root' });

const emroute = await Emroute.create({
  spa: 'root',
  markdownRenderer: { render },
  title: 'emroute + hono',
}, runtime);

const app = new Hono();

// Your API routes — defined before the emroute catch-all
app.get('/api/hello', (c) => c.json({ hello: 'world' }));

// emroute handles everything else
app.all('*', async (c) => {
  const response = await emroute.handleRequest(c.req.raw);
  if (response) return response;
  return c.notFound();
});

export default app;
```

Key points:

- **`buildClientBundles()`** produces `emroute.js`, `app.js`, and `importmap.json`
  for SPA mode. Call it before `Emroute.create()`. Skip for `spa: 'none'`.
- **`BunFsRuntime`** is used here because `buildClientBundles()` calls
  `runtime.transpile()`, which `UniversalFsRuntime` doesn't implement.
- **`c.req.raw`** gives Hono's underlying Web API `Request`, which emroute
  expects.
- **`handleRequest()`** returns `Response | null` — return it when matched, fall
  through to Hono's 404 when `null`.
- **`export default app`** — Bun serves Hono apps via the default export (no
  `Bun.serve()` needed).
- Hono routes defined before the catch-all take priority over emroute routes.

## First route

```md filepath=routes/index.page.md
<!-- routes/index.page.md -->
# Hello emroute + Hono

This page is served by emroute through a Hono server.
```

## Run

```bash
bun run server.ts
```

## Verify

```table
{
  "head": [
    "Endpoint",
    "Response"
  ],
  "body": [
    [
      "`GET /`",
      "302 → `/app/` (SPA shell)"
    ],
    [
      "`GET /app/`",
      "SPA — client-side routing"
    ],
    [
      "`GET /html/`",
      "SSR HTML — markdown rendered to HTML"
    ],
    [
      "`GET /md/`",
      "SSR Markdown — raw markdown text"
    ],
    [
      "`GET /api/hello`",
      "`{\"hello\":\"world\"}` (Hono route)"
    ]
  ]
}
```

All three rendering paths work. Hono routes coexist with emroute routes.

Next: [Browser-Only JavaScript](browser-js)
