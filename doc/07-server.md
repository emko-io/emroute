# Server Setup

The server consists of two parts: a **runtime** that reads files and bundles
assets, and a **server** that handles requests and renders pages.

## Minimal server

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

## Runtime config

`BunFsRuntime` takes the app root directory and a config object:

```ts
const runtime = new BunFsRuntime(appRoot, {
  routesDir: '/routes',        // Required. Where route files live.
  widgetsDir: '/widgets',      // Optional. Where widget files live.
  entryPoint: '/main.ts',      // Optional. SPA entry point for bundling.
});
```

All paths are relative to `appRoot` and start with `/`.

## Server config

`createEmrouteServer()` accepts:

| Option             | Type                                | Default        | Description |
|--------------------|-------------------------------------|----------------|-------------|
| `spa`              | `'none' \| 'leaf' \| 'root' \| 'only'` | `'root'`   | SPA mode (see below) |
| `title`            | `string`                            | `'emroute'`    | Default page `<title>` |
| `markdownRenderer` | `{ render(md: string): string }`    | —              | Converts markdown to HTML in `<mark-down>` elements |
| `extendContext`    | `(base: ComponentContext) => ComponentContext` | — | Inject services into every component's context |
| `basePath`         | `{ html: string, md: string }`      | `{ html: '/html', md: '/md' }` | URL prefixes for SSR endpoints |
| `stream`           | `boolean`                           | `false`        | Stream SSR HTML responses |
| `routesManifest`   | `RoutesManifest`                    | —              | Pre-built manifest (skips runtime scanning) |
| `widgets`          | `WidgetRegistry`                    | —              | Manually registered widgets |

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

## SPA entry point

When using any SPA mode except `'none'`, set `entryPoint` in the runtime config:

```ts
const runtime = new BunFsRuntime(appRoot, {
  routesDir: '/routes',
  widgetsDir: '/widgets',
  entryPoint: '/main.ts',
});
```

If the file doesn't exist, the runtime generates a default `main.ts`
automatically. If you want custom setup (e.g., configuring a markdown renderer
for client-side rendering), create your own:

```ts
// main.ts
import { createSpaHtmlRouter, MarkdownElement } from '@emkodev/emroute/spa';
import { routesManifest } from 'emroute:routes';
import { render } from './renderer.ts';

MarkdownElement.setRenderer({ render });

await createSpaHtmlRouter(routesManifest);
```

The `emroute:routes` import is a virtual module resolved at bundle time — no
generated files on disk.

## SPA modes

The `spa` option controls how the server handles requests:

| Mode     | `GET /`              | `GET /about`         | `/html/*`  | `/md/*`   |
|----------|----------------------|----------------------|------------|-----------|
| `'none'` | 302 → `/html`        | 302 → `/html/about`  | SSR HTML   | SSR MD    |
| `'leaf'` | 302 → `/html`        | 302 → `/html/about`  | SSR HTML + JS | SSR MD |
| `'root'` | 302 → `/html`        | 302 → `/html/about`  | SSR HTML + JS + SPA router | SSR MD |
| `'only'` | 302 → `/html`        | 302 → `/html/about`  | SPA shell  | SPA shell |

All modes redirect bare paths to the configured HTML base path (`/html` by
default). The mode controls what the server bundles and serves there:

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
const emroute = await createEmrouteServer({
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
`` ```widget:name``` ``). See [Markdown Renderers](./08-markdown-renderer.md)
for the full guide, including setup instructions for
[marked](./08a-setup-marked.md) and [markdown-it](./08b-setup-markdown-it.md).

SSR Markdown mode (`/md/*`) returns raw markdown text — slot replacement happens
on the raw markdown before any rendering, so `markdownRenderer` is not involved.

Next: [Markdown Renderers](./08-markdown-renderer.md)
