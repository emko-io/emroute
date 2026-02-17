# Server API & Static Bundling

## Problem

emroute's server layer has two gaps:

1. **No consumer-facing server API.** The dev server (`createDevServer`) is a
   monolith that owns the HTTP handler, bundling, file watching, and SSR — all
   in one function. Consumers like emkoord can't compose emroute's SSR into
   their own servers without duplicating significant logic (emkoord's
   `EmrouteHandler` is 450 lines of reimplementation). There's no clean
   interface that says "here's how you plug SSR rendering into your server."

2. **No static bundle output.** The dev server shells out to `deno bundle
   --watch` and serves the output from `.build/` at runtime. There's no way to
   produce a static build artifact (JS bundle + pre-rendered HTML) for
   deployment behind nginx/CDN. The three-way rendering promise (`/html/` SSR,
   `/md/` SSR, `/` SPA) requires a server for SSR, but the SPA shell + JS
   bundle should be deployable statically.

## Current State

### emroute server (what we have)

```
server/
  server.type.ts    — ServerRuntime abstraction (Deno/Node)
  server.deno.ts    — Deno implementation of ServerRuntime
  dev.server.ts     — createDevServer() monolith (~860 lines)
  cli.deno.ts       — CLI entry point (env vars → config)
```

`createDevServer` does everything:

- Generates routes manifest → `routes.manifest.g.ts`
- Discovers widgets → `widgets.manifest.g.ts`
- Generates `_main.g.ts` entry point
- Shells out to `deno bundle` for JS bundling
- Builds SSR routers (`SsrHtmlRouter`, `SsrMdRouter`)
- Constructs HTML shell (generated or consumer-provided)
- Handles all HTTP requests (SSR, static files, SPA fallback)
- Watches files and regenerates on changes

### emkoord (how a consumer uses emroute today)

emkoord imports emroute's SSR renderers directly:

```typescript
import { createSsrHtmlRouter } from '@emkodev/emroute/ssr/html';
import { createSsrMdRouter } from '@emkodev/emroute/ssr/md';
import { generateRoutesManifest } from '@emkodev/emroute/generator';
import { discoverWidgets } from '@emkodev/emroute/widget-generator';
```

Then `EmrouteHandler` (in emkoord) reimplements:

- Route manifest generation with module loaders
- Widget discovery and registration
- SSR router construction
- HTML shell injection (`injectSsrContent`)
- SPA fallback logic
- Request routing (`/html/*` → SSR HTML, `/md/*` → SSR MD, static files, SPA)
- `extendContext` for injecting RPC client via `AsyncLocalStorage`

This works but is fragile — emkoord must track emroute internals and
reimplement shell injection, SSR content wrapping, etc.

## Proposal

### 1. Extract a composable `EmrouteServer` (not a "handler")

A self-contained unit that owns SSR rendering, manifest generation, and request
handling — but does NOT own the HTTP server or bundling. Consumers provide a
`Request`, get back a `Response`.

```typescript
// @emkodev/emroute/server (new primary export, replaces dev-server-only export)

interface EmrouteServerConfig {
  /** Absolute path to app root */
  appRoot: string;

  /** Routes directory (relative to appRoot). Triggers auto-discovery. */
  routesDir?: string;

  /** Pre-built manifest (alternative to routesDir) */
  routesManifest?: RoutesManifest;

  /** Widgets directory (relative to appRoot). Triggers auto-discovery. */
  widgetsDir?: string;

  /** Pre-built widget registry (alternative to widgetsDir) */
  widgets?: WidgetRegistry;

  /** SPA mode — controls what gets served */
  spa?: SpaMode;

  /** Base paths for SSR endpoints */
  basePath?: BasePath;

  /** HTML shell (string or path to index.html) */
  shell?: string | { path: string };

  /** Page title (fallback for generated shell) */
  title?: string;

  /** Markdown renderer for <mark-down> expansion */
  markdownRenderer?: MarkdownRenderer;

  /** Extend ComponentContext per-request (e.g., inject RPC client) */
  extendContext?: (base: ComponentContext, req: Request) => ComponentContext;

  /** TLS config for optional HTTP/2 support */
  tls?: { cert: string; key: string };

  /**
   * Response compression. Negotiated via Accept-Encoding header.
   * - true: enable all supported encodings (br, gzip, deflate)
   * - false/undefined: no compression (default — consumer may handle externally)
   * - string[]: enable specific encodings, e.g. ['br', 'gzip']
   */
  compression?: boolean | CompressionEncoding[];

  /** Port for self-fetch (companion file resolution) */
  port?: number;
}

interface EmrouteServer {
  /** Handle an HTTP request. Returns null if not an emroute route. */
  handleRequest(req: Request): Promise<Response | null>;

  /** Rebuild manifests (call after file changes) */
  rebuild(): Promise<void>;

  /** The SSR HTML router (null in 'only' mode) */
  readonly htmlRouter: SsrHtmlRouter | null;

  /** The SSR Markdown router (null in 'only' mode) */
  readonly mdRouter: SsrMdRouter | null;

  /** The resolved routes manifest */
  readonly manifest: RoutesManifest;
}

function createEmrouteServer(config: EmrouteServerConfig): Promise<EmrouteServer>;
```

### SpaMode behavior in `handleRequest`

The mode controls what `handleRequest` claims (returns a `Response` for) vs
ignores (returns `null`, letting the consumer handle it). It also controls what
the build step produces.

#### `none` — zero JS

- **SSR `/html/*`**: yes — renders HTML, wraps in shell (no `<script>` tag)
- **SSR `/md/*`**: yes — renders Markdown
- **Bare paths** (`/`, `/about`): redirect 302 → `/html/` equivalent
- **Build**: no bundles, no entry point generation. Only manifests + shell.
- **Use case**: pure SSR sites, forms + redirects, progressive enhancement
  testing. The goal mode for proving emroute works with zero JS.

#### `leaf` — SSR + hydration, no client router

- **SSR `/html/*`**: yes — renders HTML, wraps in shell with `<script>` tag
- **SSR `/md/*`**: yes — renders Markdown
- **Bare paths**: `/` redirects 302 → `/html/`; other bare paths serve SPA
  shell (for embedded apps)
- **Build**: core bundle (no `SpaHtmlRouter`) + app bundle. Widgets hydrate.
  App entry point registers widgets only.
- **Use case**: SSR site with interactive widgets. Embedded apps (React/Vue
  with hash routing) can live inside widgets. No emroute client-side nav.

#### `root` — full SSR + SPA (default)

- **SSR `/html/*`**: yes — renders HTML with `data-ssr-route` for SPA adoption
- **SSR `/md/*`**: yes — renders Markdown
- **Bare paths**: serve SPA shell (router handles client-side nav)
- **Build**: core bundle (full, with `SpaHtmlRouter`) + app bundle.
  App entry point registers widgets + creates router.
- **Use case**: full progressive enhancement. First load is SSR, subsequent
  navigation is SPA. Links use `/html/` base path, router intercepts them.

#### `only` — SPA shell, no SSR

- **SSR `/html/*`**: **no** — serves SPA shell (no server rendering)
- **SSR `/md/*`**: **no** — serves SPA shell
- **Bare paths**: serve SPA shell
- **Build**: core + app bundles, same as `root`.
- **`handleRequest` returns `Response`** for ALL non-file paths (serves shell).
  Returns `null` only for paths with file extensions (static files).
- **Use case**: client-side only apps. SSR routers not constructed at all.

#### Summary table

| Concern                  | `none`     | `leaf`          | `root`    | `only`    |
| ------------------------ | ---------- | --------------- | --------- | --------- |
| Core bundle              | no         | yes (no router) | yes       | yes       |
| App bundle               | no         | yes             | yes       | yes       |
| `createSpaHtmlRouter()`  | no         | no              | yes       | yes       |
| SSR `/html/*`            | yes        | yes             | yes       | **no**    |
| SSR `/md/*`              | yes        | yes             | yes       | **no**    |
| Bare `/` fallback        | 302 → html | 302 → html      | SPA shell | SPA shell |
| Bare `/about` fallback   | 302 → html | SPA shell       | SPA shell | SPA shell |
| `htmlRouter` constructed | yes        | yes             | yes       | **no**    |
| `mdRouter` constructed   | yes        | yes             | yes       | **no**    |
| `<script>` in shell      | no         | yes             | yes       | yes       |

**For `createEmrouteServer`**: the mode determines which routers are constructed
and what `handleRequest` does. In `only` mode, `htmlRouter` and `mdRouter` are
`null` — `handleRequest` only serves the SPA shell for non-file paths. The
consumer never needs to branch on mode themselves; the `EmrouteServer` does it
internally.

### Response compression

When `compression` is enabled, `handleRequest` negotiates encoding via the
request's `Accept-Encoding` header and compresses the response body.

```typescript
type CompressionEncoding = 'br' | 'gzip' | 'deflate';
```

Supported encodings (in preference order):

| Encoding  | API                            | Notes                                                                          |
| --------- | ------------------------------ | ------------------------------------------------------------------------------ |
| `br`      | `CompressionStream('br')`      | Best ratio. Supported in all modern browsers. Requires HTTPS in some contexts. |
| `gzip`    | `CompressionStream('gzip')`    | Universal. The safe default.                                                   |
| `deflate` | `CompressionStream('deflate')` | Legacy. Rarely needed.                                                         |

All three use the web-standard `CompressionStream` API (available in Deno and
modern Node.js) — zero dependencies.

**When to enable**: Enable in the server when there's no reverse proxy (nginx,
Cloudflare) handling compression upstream. In production behind a CDN,
compression is typically off at the origin and handled at the edge.

**What gets compressed**: HTML, Markdown, JS, CSS, JSON responses. Binary
responses (images, WASM, fonts) are skipped — they're already compressed or
incompressible. The threshold is content-length > 1KB (compressing tiny
responses adds overhead).

**Dev server default**: `compression: false` — keep dev simple, avoid masking
content-length in devtools.

Key differences from the dev server:

- **No HTTP server** — consumer owns `Deno.serve()` / Express / Hono / etc.
- **No bundling** — that's a build step, not a server concern
- **No file watching** — consumer can call `rebuild()` from their own watcher
- **No `ServerRuntime` abstraction** — uses standard APIs (`fetch`, `import()`)
- **Returns `null`** for non-emroute requests — consumer handles static files,
  API routes, etc. themselves
- **`extendContext` receives `Request`** — consumer can derive per-request
  context (auth, RPC) without `AsyncLocalStorage` hacks

### 2. What emkoord would look like

```typescript
import { createEmrouteServer } from '@emkodev/emroute/server';

const emroute = await createEmrouteServer({
  appRoot: Deno.cwd(),
  routesDir: 'routes',
  widgetsDir: 'widgets',
  spa: 'leaf',
  markdownRenderer: emkoMd,
  extendContext: (base, req) => {
    const actor = authStrategy(req);
    const rpc = new JsonRpcClient(new InProcessTransport(adapter, actor));
    return { ...base, rpc };
  },
});

// In Deno.serve handler:
const emrouteResponse = await emroute.handleRequest(req);
if (emrouteResponse) return emrouteResponse;

// ... handle /rpc, /health, /ws, /mcp, static files ...
```

This eliminates `EmrouteHandler` entirely. emkoord becomes a thin composition of
emkoord's own concerns (RPC, WebSocket, MCP, auth) + emroute server.

### 3. Build command with split bundles

Separate from the server entirely — a build tool. The JS output is split into
two bundles: a **core bundle** (emroute framework) and an **app bundle**
(consumer code).

#### Why split?

- **Cache efficiency**: The core bundle (`emroute.js`) changes only when
  emroute is upgraded. The app bundle (`app.js`) changes on every route/widget
  edit. CDNs and browsers cache them independently.
- **Faster dev rebuilds**: Only the app bundle needs rebuilding on code changes.
  The core bundle is stable across the session.
- **Cleaner separation**: The core bundle is emroute's responsibility (router,
  component element, hydration). The app bundle is the consumer's (routes,
  widgets, custom code).

#### What goes where

| Bundle              | Contains                                           |
| ------------------- | -------------------------------------------------- |
| `emroute.js` (core) | `ComponentElement`, `SpaHtmlRouter`, hydration     |
|                     | logic, `<router-slot>` element, route matching.    |
|                     | Only produced when `spa !== 'none'`.               |
| `app.js` (app)      | `routes.manifest.g.ts`, `widgets.manifest.g.ts`,   |
|                     | all route `.ts` modules, all widget `.ts` modules, |
|                     | consumer's custom entry point code.                |
|                     | Imports core bundle via `import` specifier.        |

In `none` mode, neither bundle is produced.
In `leaf` mode, core bundle excludes `SpaHtmlRouter`.
In `root`/`only` mode, core bundle includes everything.

#### Pluggable bundler

emroute should not hardcode `deno bundle`. Different consumers have different
toolchains (esbuild, Vite, Rollup, `deno bundle`, etc.). The build API accepts
a `Bundler` interface:

```typescript
/** A bundler takes an entry point and produces a JS output file. */
interface Bundler {
  /**
   * Bundle a single entry point to an output file.
   * @param entry  - Absolute path to the entry .ts file
   * @param output - Absolute path to the desired output .js file
   * @param options - Bundle options
   */
  bundle(entry: string, output: string, options: BundleOptions): Promise<void>;

  /**
   * Start watching an entry point and rebundle on changes.
   * Returns a handle to stop watching. Optional — if not implemented,
   * the dev server falls back to rebuild-on-change via file watcher.
   */
  watch?(entry: string, output: string, options: BundleOptions): Promise<BundleWatchHandle>;
}

interface BundleOptions {
  /** Target environment */
  platform: 'browser';

  /** Enable minification (default: false) */
  minify?: boolean;

  /** Enable obfuscation / mangling (default: false) */
  obfuscate?: boolean;

  /** Generate source maps (default: true in dev, false in prod) */
  sourcemap?: boolean;

  /** External modules — don't bundle these, leave as imports */
  external?: string[];
}

interface BundleWatchHandle {
  close(): void;
}
```

emroute ships a **default bundler** based on `deno bundle` (zero dependencies).
Consumers can swap it:

```typescript
import { esbuildBundler } from './my-esbuild-bundler.ts'; // consumer-provided

await build({
  appRoot: '.',
  routesDir: 'routes',
  bundler: esbuildBundler,
  minify: true,
});
```

#### Minification and obfuscation

These are `BundleOptions` flags passed through to the bundler:

- **`minify: true`** — Remove whitespace, shorten identifiers, dead-code
  eliminate. Expected for production builds. The default `deno bundle` bundler
  supports this natively (`--minify` flag).
- **`obfuscate: true`** — Mangle property names, control flow flattening, etc.
  Beyond what standard minification does. Not all bundlers support this —
  the `Bundler` implementation decides what `obfuscate` means. For `deno
  bundle`, this maps to `--minify` (no separate obfuscation). A consumer using
  esbuild + terser could go further.

The build command's top-level `minify` and `obfuscate` flags are convenience
that flow into `BundleOptions`:

```typescript
await build({ ..., minify: true });
// equivalent to: bundler.bundle(entry, output, { minify: true, ... })
```

#### Core bundle as CDN asset

Since the core bundle is pure emroute framework code (no consumer code), it can
be published as a versioned, pre-built artifact:

```
https://cdn.jsr.io/@emkodev/emroute@1.5.0/dist/emroute.min.js
```

When a consumer opts into the CDN core:

```typescript
await build({
  appRoot: '.',
  routesDir: 'routes',
  coreBundle: 'cdn', // use CDN instead of building locally
  // or: coreBundle: 'https://cdn.example.com/emroute@1.5.0/emroute.min.js'
});
```

The HTML shell uses an import map to resolve the bare `@emkodev/emroute`
specifier to the CDN URL:

```html
<script type="importmap">
  {
    "imports": {
      "@emkodev/emroute/spa": "https://cdn.jsr.io/@emkodev/emroute@1.5.0/dist/emroute.min.js"
    }
  }
</script>
<script type="module" src="/app.js"></script>
```

Benefits:

- **Zero build step for core** — only the app bundle needs building
- **Shared cache across sites** — multiple emroute apps on the same CDN origin
  share the cached core bundle
- **Faster CI** — skip core bundling entirely

The pre-built `emroute.min.js` would be published alongside the JSR package,
minified and ready to serve. This is an opt-in optimization, not a requirement.

#### API

```typescript
// @emkodev/emroute/build (new export)

interface BuildConfig {
  /** App root */
  appRoot: string;

  /** Routes directory */
  routesDir: string;

  /** Widgets directory */
  widgetsDir?: string;

  /** Output directory (default: 'dist') */
  outDir?: string;

  /** SPA mode */
  spa?: SpaMode;

  /** Base paths */
  basePath?: BasePath;

  /** Entry point for app bundle (auto-generated if omitted) */
  entryPoint?: string;

  /** Bundler implementation (default: deno bundle) */
  bundler?: Bundler;

  /** Enable minification (default: false in dev, true in prod) */
  minify?: boolean;

  /** Enable obfuscation (default: false) */
  obfuscate?: boolean;

  /** Generate source maps (default: true in dev, false in prod) */
  sourcemap?: boolean;

  /**
   * Core bundle strategy:
   * - 'build' (default): bundle emroute core locally
   * - 'cdn': use CDN-hosted pre-built emroute.min.js
   * - string URL: use a specific CDN URL
   */
  coreBundle?: 'build' | 'cdn' | string;

  /** Pre-render routes to static HTML (optional) */
  prerender?: boolean;
}

interface BuildResult {
  /** Path to core framework bundle (null in 'none' mode or CDN) */
  coreBundle: string | null;

  /** CDN URL for core bundle (if coreBundle='cdn' or URL) */
  coreBundleCdn: string | null;

  /** Path to app bundle (null in 'none' mode) */
  appBundle: string | null;

  /** Path to HTML shell */
  shell: string;

  /** Pre-rendered HTML files (if prerender=true) */
  prerendered?: Map<string, string>;

  /** Generated manifests */
  manifests: {
    routes: string;
    widgets?: string;
  };
}

function build(config: BuildConfig): Promise<BuildResult>;
```

This would:

1. Generate `routes.manifest.g.ts` and `widgets.manifest.g.ts`
2. Generate app entry point (`_main.g.ts`) — imports from core via bare specifier
3. Bundle core (or resolve CDN URL): `bundler.bundle(...)` → `dist/emroute.js`
   (or `emroute.min.js` if minified), skipped if `coreBundle='cdn'`
4. Bundle app: `bundler.bundle(...)` → `dist/app.js` (or `app.min.js`)
5. Optionally pre-render all routes to static HTML (SSG)
6. Output to `dist/`:
   ```
   dist/
     index.html          # SPA shell with import map + script tags
     emroute.min.js      # Core bundle (omitted if CDN)
     app.min.js           # App bundle (routes, widgets, consumer code)
     main.css            # (if exists)
     html/               # Pre-rendered HTML (if prerender=true)
       index.html
       about.html
       ...
   ```

#### HTML shell script tags

```html
<!-- none mode: no scripts -->

<!-- leaf/root/only mode with local core bundle -->
<script type="importmap">
  { "imports": { "@emkodev/emroute/spa": "/emroute.min.js" } }
</script>
<script type="module" src="/app.min.js"></script>

<!-- leaf/root/only mode with CDN core bundle -->
<script type="importmap">
  {
    "imports": {
      "@emkodev/emroute/spa": "https://cdn.jsr.io/@emkodev/emroute@1.5.0/dist/emroute.min.js"
    }
  }
</script>
<script type="module" src="/app.min.js"></script>
```

The import map lets the app bundle use bare `import ... from '@emkodev/emroute/spa'`
at runtime, resolved by the browser to either local or CDN URL. This is the
standard web platform mechanism — no bundler magic needed at the seam between
core and app.

### 4. Dev server becomes a thin wrapper

```typescript
// Simplified dev server (internal, not part of public API)
async function createDevServer(config: DevServerConfig, runtime: ServerRuntime) {
  const emroute = await createEmrouteServer({
    appRoot: config.appRoot,
    routesDir: config.routesDir,
    tls: config.tls,
    // ...
  });

  // Split bundling via pluggable bundler (dev-only concern)
  const bundler = config.bundler ?? defaultDenoBundler;
  if (spa !== 'none') {
    // Core bundle: only rebuild on emroute version change
    await bundler.bundle(coreEntry, coreBuildPath, { platform: 'browser' });
    // App bundle: watch mode, rebuilds on route/widget changes
    if (bundler.watch) {
      bundler.watch(appEntry, appBuildPath, { platform: 'browser' });
    }
  }

  // File watching (dev-only concern)
  if (watch) {
    runtime.watchDir(routesDir, () => emroute.rebuild());
  }

  // HTTP handler composes emroute + static files
  const serve = config.tls
    ? (port: number, handler: RequestHandler) => runtime.serve(port, handler, { tls: config.tls })
    : runtime.serve;

  serve(port, async (req) => {
    const response = await emroute.handleRequest(req);
    if (response) return response;
    return serveStaticFile(req, appRoot);
  });
}
```

The split bundle in dev mode means only the app bundle rebuilds on code changes.
The core bundle is built once at startup (or cached from a previous run).

## Three-Way Rendering Deployment Model

```
               ┌─────────────────────────┐
               │      Build Step          │
               │  emroute build           │
               │  → dist/emroute.js (core) │
               │  → dist/app.js (consumer)│
               │  → dist/index.html       │
               │  → dist/html/*.html (SSG)│
               └────────┬────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│  CDN/nginx  │  │  SSR Server │  │  SSR Server │
│  serves /   │  │  /html/*    │  │  /md/*      │
│  (SPA only) │  │  (dynamic)  │  │  (dynamic)  │
└────────────┘  └────────────┘  └────────────┘
```

- **`/`** — Static SPA shell + JS bundle. Deployable to any CDN. No server
  needed. Client-side routing via `SpaHtmlRouter`.
- **`/html/*`** — Server-rendered HTML. Requires running server with
  `EmrouteServer`. Progressive enhancement: works without JS.
- **`/md/*`** — Server-rendered Markdown. Same server. For LLMs, curl, API
  consumers.

The static SPA bundle serves as the "offline" or "CDN" mode. SSR routes require
a server but give you SEO, no-JS support, and markdown rendering.

## Implementation Status

1. **Extract `createEmrouteServer`** — Done. `server/prod.server.ts`.
   Full-featured server: SSR rendering, manifest generation, static file
   serving, `serve(port)`, `handleRequest(req)`.

2. **Migrate dev server** — Done. `server/dev.server.ts` is now a thin
   wrapper (~310 lines, down from ~860) around `createEmrouteServer`. Only
   handles dev concerns: entry point generation, bundling, `.build/` serving,
   aliases, file watching, dev CORS.

3. **Add `build` command** — Done. `build()` in `server/prod.server.ts`.
   Split bundles (core `emroute.js` + app `app.js`), pluggable `Bundler`
   interface, import maps, CDN core option (`coreBundle: 'cdn' | 'build' | URL`).
   Default output dir is `appRoot` so `serve()` picks up bundles automatically.

4. **Response compression** — Done. `CompressionStream`-based, negotiated
   via `Accept-Encoding`. Supports `br`, `gzip`, `deflate`. Opt-in via
   `compression: true` in config. Only compresses text types > 1KB.

5. **`.g.ts` naming convention** — Done. All generated files use `.g.ts`
   suffix: `routes.manifest.g.ts`, `widgets.manifest.g.ts`, `_main.g.ts`.
   `.gitignore` uses `*.g.ts` pattern.

6. **Validate with emkoord** — Pending. Replace `EmrouteHandler` with
   `createEmrouteServer`.

## Resolved Questions

- **Self-fetch**: Solved with `file://` URLs. Deno's `fetch()` supports
  `file://` natively. `baseUrl` defaults to `file://${cwd}`, dev server
  overrides with `http://localhost:${port}` for self-fetch.

- **Entry point generation**: `build()` auto-generates `_main.g.ts` when no
  `entryPoint` is provided. Uses `generateMainTs()` (shared with dev server).

- **Pre-rendering (SSG)**: Dropped. The server is the product — SSG bolted
  onto an SSR framework adds complexity without clear value. If all content
  is static, the SPA shell handles it client-side.

- **CSS bundling**: Left to consumers. emroute doesn't own CSS tooling.

## Conventions

### Generated files use `.g.ts` suffix

All generated files follow the `{name}.g.ts` naming convention (matching
hardkore's `hardkore-registry.g.ts`, `hardkore-base.g.ts`). Every generated
file starts with a comment block:

```typescript
/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated by @emkodev/emroute. Changes will be overwritten.
 */
```

Generated files:

- `routes.manifest.g.ts` — route definitions and module loaders
- `widgets.manifest.g.ts` — widget entries and module loaders
- `_main.g.ts` — SPA entry point (when no custom entry point provided)

These should be `.gitignore`d in consumer projects.

## Streaming SSR (exploratory)

### The opportunity

Currently `renderPage` is fully synchronous-await: it walks the route hierarchy
top-to-bottom, calls `getData()` + `renderHTML()` for each level, injects child
into parent's `<router-slot>`, resolves all widgets, then returns the complete
HTML string. The full response is buffered in memory before a single byte is
sent.

Streaming lets the server start sending HTML while slow parts (`getData()`,
widget resolution) are still in progress. The browser renders progressively —
the user sees the layout shell immediately.

### Target modes

Streaming is primarily a **server-side SSR concern** — the modes where the
server actually renders HTML:

- **`none`**: Primary target. No JS at all. Streaming is the _only_ way to
  give the user immediate feedback. Everything else is a full page load.
- **`leaf`**: Benefits on **non-leaf pages** (layouts). Layout routes render
  server-side and don't have client-side routing. Streaming the layout shell
  while `getData()` runs on a child route is valuable. Leaf pages hydrate
  client-side, so streaming matters less there.
- **`root` / `only`**: Full SPA. Client-side navigation handles everything
  after initial load. These modes should stay full SPA. Not a streaming
  target.

### Two streaming patterns

#### 1. Layout shell streaming (in-order, zero JS)

The route hierarchy is inherently nested: root layout → parent → ... → leaf.
The outer layout's HTML _before_ `<router-slot>` can be sent immediately. The
inner content streams when ready. The outer layout's HTML _after_ the slot
streams last.

```
┌─ root layout (head, nav, opening tags) ─── SEND IMMEDIATELY
│  ┌─ parent layout (section header) ─────── SEND WHEN READY
│  │  ┌─ leaf content ────────────────────── SEND WHEN READY
│  │  └──────────────────────────────────────
│  └─────────────────────────────────────────
└─ root layout (footer, closing tags) ─────── SEND LAST
```

This is **in-order streaming** — content arrives in document order. The browser
progressively renders as chunks arrive. **Works in `none` mode — zero JS.**

The pipeline change: instead of building a complete string and doing regex
`<router-slot>` replacement at the end, `renderPage` would:

1. Render root layout HTML, split at `<router-slot>`
2. Send the "before slot" chunk
3. Recurse into child route
4. Send the "after slot" chunk

This means `renderPage` returns a `ReadableStream` instead of a `string`, and
`injectSlot` becomes a stream composition rather than string replacement.

**Title caveat**: The `<title>` is in the shell wrapper, sent before we know
the leaf route's title. Cheapest fix: pre-resolve the leaf route's title via
`getTitle()` before starting the stream. `getTitle()` rarely needs data — it
usually derives from params or is static.

#### 2. `<router-slot>` as streaming checkpoint — GET query example

The route hierarchy already provides the streaming boundaries. No new
`PageComponent` methods needed. Each `<router-slot>` in the hierarchy is a
checkpoint: the HTML _before_ the slot sends immediately, then the child
route's `getData()` + `renderHTML()` execute, and the result streams when
ready.

**Example**: `GET /html/articles?search=triple+rendering`

Route hierarchy: root layout → articles page (leaf).

The root layout renders instantly (no `getData()` — it's static nav/chrome):

```html
<nav>...</nav>
<main>
  <router-slot></router-slot> ← streaming checkpoint
</main>
<footer>...</footer>
```

The streaming pipeline:

1. **Send immediately**: root layout up to `<router-slot>` — nav, `<main>`
2. **Await**: articles page `getData({ context: { searchParams } })` — the
   search query runs server-side
3. **Send when ready**: articles page `renderHTML()` output — form + results
4. **Send**: root layout after the slot — `</main>`, footer

```html
<!-- CHUNK 1: sent immediately — layout shell -->
<!DOCTYPE html>
<html>
  <head><title>Articles</title></head>
  <body>
    <nav>...</nav>
    <main>
      <!-- browser renders nav immediately, connection stays open -->

      <!-- CHUNK 2: sent when getData() resolves — leaf content -->
      <form method="GET" action="/html/articles">
        <input name="search" value="triple rendering">
        <button>Search</button>
      </form>
      <article>
        <h2>Triple Rendering with emroute</h2>
        <p>...</p>
      </article>
      <article>
        <h2>SSR, SPA, and Markdown</h2>
        <p>...</p>
      </article>

      <!-- CHUNK 3: sent last — closing layout -->
    </main>
    <footer>...</footer>
  </body>
</html>
```

The user sees the nav and page chrome immediately. The search results appear
as `getData()` finishes. **Zero JS, zero new component API.** Standard GET
form with `method="GET"` and `action="/html/articles"` — the browser handles
the submission natively.

**Deeper hierarchies stream more granularly.** If the route hierarchy is
root → section → subsection → leaf, each `<router-slot>` is a checkpoint.
The root layout sends first, then each parent sends its content up to its
slot as soon as _its_ `getData()` resolves. The leaf is the last chunk.
Parents with no `getData()` (static layouts) resolve instantly — their
content merges into the previous chunk.

**`leaf` mode non-leaf pages**: Layout routes in `leaf` mode benefit
identically — the layout shell streams immediately, the child route's
data-driven content streams when ready.

### Widget streaming in `none` mode

Widgets in `none` mode can only stream **in-order** — there's no JS to swap
placeholders. Each widget blocks the stream until its `getData()` resolves.
In practice this is acceptable: widgets are typically small data fetches, and
in-order streaming still beats full buffering because the content _before_ slow
widgets is already visible.

If a page has multiple slow widgets, they serialize in document order. This is
a fine tradeoff for zero-JS mode. For modes with JS (`leaf`), widgets hydrate
client-side and don't need server streaming at all.

### What doesn't need streaming

- **`/md/*` routes**: Markdown is small and fast. No streaming benefit.
- **`root` / `only` modes**: Full SPA. Client-side routing handles nav.
  Streaming the initial SSR load is marginally useful but not worth the
  complexity — these modes should stay full SPA.
- **Static routes** (no `getData`): Already fast. No slow async to stream
  around.

### Implementation considerations

**`ReadableStream` API**: Web-standard, available in Deno and Node.js. The
response becomes:

```typescript
return new Response(stream, {
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
});
```

**Compression interaction**: Streaming + compression works — `CompressionStream`
can wrap a `ReadableStream`. Chunks are compressed individually, which slightly
reduces compression ratio vs. buffered. Acceptable tradeoff.

**Error handling mid-stream**: HTTP status code is already sent (200). Options:

- Stream an inline error message into the result area
- Use error boundaries: stream the boundary's content in place of the failed
  route
- For `getData()` errors in `renderResult`: stream an error state (the shell
  is already sent, so the page remains usable)

### Additivity assessment

**This is a purely additive feature.** The key evidence:

1. **No `PageComponent` changes.** Streaming uses the existing
   `getData()` + `renderHTML()` contract. The `<router-slot>` boundaries
   already exist in the route hierarchy — streaming just splits the output
   at those points instead of concatenating everything first.
2. `render()` can return either `string` (buffered, current) or
   `ReadableStream` (streaming, new). The server config controls which path.
   A `string` return is just a single-chunk stream.
3. `EmrouteServer.handleRequest()` signature doesn't change — it returns
   `Promise<Response | null>`. The `Response` body is either a string or a
   stream; the consumer doesn't care which.
4. No existing types need modification. Only a `streaming?: boolean` config
   field is added.

**Recommendation**: The `<router-slot>` streaming approach requires no
interface changes at all — it's purely an internal renderer optimization.
**Postpone implementation entirely.** When we build it, it changes `renderPage`
internals (string concatenation → stream composition) but touches zero public
API surface. The `EmrouteServerConfig` can gain a `streaming?: boolean` flag
at that point without breaking anything.

## Non-Goals

- **Production HTTP server in emroute** — emroute provides the rendering
  engine, not the server. Consumers bring their own (Deno.serve, Express, Hono,
  emkoord's server, etc.).
- **Config file** — per ADR-0012, conventions first. The `EmrouteServerConfig`
  interface IS the configuration surface.
- **Plugin system** — `extendContext` and composable `handleRequest` are
  sufficient. No middleware chains or hook systems.
