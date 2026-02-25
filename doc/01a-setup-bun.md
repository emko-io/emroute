# Setup with Bun

## Prerequisites

- [Bun](https://bun.sh) v1.1+

## Create a new project

```bash
mkdir my-app && cd my-app
bun init -y
```

## Install emroute

```bash
bun add @emkodev/emroute
```

You'll also need a markdown renderer for `.page.md` files. See
[Markdown Renderers](./08-markdown-renderer.md) for setup — [marked](./08a-setup-marked.md)
and [markdown-it](./08b-setup-markdown-it.md) both work well.

## Configure TypeScript

Bun's default `tsconfig.json` only includes `"lib": ["ESNext"]`. emroute
components use DOM APIs (custom elements, URLPattern), so add DOM types:

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true
  }
}
```

## Install esbuild (optional)

If you plan to use SPA mode (client-side navigation), install esbuild. It's
used to bundle the browser entry point:

```bash
bun add -d esbuild
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
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';

const appRoot = import.meta.dirname!;

const runtime = new BunFsRuntime(appRoot, {
  routesDir: '/routes',
});

const emroute = await createEmrouteServer({
  spa: 'none',
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

Bun understands TypeScript natively, so `BunFsRuntime` uses Bun-native APIs
(`Bun.file()`, `Bun.write()`, `Bun.Transpiler`) for best I/O performance.

## Run it

```bash
bun run server.ts
```

## Verify

```bash
curl http://localhost:1420/html    # → HTML page
curl http://localhost:1420/md      # → Raw markdown
```

Next: [Pages](./03-pages.md)
