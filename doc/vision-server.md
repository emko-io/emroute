# Server Vision

## Core Principle

emroute is a router. A router matches URLs to resources. The runtime provides the resources — from filesystem, database, S3, CDN, IndexedDB, or any combination. emroute matches, renders, and serves. Everything else — storage, platform, rendering strategy, client-side framework, offline support, visual editing — is a consequence of this clean separation, not a special mode or a bolted-on feature.

No accidental decisions. No bandaids. Multipurpose, agnostic, layered architecture where each layer has one job and doesn't leak into the others.

## Zero-Config Default

```ts
const runtime = new DenoFsRuntime('.');
const emroute = await createEmrouteServer({ spa: 'leaf' }, runtime);
Deno.serve((req) => emroute.handleRequest(req) ?? new Response('Not Found', { status: 404 }));
```

`spa` mode is explicitly required — no inference, no magic. Everything else is filesystem conventions.

> **Status**: `createEmrouteServer` accepts `Runtime` as second parameter. `appRoot`, `serve()`, compression, TLS, and response headers removed from server config/interface — consumer owns HTTP serving. All paths are Runtime-relative.

## Convention-Based Detection

Given an `appRoot`, the server detects:

- `routes/` exists → scan routes, generate `routes.manifest.g.ts`
- `widgets/` exists → scan widgets, generate `widgets.manifest.g.ts`
- `main.ts` exists → use as entry point; otherwise generate `_main.g.ts`
- `index.html` exists → use as shell; otherwise generate a default shell
- `main.css` exists → inject `<link>` tag into shell
- `app.js` + `emroute.js` exist after bundling → inject import map + `<script>` tag into shell

No `routesDir`, `widgetsDir`, `entryPoint` config. Want different layouts? Implement your own runtime.

## Transpilation & Chunking

Two distinct concerns, both browser-only. The server imports `.ts` natively (Deno, Node with loaders) — no transformation needed server-side.

**Transpilation** (TS → JS) — required for browsers. The runtime provides a `transpile()` method. `DenoServerRuntime` uses `deno bundle` (single-file transpile), others can use esbuild, swc, or whatever. The server never knows the mechanism.

> **Status**: `Runtime.transpile()` is now async (`Promise<string>`). `DenoFsRuntime.transpile()` lazy-loads `npm:typescript` on first call — not a published dependency (DenoFsRuntime is outside JSR publish exports). Benchmark: typescript ~5ms/file, swc ~2ms, esbuild ~4ms. Next: server serves transpiled `.ts` files on-the-fly (no `deno bundle` for dev).

**Chunking** (merging files into fewer requests) — optional browser optimization, possibly unnecessary. HTTP/2 multiplexing handles parallel requests, pre-compression handles size. Individual transpiled files may be the permanent answer, not just a starting point.

**Proven** (`spike/`):
- **esbuild**: transpiles + bundles entirely in-memory via virtual filesystem plugin — no disk access. Non-filesystem runtimes can feed files directly.
- **`deno bundle`**: requires filesystem paths, no stdin support. For non-filesystem runtimes, fallback is temp dir → transpile → clean up.

The SPA mode dictates what gets transpiled/served:

- `none` → no transpilation, no JS, no script tags
- `leaf` → widgets hydration only (no router)
- `root` / `only` → widgets + router

Two output files (or groups, if chunked later):
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

> **Status**: Manifests written via `runtime.command('/routes.manifest.g.ts', { body: code })`. Done.

These manifests serve two purposes:

1. The bundler consumes them into `app.js` — not necessarily via filesystem `import`. Bundlers like esbuild can work in-memory via code API, manifests can be fetched or lazily resolved. Filesystem import is the default path, not the only one.
2. Consumers use them to build navbars, CMS widget pickers, drag-and-drop editors — any UI that needs to enumerate available routes or widgets

## Runtime Abstraction

`Runtime` is an abstract class defined by emroute. It abstracts two dimensions: the **platform** (Deno, Node, Bun, browser) and the **resource provider** (filesystem, database, S3, CDN, IndexedDB).

### Naming Convention

Class name: `{Platform}{Provider}Runtime` — e.g. `DenoFilesystemRuntime`, `NodeSqliteRuntime`, `BrowserIndexedDbRuntime`.

File name: `{platform}-{provider}.runtime.ts` — e.g. `deno-fs.runtime.ts`, `node-sqlite.runtime.ts`, `browser-indexeddb.runtime.ts`.

Hybrid runtimes that compose multiple providers: `DenoHybridRuntime` / `deno-hybrid.runtime.ts`.

### Interface

Each runtime is initialized with a root — a directory path for filesystem runtimes, a connection for database runtimes, etc. This root IS the `appRoot`. The server never knows or cares about absolute paths, CWD, or where things physically live. It requests `routes/`, `widgets/`, `index.html` from the runtime, and the runtime resolves them against its own root.

The consumer instantiates the runtime with the required constructor arguments and passes it to the server:

```ts
const runtime = new DenoFilesystemRuntime('../pathtor-app');
const emroute = await createEmrouteServer({ spa: 'leaf' }, runtime);
```

Switching runtimes is painless — same interface, different constructor:

```ts
const runtime = new DenoSqliteRuntime(dbConnection);
const emroute = await createEmrouteServer({ spa: 'leaf' }, runtime);
```

`appRoot` is not server config — it belongs to the runtime. Server config is purely behavioral.

> **Status**: Done. `appRoot` removed from `EmrouteServerConfig` and `BuildConfig`. Runtime constructor receives the root. All server paths are Runtime-relative (starting with `/`).

The runtime owns transpilation as a method — `DenoFilesystemRuntime` calls `deno bundle` via `Deno.Command`, an esbuild runtime would call esbuild as code. The server doesn't know or care about the mechanism.

### Package Split (option, not decided)

The runtime is a standalone abstraction. It could live in separate packages:

- **`@emkodev/emroute`** — defines `Runtime` abstract class, router, SSR, server
- **`@emkodev/emroute-runtime-node-fs`** — `node:fs` based, compatible with Deno, Node, and Bun. Ships as the default (re-exported from emroute for zero-config backward compat).
- **`@emkodev/emroute-runtime-deno-fs`** — extends the Node FS runtime, overrides with Deno-native APIs for Rust-level performance

Dependency flow: runtime packages depend on `@emkodev/emroute` (for the abstract class). Consumers depend on both emroute and their chosen runtime. Consumer instantiates the runtime and passes it to emroute.

This unlocks community and first-party runtimes without touching emroute core: esbuild-based (in-memory transpilation), SQLite-backed, S3, IndexedDB (offline browser), Bun-native, etc.

## Security

The runtime abstraction solves a security problem: when emroute runs inside another server (e.g. emkoord within hardkore-api), the consumer app directory (pathtor-app) is just a source for the runtime — not a served directory. The runtime controls exactly what files are exposed. No risk of accidentally serving internal app files, `.ts` source, `.env`, or anything else by blindly serving the whole appRoot. CWD becomes irrelevant.

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

The server exposes `handleRequest(req: Request): Promise<Response | null>` as the primary integration point. ~~`serve(port)` is a convenience for standalone use.~~ Real apps compose `handleRequest()` with their own server — emkoord, Hono, Express, or bare `Deno.serve`. No obstacles to wrapping.

> **Status**: `serve()` removed from `EmrouteServer` interface. HTTP serving is the consumer's job — Runtime doesn't know what serving is. Consumer wires `Deno.serve`, `node:http`, etc. directly.

```ts
// Consumer owns HTTP serving
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
| `new Function()` module eval | `spike/module-eval-function.ts` | Proven (no module semantics, dependency injection needed) |
| `data:` URL dynamic import | `spike/module-eval-data-url.ts` | Partial (works for single modules, cross-module import fails) |
| Blob URL dynamic import | `spike/module-eval-blob-url.ts` | Proven (full module semantics, cross-module imports work) — **winner** |

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

> **Status**: Runtime parameter is now required. `appRoot` removed from config. Backward compat path (step 3) deferred — explicit runtime is the only way.

## Notes

### No Minification

`deno bundle --minify` exists but we skip it. HTTP compression (br/gzip) handles size reduction. Minification risks mangling HTML content inside template literals and widget render functions — some HTML elements are sensitive to whitespace/structure changes. Not worth it.

### TypeScript 7 (Go-based compiler, formerly "6.0")

Now called TypeScript 7 / `tsgo` (`@typescript/native-preview` on npm). JS output is partially implemented (`target: esnext` only). **Public API is not ready** — no programmatic usage, CLI only. No Deno integration. It's a `tsc` replacement (type checking + emit), not a bundler. When the code API lands, could become the native in-memory transpiler for our no-bundler path.

---

## ADRs

### ADR-1: Runtime speaks Request/Response

**Decision**: `ServerRuntime` methods use `Request`/`Response` as their API, not file paths and strings.

**Context**: The runtime is a resource abstraction (read, list, find, write) that can be backed by filesystem, database, S3, memory, or anything else. The question was what the method signatures should look like — fs-like paths (`readTextFile(path): string`) or HTTP semantics (`read(request): Response`). The resulting API is closer to REST than filesystem — operations on resources via Request/Response, not paths and buffers.

**Choice**: Request/Response for all runtime methods.

```ts
abstract class ServerRuntime {
  abstract read(request: Request): Promise<Response>;
  abstract list(request: Request): Promise<Response>;
  abstract find(request: Request): Promise<Response>;
  abstract write(request: Request): Promise<Response>;

  static transpile(ts: string): string;
  static compress(data: Uint8Array, encoding: 'br' | 'gzip'): Uint8Array;
}
```

> **Status**: Superseded by ADR-2 (`handle`/`query`/`command`). The `read`/`list`/`find`/`write` split was replaced with CQRS-style three-method API. See ADR-2 for final shape.

**Consequences**:

- **No mime-type guessing** — Response carries content-type, compression, and all HTTP headers natively.
- **Server becomes passthrough** — browser requests for static files go straight to `runtime.read(request)`, Response returned as-is. Consumer can attach extra headers via `handleRequest()`.
- **Components always `fetch()`** — pages and widgets use `fetch()` for companion files (.html, .css, .md) in both SSR and browser. SSR intercepts `fetch()` locally against the runtime, browser `fetch()` hits the server which calls the same runtime method. One code path, guaranteed to work everywhere.
- **No `baseUrl`, no `file://` hacks** — the runtime is a local origin behind `fetch()`.
- **Testing is trivial** — test runtimes with `new Request()`, assert on `Response`. No server needed.
- **`transpile()` and `compress()` are static utilities** — available to runtimes and consumers, but not part of the per-request interface. Runtimes use them internally when building Responses (e.g., transpile `.ts` before responding, pre-compress based on Accept-Encoding).
- **PWA / offline** — Service Worker implements the same runtime interface, intercepts `fetch()`, serves from Cache API or IndexedDB. The app doesn't know it's offline.
- **Desktop app** — Tauri/Electron runtime backs the same interface with local filesystem. No code changes.
- **Remote data** — a runtime that `read()`s widgets or markdown from a CMS, CDN, or third-party service. Just another implementation. Third-party widgets are just another resource origin.
- **Hybrid runtime** — a single runtime that mixes filesystem, API, S3, CDN, etc., racing or cascading them in parallel to resolve a request. First source to respond wins.
- **Leaf + DB** — leaf mode serves shells and static assets from filesystem, while hash-routed content (`/#/` routes) pulls widgets and data from a database via the same `runtime.read()`. CMS in a box.
- **No-code app builder** — emkoma (Emko Common Mark: native md renderer, raw editor, block-based visual editor with native widget support) + runtime = visual content editing, widget drag-and-drop into markdown, offline editing (IndexedDB runtime), SSR for SEO, and browser-based coding (pages, widgets, companion files) when tsgo exposes a code API for in-browser transpilation.
- **REST API for free** — a runtime backed by hardkore repositories turns emroute into a REST layer: `read(/person/123)` → `repository.retrieve('123')` → Response with JSON. Same server serves web UI (filesystem runtime) and data API (repository runtime). No separate REST controllers. hardkore-api reuses emroute not just as a web-app server but as an API wrapper around its clean architecture repositories. The runtime's Request/Response API and hardkore's abstract Repository pattern share the same DNA — abstract contract, swappable implementations, dependency inversion.

### ADR-2: Runtime API — handle / query / command

**Decision**: The early ADR-1 sketch (`read`, `list`, `find`, `write`) was replaced with three methods following CQRS and fetch semantics.

**Final API** (`server/runtime/abstract.runtime.ts`):

```ts
abstract class Runtime {
  /** Raw passthrough — server forwards browser requests as-is. */
  abstract handle(resource: FetchParams[0], init?: FetchParams[1]): FetchReturn;

  /** Read. Returns Response, or string with { as: "text" }. */
  abstract query(resource, options: { as: "text" }): Promise<string>;
  abstract query(resource, options?): FetchReturn;

  /** Write. Defaults to PUT; pass { method: "DELETE" } etc. to override. */
  command(resource, options?): FetchReturn;

  static transpile(ts: string): Promise<string>;
  static compress(data: Uint8Array, encoding: "br" | "gzip"): Promise<Uint8Array>;
}
```

**Why three, not four+**: `read`, `list`, `find` were all reads — no reason to split them. `query()` handles all reads; directory listing is just `query("/routes/")` returning a JSON array. `exists()` is `query(path)` → check `response.status !== 404`. No dedicated methods needed.

**`{ as: "text" }` overload**: Semantically equivalent to `Accept: text/plain`. Exists for type safety — TypeScript narrows `Promise<string>` vs `FetchReturn`. Concrete runtimes can optimize (e.g. `DenoFsRuntime` calls `Deno.readTextFile()` directly, skipping Response construction).

**`query` is abstract**: Forcing concrete runtimes to implement it allows them to avoid constructing a Response when the caller only wants text. The base class doesn't provide a default `this.handle().then(r => r.text())` implementation — that would defeat the purpose.

**`command` is concrete**: Just delegates to `handle()` with `{ method: "PUT", ...options }`. Override via options (`{ method: "DELETE" }`, etc.).

**`FetchParams` / `FetchReturn`**: Derived from `Parameters<typeof fetch>` and `ReturnType<typeof fetch>`. No manual typing — if fetch's signature evolves, Runtime follows.

## Proven Results

### Transpilers (all tested against real `.page.ts` fixtures)

| Tool | Type | Resolves imports | Speed (ms/iter) |
|------|------|-----------------|-----------------|
| **swc** (`npm:@swc/core`) | programmatic | no (transpile only) | ~2 |
| **esbuild** (`npm:esbuild`) | programmatic | no (transform mode) | ~3 |
| **typescript** (`npm:typescript`) | programmatic | no (transpile only) | ~4 |
| **deno bundle** | CLI | yes (full bundle) | ~24 |
| **tsgo** (`go install`) | CLI | no (transpile only) | ~35 |

Transpile-only tools strip types but preserve imports (`@emkodev/emroute` stays as-is). Deno resolves import maps even from blob URL context, so unresolved specifiers work — no import rewriting needed for SSR on Deno. `deno bundle` is the only tool that resolves + inlines everything into a self-contained JS string.

tsgo is installable as a native Go binary via `go install github.com/microsoft/typescript-go/cmd/tsgo@latest`. No programmatic API yet — CLI only. The `@typescript/native-preview` npm package wraps it but npx overhead dominates (~660ms vs ~35ms native).

Tests: `test/unit/module-loader.test.ts`, `test/unit/transpiler-bench.ts`.

### Module Loaders (all tested with bundled JS from `deno bundle`)

| Loader | Module semantics | Cross-module imports | Platform |
|--------|-----------------|---------------------|----------|
| **blob URL** | yes (`import()`) | yes | Deno, browsers |
| **data: URL** | yes (`import()`) | yes | Deno, browsers |
| **new Function()** | no (manual return) | no | everywhere |
| **direct import()** | yes (native) | yes | Deno only (no transpile needed) |

All four pass with real fixture `.page.ts` files. Blob URL and data: URL are functionally equivalent. `new Function()` requires stripping exports and knowing the binding name. Direct `import()` is Deno-only but needs no transpilation at all.

Tests: `test/unit/module-loader.test.ts`.

### Full Cycle (proven end-to-end)

`runtime.query(path, { as: "text" })` → `transpileModule(source)` → `loadViaBlobUrl(js)` → `page.getData()` → `page.renderHTML({ data, context: { files: { html } } })` → rendered HTML with real data and companion template.

Tested with `ArticlesPage` fixture: 6 articles loaded via `getData()`, companion HTML template with `{{articleCards}}` placeholders resolved, final HTML contains article titles and "articles published" count.

### Server Startup Steps via Runtime

Every step that previously required `ServerRuntime` (`readTextFile`, `readDir`, `writeTextFile`, `exists`, `stat`, `serveStaticFile`) has been proven through `Runtime`:

| Server step | Old `ServerRuntime` | New `Runtime` | Tested |
|---|---|---|---|
| Scan routes/widgets dir | `readDir()` recursive | `query(dir)` → JSON listing, trailing `/` = directory | ✓ |
| Check file existence | `exists(path)` | `query(path)` → `status !== 404` | ✓ |
| Read companion files | `readTextFile(path)` | `query(path, { as: "text" })` | ✓ |
| Resolve HTML shell | `readTextFile("index.html")` | `query("/index.html", { as: "text" })` | ✓ |
| Write manifests | `writeTextFile(path, code)` | `command(path, { body: code })` | ✓ |
| Load page modules | `import(fileUrl)` | `query(path, { as: "text" })` → transpile → blob URL | ✓ |
| Static file passthrough | `serveStaticFile(req, path)` | `handle(request)` → Response | ✓ |

Tests: `test/unit/runtime-module-loader.test.ts`, `test/unit/runtime-walk.test.ts`.

~~**Next step**: Wire `Runtime` into `emroute.server.ts`, replacing `ServerRuntime` calls with `query`/`command`/`handle`.~~

> **Status**: Done. `emroute.server.ts`, `route.generator.ts`, `widget.generator.ts` all use `Runtime`. `ServerRuntime` no longer used by generators or server. Unit tests (834) pass. Browser tests pass for `none` mode (70 steps). `leaf`/`root`/`only` browser tests need on-the-fly `.ts` transpilation in `handleRequest` — next step.

**Next step**: Serve transpiled `.ts` files on-the-fly in `handleRequest` — when browser requests `.js` (or `.ts`), read the `.ts` source via Runtime, transpile, and return `text/javascript`. This replaces `deno bundle` subprocess in dev flow.
