# Setup with Node

## Prerequisites

- [Node.js](https://nodejs.org) v18+

## Create a new project

```bash
mkdir my-app && cd my-app
npm init -y
```

## Install emroute

```bash
npm add @emkodev/emroute
```

emroute ships compiled JavaScript alongside TypeScript source. Node uses the
compiled `.js` files automatically — no extra loaders or flags needed.

## Configure TypeScript

emroute components use DOM APIs (custom elements, URLPattern), so your
`tsconfig.json` needs DOM types. Add `"DOM"` and `"DOM.Iterable"` to your
existing `lib` array — don't replace the whole file or you'll drop any
strictness flags your editor/build already relies on:

```json filepath=tsconfig.json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "nodenext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

emroute is compatible with strict TypeScript options including
`noUncheckedIndexedAccess` and `noImplicitOverride` — keep them enabled if
your existing config has them.

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
import { createServer } from 'node:http';
import { Emroute } from '@emkodev/emroute/server';
import { UniversalFsRuntime } from '@emkodev/emroute/runtime/universal/fs';

const appRoot = import.meta.dirname!;

const runtime = new UniversalFsRuntime(appRoot);

const emroute = await Emroute.create({
  spa: 'none',
  title: 'My App',
}, runtime);

createServer(async (req, res) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const request = new Request(url, { method: req.method });
  const response = await emroute.handleRequest(request);

  if (!response) {
    res.writeHead(404).end('Not Found');
    return;
  }

  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
}).listen(1420, () => {
  console.log('http://localhost:1420/');
});
```

`UniversalFsRuntime` uses only `node:` APIs — no platform-specific dependencies.

## Run it

Node needs a TypeScript loader for your own `.ts` files. Use
[tsx](https://github.com/privatenumber/tsx) or Node's built-in type stripping:

```bash
# Option 1: tsx (recommended)
npx tsx server.ts

# Option 2: Node 22+ built-in
node --experimental-strip-types server.ts
```

> Note: `--experimental-strip-types` only works for your own files, not
> `node_modules`. emroute ships compiled JS so this works — but your own server
> code still needs a loader or the flag.

## Verify

```bash
curl http://localhost:1420/html/    # → HTML page
curl http://localhost:1420/md/      # → Plain text rendering
```

Next: [Pages](pages)
