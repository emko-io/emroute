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

```json
{
  "nodeModulesDir": "manual",
  "imports": {
    "@emkodev/emroute": "npm:@emkodev/emroute"
  }
}
```

Then install:

```bash
deno install
```

The `nodeModulesDir: "manual"` setting is needed so esbuild can resolve
packages from `node_modules/` during bundling.

You'll also need a markdown renderer for `.page.md` files. See
[Markdown Renderers](./08-markdown-renderer.md) for setup — [marked](./08a-setup-marked.md)
and [markdown-it](./08b-setup-markdown-it.md) both work well.

## Configure TypeScript

Deno has built-in TypeScript support. Add DOM types to your `deno.json`:

```json
{
  "compilerOptions": {
    "lib": ["esnext", "dom", "dom.iterable"]
  }
}
```

## Install esbuild (optional)

If you plan to use SPA mode (client-side navigation), add esbuild:

```json
{
  "imports": {
    "@emkodev/emroute": "npm:@emkodev/emroute",
    "esbuild": "npm:esbuild"
  }
}
```

Skip this if you only need server-side rendering (`spa: 'none'`).

## First route

Make a `routes/` directory and add a markdown page:

**`routes/index.page.md`**

```md
# Hello emroute

This is my first page.
```

## Write the server

Create `server.ts` in your project root:

```ts
import { createEmrouteServer } from '@emkodev/emroute/server';
import { UniversalFsRuntime } from '@emkodev/emroute/runtime/universal/fs';

const appRoot = import.meta.dirname!;

const runtime = new UniversalFsRuntime(appRoot, {
  routesDir: '/routes',
});

const emroute = await createEmrouteServer({
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

Deno understands TypeScript natively. `UniversalFsRuntime` uses `node:` APIs
which Deno supports through its Node compatibility layer.

## Run it

```bash
deno run --allow-net --allow-read server.ts
```

## Verify

```bash
curl http://localhost:1420/html    # → HTML page
curl http://localhost:1420/md      # → Raw markdown
```

Next: [Pages](./03-pages.md)
