# First Route

## Create a route

Make a `routes/` directory and add a markdown page:

**`routes/index.page.md`**

```md
# Hello emroute

This is my first page.
```

That's it. One file defines a page that renders as HTML and Markdown.

## Write the server

Create `server.ts` in your project root:

```ts
import { createEmrouteServer } from '@emkodev/emroute/server';
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';
import { render } from './renderer.ts';

const appRoot = import.meta.dirname!;

const runtime = new BunFsRuntime(appRoot, {
  routesDir: '/routes',
});

const emroute = await createEmrouteServer({
  spa: 'none',
  markdownRenderer: { render },
  title: 'My App',
}, runtime);

Bun.serve({
  port: 1420,
  async fetch(req) {
    const response = await emroute.handleRequest(req);
    if (response) return response;
    return new Response('Not Found', { status: 404 });
  },
});

console.log('http://localhost:1420/');
```

Two things to note:

- **`BunFsRuntime`** scans your `routes/` directory and resolves files at
  runtime. All paths are relative to `appRoot`.
- **`spa: 'none'`** means no client-side JavaScript. The server renders HTML
  and Markdown only. We'll cover SPA modes in [Server Setup](./07-server.md).

## Run it

```bash
bun run server.ts
```

## Three rendering modes

emroute serves every page in three formats from the same source:

| URL prefix | Mode         | Output        | Audience                |
|------------|--------------|---------------|-------------------------|
| `/html`    | SSR HTML     | HTML document | Browsers, crawlers      |
| `/md`      | SSR Markdown | Plain text    | LLMs, `curl`, scripts   |
| `/`        | SPA          | JS app shell  | Interactive browser app  |

With `spa: 'none'`, bare paths redirect to `/html`. Try it:

```bash
curl http://localhost:1420/html
# → HTML page with your content

curl http://localhost:1420/md
# → Raw markdown text
```

The same `index.page.md` file produced both outputs.

Next: [Page Types](./03-pages.md)
