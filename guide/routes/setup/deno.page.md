# Setup with Deno

## Prerequisites

- [Deno](https://deno.land) v2+

## Create a new project

```bash
mkdir my-app && cd my-app
deno init
```

## Install emroute

Add to `deno.json`:

```json filepath=deno.json
{
  "imports": {
    "@emkodev/emroute": "npm:@emkodev/emroute",
    "@emkodev/emroute/server": "npm:@emkodev/emroute/server",
    "@emkodev/emroute/runtime/universal/fs": "npm:@emkodev/emroute/runtime/universal/fs"
  }
}
```

Deno fetches and caches npm packages on demand — no `node_modules/` or
manual install step required.

## Configure TypeScript

Deno has built-in TypeScript support. Add DOM types to your `deno.json`:

```json filepath=deno.json
{
  "compilerOptions": {
    "lib": ["deno.ns", "esnext", "dom", "dom.iterable"]
  }
}
```

## First route

Make a `routes/` directory and add an HTML page:

```html filepath=routes/index.page.html
<h1>Hello emroute</h1>
<p>This is my first page.</p>
```

> To use Markdown (`.page.md`) instead, you'll need a markdown renderer.
> See [Markdown Renderers](markdown-renderer) — [emkoma](markdown-renderer/emkoma)
> is built for emroute (handles `router-slot` and widget fences natively);
> [marked](markdown-renderer/marked) and
> [markdown-it](markdown-renderer/markdown-it) also work with a small adapter.

> **Heads up:** the root `index.page.html` also acts as the layout for every
> child route (e.g. `/about`). As soon as you add a second route, this file
> needs a `<router-slot></router-slot>` where the child should render —
> otherwise the child page won't appear. See [Nesting](nesting).

## Write the server

Create `server.ts` in your project root:

```ts filepath=server.ts
import { Emroute } from '@emkodev/emroute/server';
import { UniversalFsRuntime } from '@emkodev/emroute/runtime/universal/fs';

const appRoot = import.meta.dirname!;

const runtime = new UniversalFsRuntime(appRoot);

const emroute = await Emroute.create({
  spa: 'none',
  title: 'My App',
}, runtime);

Deno.serve({ port: 1420 }, async (req) => {
  const response = await emroute.handleRequest(req);
  if (response) return response;
  return new Response('Not Found', { status: 404 });
});

console.log('http://localhost:1420/');
```

`UniversalFsRuntime` uses `node:` APIs (`node:fs/promises`, `node:path`)
which Deno supports natively through its Node compatibility layer.

## Run it

```bash
deno run --allow-net --allow-read --allow-env server.ts
```

For runtime writes (e.g. live editing through `runtime.command()`), add
`--allow-write`. SPA modes don't add extra permission requirements.

## Verify

```bash
curl http://localhost:1420/html/    # → HTML page
curl http://localhost:1420/md/      # → Plain text rendering
```

Next: [Pages](pages)
