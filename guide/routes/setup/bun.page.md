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

## First route

Make a `routes/` directory and add an HTML page:

**`routes/index.page.html`**

```html
<h1>Hello emroute</h1>
<p>This is my first page.</p>
```

> To use Markdown (`.page.md`) instead, you'll need a markdown renderer.
> See [Markdown Renderers](markdown-renderer) — [marked](markdown-renderer/marked)
> and [markdown-it](markdown-renderer/markdown-it) both work.

## Write the server

Create `server.ts` in your project root:

```ts
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
(`Bun.file()`, `Bun.write()`, `Bun.Transpiler`) for best I/O performance. SPA
mode bundling uses `Bun.build` — no extra tooling required.

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
