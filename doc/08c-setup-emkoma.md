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

```ts
// server.ts
import { createEmrouteServer } from '@emkodev/emroute/server';
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';
import { renderMarkdown } from '@emkodev/emkoma/render';

const appRoot = import.meta.dirname!;

const runtime = new BunFsRuntime(appRoot, {
  routesDir: '/routes',
});

const emroute = await createEmrouteServer({
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

```ts
// main.ts
import { bootEmrouteApp, MarkdownElement } from '@emkodev/emroute/spa';
import { renderMarkdown } from '@emkodev/emkoma/render';

MarkdownElement.setRenderer({ render: renderMarkdown });

await bootEmrouteApp();
```

`setRenderer()` must be called **before** any `<mark-down>` elements are
connected to the DOM.

## Why emkoma?

With marked or markdown-it, you write a `renderer.ts` module that overrides
fence rules to handle `router-slot` and `widget:*` blocks. emkoma handles
these conventions out of the box — just import `renderMarkdown` and pass it
directly. No shared renderer module needed.

The trade-off is that emkoma is pre-release and has a smaller community than
established parsers. If you need a mature, battle-tested solution, use
[marked](./08a-setup-marked.md) or [markdown-it](./08b-setup-markdown-it.md).
