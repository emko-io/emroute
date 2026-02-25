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
    "@emkodev/emroute": "npm:@emkodev/emroute",
    "@emkodev/emroute/server": "npm:@emkodev/emroute/server",
    "@emkodev/emroute/runtime/universal/fs": "npm:@emkodev/emroute/runtime/universal/fs"
  }
}
```

Then install:

```bash
deno install
```

`nodeModulesDir: "manual"` is required when using `UniversalFsRuntime`. It
uses `createRequire()` to resolve esbuild during bundling, and the bundler
itself needs `node_modules/` to resolve package imports. Without a physical
`node_modules/` directory, module resolution during bundling will fail.

If you need to avoid `node_modules/` entirely, you can create a custom
Runtime that resolves modules differently. See [Runtime](./09-runtime.md)
for details on implementing your own. For background on why emroute moved
from JSR to npm, see
[ADR-0017](./architecture/ADR-0017-move-to-bun-ecosystem.md).

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

## Install esbuild

Add esbuild to your import map — it's required for bundling (SPA modes, widgets):

```json
{
  "imports": {
    "@emkodev/emroute": "npm:@emkodev/emroute",
    "@emkodev/emroute/server": "npm:@emkodev/emroute/server",
    "@emkodev/emroute/runtime/universal/fs": "npm:@emkodev/emroute/runtime/universal/fs",
    "esbuild": "npm:esbuild"
  }
}
```

Skip this only if you use `spa: 'none'` and have no widgets.

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

`UniversalFsRuntime` uses `node:` APIs which Deno supports through its Node
compatibility layer.

## Run it

```bash
deno run --allow-net --allow-read --allow-write --allow-env --allow-run server.ts
```

`--allow-write` is needed for bundle output. `--allow-run` is needed for
esbuild's native binary.

## Verify

```bash
curl http://localhost:1420/html    # → HTML page
curl http://localhost:1420/md      # → Raw markdown
```

Next: [Pages](./03-pages.md)
