# Server Vision

## Zero-Config Default

```ts
const runtime = new DenoServerRuntime('.');
const emroute = await createEmrouteServer({ spa: 'leaf' }, runtime);
emroute.serve(3000);
```

`spa` mode is explicitly required — no inference, no magic. Everything else is filesystem conventions.

## Convention-Based Detection

Given an `appRoot`, the server detects:

- `routes/` exists → scan routes, generate `routes.manifest.g.ts`
- `widgets/` exists → scan widgets, generate `widgets.manifest.g.ts`
- `main.ts` exists → use as entry point; otherwise generate `_main.g.ts`
- `index.html` exists → use as shell; otherwise generate a default shell
- `main.css` exists → inject `<link>` tag into shell
- `app.js` + `emroute.js` exist after bundling → inject import map + `<script>` tag into shell

No `routesDir`, `widgetsDir`, `entryPoint` config. Want different layouts? Implement your own runtime.

## Bundling

The server orchestrates bundling. The runtime provides a `bundle()` method — `DenoServerRuntime` uses `deno bundle`, others can use esbuild in-memory, etc. The server never knows how bundling works, only that the runtime can do it. Chunked bundling needs to be addressed first (see Open Questions).

**Proven** (`spike/`):
- **esbuild**: bundles entirely in-memory via virtual filesystem plugin — no disk access. Non-filesystem runtimes can feed files directly.
- **`deno bundle`**: requires filesystem paths, no stdin support. For non-filesystem runtimes, fallback is temp dir → bundle → clean up. Works but not as clean.

The SPA mode dictates what gets bundled:

- `none` → no bundling, no JS, no script tags
- `leaf` → widgets hydration only (no router)
- `root` / `only` → widgets + router

Two output bundles:
- `emroute.js` — the framework (hydration, router, custom elements)
- `app.js` — the consumer's code (routes, widgets, manifests)

`app.js` imports from `@emkodev/emroute/spa` as an external. An import map in the shell resolves it to `emroute.js`.

The server generates `_main.g.ts` (or uses consumer's `main.ts`), runs the bundler, and injects the right script tags into the shell — all based on the SPA mode. Source `index.html` is never modified.

## Shell Injection

The server builds the shell in memory at startup:

1. Read source `index.html` (or generate default)
2. Inject `<link>` for `main.css` if it exists
3. Based on SPA mode and bundler output:
   - Inject `<script type="importmap">` mapping `@emkodev/emroute/spa` → `/emroute.js`
   - Inject `<script type="module" src="/app.js">`
4. Use this in-memory shell for all SSR responses

No writing back to `index.html`. No generated HTML files. The source stays clean.

## Manifest Files

`routes.manifest.g.ts` and `widgets.manifest.g.ts` are written into the runtime (via `runtime.writeTextFile()`), not to a hardcoded filesystem path. The runtime decides where they go — filesystem runtimes write to disk, other runtimes can store them however they want.

These manifests serve two purposes:

1. The bundler consumes them into `app.js` — not necessarily via filesystem `import`. Bundlers like esbuild can work in-memory via code API, manifests can be fetched or lazily resolved. Filesystem import is the default path, not the only one.
2. Consumers use them to build navbars, CMS widget pickers, drag-and-drop editors — any UI that needs to enumerate available routes or widgets

## Runtime Abstraction

`ServerRuntime` is an abstract class defined by emroute. It abstracts both the platform (Deno, Node, Bun) and the source of files. Each runtime is initialized with a root — a directory path for filesystem runtimes, a connection for database runtimes, etc. This root IS the `appRoot`. The server never knows or cares about absolute paths, CWD, or where things physically live. It requests `routes/`, `widgets/`, `index.html` from the runtime, and the runtime resolves them against its own root.

The consumer instantiates the runtime with the required constructor arguments and passes it to the server:

```ts
const runtime = new DenoServerRuntime('../pathtor-app');
const emroute = await createEmrouteServer({ spa: 'leaf' }, runtime);
```

Switching runtimes is painless — same interface, different constructor:

```ts
const runtime = new DatabaseRuntime(dbConnection);
const emroute = await createEmrouteServer({ spa: 'leaf' }, runtime);
```

`appRoot` is not server config — it belongs to the runtime. Server config is purely behavioral.

The runtime owns bundling as a method — `DenoServerRuntime` calls `deno bundle` via `Deno.Command`, an esbuild runtime would call esbuild as code. The server doesn't know or care about the mechanism.

emroute ships two runtimes:

- **`NodeServerRuntime`** — full `node:fs`/`node:http` based, compatible with Deno, Node, and Bun
- **`DenoServerRuntime`** — extends the Node runtime, partially overrides with Deno-native APIs for Rust-level performance

Future: Bun-specific, SQLite-backed, and IndexedDB runtimes (full offline browser setup).

## Static Files

Static file serving (images, fonts, assets) goes through the runtime. The runtime decides how to handle it — filesystem runtimes serve from disk, hybrid runtimes can mix sources (e.g. database for pages, passthrough for `/assets/`).

## Change Notifications & Live Rebuild

MAYBE: The runtime could provide a `subscribe()` method so the server knows when routes, widgets, or companion files change and can rebuild manifests + re-bundle. The abstract base class implements this as a no-op — no notifications emitted. Filesystem runtimes can implement it via file watching. Database runtimes could implement it via triggers or polling.

Live rebuild is opt-in. When enabled, newly added pages appear without restart. Changes should be managed softly without hard-reload — chunked bundle updates (from spike branch) would fit well here.

## Context Extension

`extendContext` stays as server config. It lets consumers inject additional data into the component context per request (e.g. emkoord injects RPC clients for SSR data fetching). This is a valid extension point, not a convention.

## Graceful Degradation

- No `routes/` → serve built-in 404 in a built-in shell
- No `widgets/` → fine, skip widgets
- Bundler fails → fall back to `none` behavior (SSR without JS)

## File Loading

All file loading goes through the runtime — both server-side and client-side:

- **SSR**: reads companion files (.html, .md, .css) via `runtime.readTextFile('routes/about.page.html')`
- **Client-side**: SPA components `fetch()` companion files from the server (e.g. `fetch('/widgets/my.widget.html')`), which serves them through the runtime. No special endpoint needed — `self` fetch is not blocked by proper CSP (unlike even `localhost`).

No `baseUrl`, no `file://` URLs, no fetch hacks. The runtime is the single source for all file access. This is what makes database/API runtimes possible — the same interface works regardless of the source.

Runtimes can also serve external content — e.g. fetching widgets or markdown from a third-party CMS, CDN, or microservice. The server doesn't know or care where the content comes from.

## Composability

The server exposes `handleRequest(req: Request): Promise<Response | null>` as the primary integration point. `serve(port)` is a convenience for standalone use. Real apps compose `handleRequest()` with their own server — emkoord, Hono, Express, or bare `Deno.serve`. No obstacles to wrapping.

```ts
// Standalone
emroute.serve(3000);

// Composed with emkoord / Hono / anything
Deno.serve(async (req) => {
  if (isApiRoute(req)) return handleApi(req);
  return await emroute.handleRequest(req) ?? new Response('Not Found', { status: 404 });
});
```

## SPA Modes

`spa` is the only behavioral config. It controls:

- What the bundler produces
- What script tags the shell gets
- Whether SSR content is rendered

| Mode   | SSR | JS Bundle | Router |
|--------|-----|-----------|--------|
| `none` | yes | no        | no     |
| `leaf` | yes | yes       | no     |
| `root` | yes | yes       | yes    |
| `only` | no  | yes       | yes    |

## Open Questions

### Chunked Bundling

What is a "chunk"? Options:
- A `some.{page|widget}.*` group clamped into a single `.ts` file per route/widget
- A different shape entirely (e.g. shared dependency chunks, route-level code splitting)

Needs definition before implementation. Chunks affect the import map, live rebuild, and how the SPA loads code on navigation.

### Do We Even Need a Bundler?

If we control chunking (we define what goes into each chunk) and skip minification, what does a bundler actually do for us?

1. Resolve imports → we control this via manifests/chunks
2. Bundle multiple files into one → we define the chunks ourselves
3. Transpile TS → JS → Deno does this natively, TypeScript 6.0 will too
4. Minify → we don't want this (compression handles it, minification risks mangling HTML in templates)
5. Tree-shaking → if we control chunks, we know what's needed

A "bundler" might reduce to: transpile TS → JS, concatenate into our defined chunks, leave external imports (`@emkodev/emroute/spa`) for the browser import map. No esbuild, no `deno bundle`, no dependency. The runtime transpiles and concatenates. Zero-dependency claim stays intact.

**Pre-compressed chunks**: Chunks should be stored both raw and pre-compressed (brotli/gzip) so the server never compresses per-request. Both `CompressionStream` (Web API, gzip/deflate) and `node:zlib` (brotli) work at code level in Deno/Node/Bun — proven in spike. TypeScript transpilation + pre-compression should produce comparable bytes to a minified bundle, without the risks.

**`emroute.js` via CDN**: The framework chunk only changes version to version. The runtime knows the current emroute version (from imports, package manager, etc.) and points the import map to a versioned CDN URL. No need to bundle the framework at all.

**Cache busting**: We name chunks our way and control response headers (ETag, Cache-Control). Still need cache busting (content hash in URL or version suffix) — an older SPA session may hold references to previous chunk versions and those should still resolve correctly.

**Per-route/per-widget CSS**: For now, CSS goes into chunks. Need to verify inline `<style>` works with CSP. Could also merge per-page and inject as `<link>`. Many options — leave flexible.

**Testing runtime**: SQLite in `:memory:` mode — useful beyond testing (hardkore/hardkore-api pattern). Prefer over plain in-memory `Map` since SQLite runtime is useful in production too and `:memory:` avoids filesystem in tests.

**Markdown renderer**: TODO — revisit. Ask about emkoma and whether it should be CDN'd too.

Open question: is there something a real bundler handles that this approach misses? Scope hoisting? Import rewriting? Edge cases in module concatenation?

### SSR Module Loading for Non-Filesystem Runtimes

SSR needs to execute route/widget TypeScript modules (`render()`, `getData()`, etc.). With filesystem runtimes, `import()` works. With database runtimes, we need alternatives. Spike each:

- **`new Function()` / `AsyncFunction`** — evaluate compiled JS at runtime. Modern approach, but runs in current scope (no module semantics, no `import`).
- **`data:` URLs** — `import('data:text/javascript,...')`. True module semantics. Needs pre-compiled JS.
- **Dynamic `import()` with blob URLs** — `new Blob()` → `URL.createObjectURL()` → `import()`. Module semantics, in-memory.
- **TypeScript `transpileModule()`** — compile TS to JS in-memory, then use one of the above.

See `spike/` directory for results.

## Spikes

| Spike | File | Status |
|-------|------|--------|
| esbuild in-memory bundling | `spike/esbuild-memory.ts` | Proven |
| deno bundle without filesystem | `spike/deno-bundle-memory.ts` | Proven (temp dir), stdin not supported |
| `new Function()` module eval | `spike/module-eval-function.ts` | TODO |
| `data:` URL dynamic import | `spike/module-eval-data-url.ts` | TODO |
| Blob URL dynamic import | `spike/module-eval-blob-url.ts` | TODO |

## Migration Path

Not a 2.0 — evolve incrementally within 1.x.

1. **Fix client-side bundling first** — the thing that's actually broken
2. **Test assumptions** — chunks, no bundler, pre-compression — as spikes along the way
3. **Make `runtime` parameter optional** — if not provided, create a default filesystem runtime from `appRoot` behind the scenes
4. **Deprecate config options** — `routesDir`, `widgetsDir`, `entryPoint`, `baseUrl` — the runtime handles these by convention
5. **End state**: consumer passes `spa` mode + optional `extendContext`, everything else is runtime conventions

```ts
// Backward compat: appRoot in config, no runtime
createEmrouteServer({ appRoot: '.', spa: 'leaf' })
// → internally: new NodeServerRuntime('.')

// New way: explicit runtime
createEmrouteServer({ spa: 'leaf' }, new DenoServerRuntime('.'))
```

## Notes

### No Minification

`deno bundle --minify` exists but we skip it. HTTP compression (br/gzip) handles size reduction. Minification risks mangling HTML content inside template literals and widget render functions — some HTML elements are sensitive to whitespace/structure changes. Not worth it.

### TypeScript 6.0 (Go-based compiler)

TypeScript is close to releasing 6.0 with a Go-based compiler. Could become the native in-memory transpiler for non-filesystem runtimes — compile TS → JS without esbuild dependency. Worth watching timing-wise.
