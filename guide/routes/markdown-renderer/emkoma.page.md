# Setting Up emkoma

This guide uses [@emkodev/emkoma](https://github.com/emkodev/emkoma), a
markdown renderer built for emroute. It natively handles ```` ```router-slot ````
and ```` ```widget:name ```` fenced blocks — no custom renderer code needed.

emkoma is currently pre-release. It works well but the API may change.

## 1. Install

```bash
bun add @emkodev/emkoma
```

## 2. Server setup

```ts filepath=server.ts
// server.ts
import { Emroute } from '@emkodev/emroute/server';
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';
import { renderMarkdown } from '@emkodev/emkoma/render';

const appRoot = import.meta.dirname!;

const runtime = new BunFsRuntime(appRoot);

const emroute = await Emroute.create({
  markdownRenderer: { render: renderMarkdown },
}, runtime);

Bun.serve({
  port: 1420,
  async fetch(req) {
    const response = await emroute.handleRequest(req);
    if (response) return response;
    return new Response('Not Found', { status: 404 });
  },
});
```

## 3. Client setup

The default SPA mode is `'root'`, which ships a JS bundle to the browser. If
your `main.ts` imports `@emkodev/emkoma/render`, the browser also needs to
resolve that specifier — and emroute's auto-generated import map only includes
its own packages.

Add an `importmap.json` so the browser can resolve the bare `@emkodev/emkoma/`
specifier:

```json filepath=importmap.json
{
  "imports": {
    "@emkodev/emkoma/": "https://esm.sh/@emkodev/emkoma/"
  }
}
```

`buildClientBundles()` merges this with the framework's externals. See
[Browser JS](browser-js) for details on import maps.

Then write `main.ts`:

```ts filepath=main.ts
// main.ts
import { bootEmrouteApp, MarkdownElement } from '@emkodev/emroute/spa';
import { renderMarkdown } from '@emkodev/emkoma/render';

MarkdownElement.setRenderer({ render: renderMarkdown });

await bootEmrouteApp();
```

`setRenderer()` must be called **before** any `<mark-down>` elements are
connected to the DOM.

> **SSR-only?** If you don't need a SPA, pass `spa: 'none'` to
> `Emroute.create()` and skip the client setup entirely — no `main.ts`, no
> import map needed. The server still renders markdown via the configured
> `markdownRenderer` for `/html/*` and serves raw markdown at `/md/*`.

## Why emkoma?

With marked or markdown-it, you write a `renderer.ts` module that overrides
fence rules to handle `router-slot` and `widget:*` blocks. emkoma handles
these conventions out of the box — just import `renderMarkdown` and pass it
directly. No shared renderer module needed.

The trade-off is that emkoma is pre-release and has a smaller community than
established parsers. If you need a mature, battle-tested solution, use
[marked](markdown-renderer/marked) or [markdown-it](markdown-renderer/markdown-it).
