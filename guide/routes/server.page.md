# Server Setup

The server consists of two parts: a **runtime** that reads and serves files
(including on-the-fly TypeScript transpilation), and a **server** that handles
requests and renders pages. An optional **build step** can ship pre-built
client assets (`emroute.js`, `app.js`, `importmap.json`) for SPA modes.

## Minimal server

```ts
import { Emroute } from '@emkodev/emroute/server';
import { UniversalFsRuntime } from '@emkodev/emroute/runtime/universal/fs';
import { render } from './renderer.ts';

const appRoot = import.meta.dirname!;

const runtime = new UniversalFsRuntime(appRoot);

const emroute = await Emroute.create({
  spa: 'none',
  markdownRenderer: { render },
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

## With SPA (root mode)

`BunFsRuntime` serves `.ts` files as transpiled JavaScript on the fly, so a
runtime build step is not required for development. For SPA modes, call
`buildClientBundles()` once to produce the SPA shell assets:

```ts
import { Emroute } from '@emkodev/emroute/server';
import { buildClientBundles } from '@emkodev/emroute/server/build';
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';
import { render } from './renderer.ts';

const appRoot = import.meta.dirname!;

const runtime = new BunFsRuntime(appRoot);

await buildClientBundles({
  runtime,
  root: appRoot,
  spa: 'root',
  // entryPoint: '/main.ts',  // optional, defaults to '/main.ts'
});

const emroute = await Emroute.create({
  spa: 'root',
  markdownRenderer: { render },
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

`buildClientBundles()` produces the SPA shell assets:

1. Copies `emroute.js` (pre-built framework bundle) into the runtime
2. Transpiles the consumer's `main.ts` to `app.js` (or auto-generates a
   default `main.ts` if none exists)
3. Copies `main.css` from disk into the runtime if present
4. Writes a merged `importmap.json` combining the framework's externals
   with any user-defined entries

Per-route module compilation (merging `.ts` source with its `.html`, `.md`,
`.css` companions into a single `.js` artifact) happens at **request time**
by the runtime when a `.ts` URL is requested — it's not part of the build
step.

## Runtime config

The filesystem runtime takes the app root directory and an optional config
object:

```ts
const runtime = new UniversalFsRuntime(appRoot, {
  routesDir: '/routes',        // Optional. Default: '/routes'
  widgetsDir: '/widgets',      // Optional. Default: '/widgets'
  elementsDir: '/elements',    // Optional. Default: '/elements'
});
```

All paths are relative to `appRoot` and start with `/`.

## Server config

`Emroute.create()` accepts:

| Option             | Type                                | Default        | Description |
|--------------------|-------------------------------------|----------------|-------------|
| `spa`              | `'none' \| 'leaf' \| 'root' \| 'only'` | `'root'`   | SPA mode (see below) |
| `title`            | `string`                            | `'emroute'`    | Default page `<title>` |
| `markdownRenderer` | `{ render(md: string): string }`    | —              | Converts markdown to HTML in `<mark-down>` elements |
| `extendContext`    | `(base: ComponentContext) => ComponentContext` | — | Inject services into every component's context |
| `basePath`         | `{ html: string, md: string, app: string }` | `{ html: '/html', md: '/md', app: '/app' }` | URL prefixes for SSR and SPA endpoints |
| `routeTree`        | `RouteNode`                         | —              | Pre-built route tree (skips runtime scanning) |
| `moduleLoaders`    | `Record<string, () => Promise<unknown>>` | — | Pre-built module loaders (used in browser) |
| `shell`            | `(ctx: ShellContext) => string \| Promise<string>` | — | Custom HTML shell. Receives `{ runtime, spa, basePath, title }`. Falls back to a built-in default. |
| `widgets`          | ~~deprecated~~                      | —              | Ignored. Widgets are resolved from the manifest via Runtime. |

## `handleRequest` composability

`handleRequest()` returns `Response | null`. When it returns `null`, the request
didn't match any route — you handle it:

```ts
Bun.serve({
  async fetch(req) {
    // Your API routes first
    if (new URL(req.url).pathname.startsWith('/api/')) {
      return handleApi(req);
    }

    // emroute handles everything else
    const response = await emroute.handleRequest(req);
    if (response) return response;

    // Nothing matched
    return new Response('Not Found', { status: 404 });
  },
});
```

## Consumer main.ts

When using any SPA mode except `'none'`, the build step bundles a consumer
entry point. If the file doesn't exist, a default `main.ts` is auto-generated.

To customize setup (e.g., configuring a markdown renderer for client-side
rendering of `.md` pages), create your own `main.ts`:

```ts
// main.ts
import { bootEmrouteApp, MarkdownElement } from '@emkodev/emroute/spa';
import { renderMarkdown } from '@emkodev/emkoma/render';

MarkdownElement.setRenderer({ render: renderMarkdown });
await bootEmrouteApp();
```

`bootEmrouteApp()` handles everything: fetches route tree and widget manifest
as JSON from the runtime, registers widgets with lazy module loading, creates
the SPA router, and wires client-side navigation.

## SPA modes

The `spa` option controls how the server handles requests:

| Mode     | `GET /`              | `GET /about`         | `/html/*`  | `/md/*`   |
|----------|----------------------|----------------------|------------|-----------|
| `'none'` | 302 → `/html`        | 302 → `/html/about`  | SSR HTML   | SSR MD    |
| `'leaf'` | 302 → `/html`        | 302 → `/html/about`  | SSR HTML + JS | SSR MD |
| `'root'` | 302 → `/app`         | 302 → `/app/about`   | SSR HTML + JS + SPA router | SSR MD |
| `'only'` | 302 → `/app`         | 302 → `/app/about`   | 302 → `/app/*` | 302 → `/app/*` |

In `root` and `only` modes, bare paths redirect to `/app/*` (the SPA
endpoint). In `none` and `leaf` modes, they redirect to `/html/*`.

- **`'none'`** — SSR HTML only. No client-side JavaScript.
- **`'leaf'`** — SSR HTML with JS bundles. Widgets hydrate, but no emroute
  client-side router.
- **`'root'`** (default) — SSR HTML with JS bundles and emroute SPA router.
  After initial load, link clicks are handled client-side.
- **`'only'`** — SPA shell with JS bundles and router. No SSR content.

## Extending context

Inject app-level services (RPC clients, auth, feature flags) so every component
can access them:

```ts
const emroute = await Emroute.create({
  // ...
  extendContext: (base) => ({
    ...base,
    rpc: myRpcClient,
    auth: authService,
  }),
}, runtime);
```

Access in components:

```ts
override async getData({ context }: this['DataArgs']) {
  return context.rpc.getProjects();
}
```

For TypeScript support, augment the `ComponentContext` interface:

```ts
declare module '@emkodev/emroute' {
  interface ComponentContext {
    rpc: RpcClient;
    auth: AuthService;
  }
}
```

## Markdown renderer

The `markdownRenderer` converts markdown to HTML for SSR HTML mode. Without it,
`.page.md` content is wrapped in `<mark-down>` tags but not rendered — meaning
`` ```router-slot``` `` blocks won't become `<router-slot>` elements and nesting
won't work for pages that use markdown-only nesting.

The renderer must implement `{ render(md: string): string }` and handle
emroute's fenced block conventions (`` ```router-slot``` ``,
`` ```widget:name``` ``). See [Markdown Renderers](markdown-renderer)
for the full guide, including setup instructions for
[marked](markdown-renderer/marked) and [markdown-it](markdown-renderer/markdown-it).

SSR Markdown mode (`/md/*`) returns raw markdown text — slot replacement happens
on the raw markdown before any rendering, so `markdownRenderer` is not involved.

Next: [Markdown Renderers](markdown-renderer)
