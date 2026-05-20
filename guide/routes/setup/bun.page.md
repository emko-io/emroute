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

## Configure TypeScript

Bun's default `tsconfig.json` ships with `"lib": ["ESNext"]`. emroute
components use DOM APIs (custom elements, URLPattern), so add DOM types —
edit the `lib` array in the generated `tsconfig.json`:

```json filepath=tsconfig.json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM", "DOM.Iterable"]
    // keep the rest of Bun's defaults — emroute is compatible with
    // strict, noUncheckedIndexedAccess, noImplicitOverride, etc.
  }
}
```

Don't replace the whole file — Bun's defaults include strictness flags
(`noUncheckedIndexedAccess`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`) that emroute is compatible with and that you
likely want to keep.

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
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';

const appRoot = import.meta.dirname!;

const runtime = new BunFsRuntime(appRoot);

const emroute = await Emroute.create({
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
(`Bun.file()`, `Bun.write()`, `Bun.Transpiler`) for best I/O performance. The
SPA build step transpiles `main.ts` with `Bun.Transpiler` and reuses the
pre-built `emroute.js` bundle shipped with the package — no extra tooling
required.

## Run it

```bash
bun run server.ts
```

## Verify

```bash
curl http://localhost:1420/html/    # → HTML page
curl http://localhost:1420/md/      # → Plain text rendering
```

Next: [Pages](pages)
