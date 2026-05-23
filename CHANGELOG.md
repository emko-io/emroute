# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.12.6] - 2026-05-24

### Changed

- **Documentation moved to [emroute.emko.dev](https://emroute.emko.dev)**:
  the long-form prose docs under `doc/0X-*.md` have been removed from the
  repo. The guide site is now the canonical reference, with a `/decisions`
  section that surfaces all 20 ADRs. The repository's `README.md` is
  reduced to a short hook + pointer to the guide.

- **Test description label**: `'doc/05-nesting.md promises'` →
  `'nesting guide promises'` (the file no longer exists; the behavior
  under test is unchanged).

No framework source changes in this release.

## [1.12.5] - 2026-05-15

### Fixed

- **Root `index.js` shim for compiled-binary resolver**: Bun's standalone
  binary resolver (`bun build --compile`) ignores the `exports` map when
  resolving bare specifiers from files loaded via `import()` of a real
  disk path, and only honors `<pkg>/index.js` at the package root.
  `BunFsRuntime.loadModule()` hits exactly this case, so route files
  imported at runtime inside a compiled binary could not previously
  import `@emkodev/emroute`. Added hand-written `index.js` and
  `index.d.ts` shims at the package root, each a one-line re-export
  from `./dist/src/index.js`. Normal Bun/Deno/Node module resolution is
  unaffected.

## [1.12.4] - 2026-03-17

### Added

- **`shell` option in `Emroute.create()`**: Optional function that receives
  `ShellContext` (`runtime`, `spa`, `basePath`, `title`) and returns the HTML
  shell string. Skips all default probes (`/index.html`, `/manifest.json`,
  `/main.css`, `/importmap.json`, `/app.js`). Browser SPA boot uses this
  internally to avoid unnecessary 404 requests.

- **`Emroute.buildHtmlShell()` is now public**: Consumers can call it from
  a custom `shell` function to get the default shell and modify it.

### Fixed

- **Unnecessary 404s during SPA boot**: `bootEmrouteApp` no longer probes
  for `/index.html` and `/manifest.json` — the shell is read from the
  existing DOM instead.

- **Empty manifest instead of 404 for missing directories**: When `/widgets/`
  or `/elements/` directories don't exist, the runtime now returns an empty
  `[]` manifest (200) instead of 404. Eliminates repeated 404 requests and
  allows caching.

## [1.12.3] - 2026-03-17

### Fixed

- **Widget collapse in flex/grid layouts**: `container-type: inline-size` and
  `content-visibility: auto` have been removed from the default `:host` styles.
  `container-type: inline-size` implies size containment, which prevents the
  host element from deriving its width from its children — causing widgets to
  collapse to zero width in flex/grid contexts unless explicitly sized from
  outside. `content-visibility: auto` could collapse off-screen widgets without
  `contain-intrinsic-size`. Both are now opt-in via companion CSS.
  **If 1.12.1 or 1.12.2 broke your widget layouts, we apologise — this release
  fixes it.** The base `:host` styles are now just `display: block` and the
  `hidden` safeguard.

### Changed

- **`container-type` and `content-visibility` are now opt-in**: Add them in
  your companion CSS when needed. See the updated [widget docs](doc/06-widgets.md)
  for guidance and examples.

## [1.12.2] - 2026-03-16

### Fixed

- **Widget invisible after SSR hydration**: Custom elements default to
  `display: inline`, and the base `container-type: inline-size` implied size
  containment — collapsing the widget to zero dimensions. Added `display: block`
  to the base `:host` styles in both the SSR inline `<style>` and browser
  `adoptedStyleSheets` paths.

- **SSR and browser base styles now consistent**: The SSR host `<style>`
  (in `widget-resolve.util.ts`) and browser `ComponentElement` base sheet
  now emit identical CSS via `@layer emroute-base`.

### Changed

- **Widget base stylesheet uses `@layer emroute-base`**: The default `:host`
  styles (`container-type`, `content-visibility`) are now in a lower-priority
  cascade layer, allowing companion CSS in `@layer emroute` to override them.
  Added `:host([hidden]) { display: none }` safeguard.

## [1.12.0] - 2026-03-15

### Added

- **On-the-fly TypeScript transpilation**: `BunFsRuntime` serves `.ts` files
  as transpiled JavaScript with companion files (`.html`, `.md`, `.css`)
  inlined as `export const __files`. Browsers and SSR consumers load `.ts`
  paths directly — no build step required for module serving.

- **`Runtime.transpileModule()`**: Protected method on the abstract `Runtime`
  class. Single implementation of transpile + companion merge, available to
  all runtimes. Concrete runtimes call it from their serving path to serve
  `.ts` as JavaScript.

- **Fresh modules without stale cache**: `BunFsRuntime.loadModule()` uses a
  cache-busting query string on the real file path, bypassing Bun's module
  cache while preserving bare specifier resolution for third-party packages.

### Changed

- **`buildClientBundles()` produces SPA shell only**: The build step no
  longer transpiles modules or rewrites manifests. It produces `emroute.js`,
  `app.js`, and `importmap.json` — the SPA shell assets. Module serving
  (`.ts` → JS with companions) is handled entirely by the runtime.

- **Manifests always reference `.ts` paths**: No `.ts` → `.js` rewriting.
  The runtime transpiles on the fly when the browser requests `.ts` files.

- **Pipeline loads companion files from manifest**: When a module doesn't
  have inlined `__files` (on-the-fly `.ts` imports), the pipeline falls back
  to loading companions from the manifest's file paths.

### Fixed

- **`@scope` in `adoptedStyleSheets` doesn't match inside shadow DOM**:
  `@scope (widget-name)` targets the host element tag, which doesn't exist
  inside the shadow tree. Removed `@scope` — shadow DOM already isolates
  styles. `@layer emroute` remains for cascade priority control.

- **`buildClientBundles()` wrote stale `emroute.js`**: `resolvePrebuiltBundle()`
  used the consumer's `createRequire()` to find `dist/emroute.js`, which
  resolved to stale files in workspace/link setups. Now resolves relative to
  the package itself via `import.meta.url`.

- **`escapeTemplateLiteral` bug**: `retranspileIfNeeded()` escaped all `$`
  characters instead of just `${}` template expressions, corrupting content
  like `$100` in companion files.

## [1.11.0] - 2026-03-13

### Added

- **Widget lifecycle states via `CustomStateSet`**: Widgets now expose their
  internal state through `ElementInternals.states`, enabling CSS styling from
  light DOM using the `:state()` pseudo-class. Five states are available:
  - `:state(lazy)` — waiting for viewport intersection
  - `:state(loading)` — `getData()` in flight
  - `:state(hydrating)` — SSR content adopted, wiring up event listeners
  - `:state(ready)` — interactive, data loaded and rendered
  - `:state(error)` — `getData()` threw or params validation failed

  States are mutually exclusive. Example usage:
  ```css
  widget-nav:state(loading) { opacity: 0.5; }
  widget-nav:state(ready) { animation: fade-in 0.2s; }
  widget-nav:state(error) { border: 2px solid red; }
  ```

- **`adoptedStyleSheets` for widget CSS**: Companion `.css` files are now
  applied via `adoptedStyleSheets` on the shadow root, in addition to the
  existing SSR `<style>` tag injection. A per-widget-name `CSSStyleSheet` cache
  shares sheet objects across instances of the same widget, reducing memory when
  many instances exist on a page. The SSR `<style>` tag in declarative shadow
  DOM remains for no-FOUC rendering before JS loads.

- **`@layer emroute` for companion CSS cascade**: Widget companion CSS is
  wrapped in `@layer emroute`, giving it the lowest cascade priority. Consumer
  `<style>` tags in `renderHTML()` are layerless and always override companion
  CSS, regardless of specificity or `adoptedStyleSheets` ordering.

- **SSR mocks for `CSSStyleSheet` and `ElementInternals`**: The SSR-compatible
  HTMLElement mock now includes `attachInternals()` (returns a mock with a
  `states` Set) and `CSSStyleSheetBase` (server-safe `CSSStyleSheet` with
  `replaceSync`). `SsrShadowRoot.adoptedStyleSheets` serializes adopted sheets
  as `<style>` tags in `innerHTML`.

- **Styling documentation** (`doc/15-styling.md`): New guide covering widget
  companion CSS, inline styles, page CSS, and lifecycle state styling with
  `:state()` selectors.

### Changed

- **Widget CSS removed from `renderHTML()`**: `WidgetComponent.renderHTML()` no
  longer injects `<style>` tags from companion CSS files. CSS injection is now
  handled by the element layer (`ComponentElement.adoptCss()`) via
  `adoptedStyleSheets`, and by the SSR resolve path
  (`widget-resolve.util.ts`) for declarative shadow DOM.

## [1.10.0-beta.4] - 2026-03-12

### Fixed

- **Widget attribute parsing**: Standard HTML attributes (`style`, `class`, `id`,
  `slot`, `part`) are now skipped when parsing widget params. Previously,
  `ComponentElement` picked up `style` (set by itself via `contentVisibility`)
  and other non-param attributes into the widget's params object. Both SSR
  (`parseAttrsToParams`) and browser (`ComponentElement.connectedCallback`) now
  share a `RESERVED_ATTRS` set from `html.util.ts`.

### Changed

- **`Component.getData` default no-op**: `getData` is no longer abstract — it
  returns `Promise.resolve(null)` by default. Components that don't fetch data
  no longer need a boilerplate override. `renderMarkdown` remains abstract (a
  component that produces nothing in `/md/` is a bug, not a default).

## [1.10.0-beta.3] - 2026-03-12

### Changed

- **Per-render widget memoization**: Widget modules are loaded once per unique
  name per render pass via a `Map<string, Promise>` cache scoped to each
  `renderRouteContent` call. Eliminates redundant module loads across recursive
  widget nesting and repeated widget occurrences on the same page.

- **Single module load for widget + files**: `Pipeline.loadWidgetModule(name)`
  returns both `{ component, files }` from a single `loadModule()` call.
  Previously, the HTML and MD renderers loaded the same module twice — once for
  the widget component, once for `__files`. The separate `loadFiles` callback
  in `resolveWidgetTags` has been removed.

- **`resolveWidgetTags` signature**: The `getWidget` callback now returns
  `{ component, files }` instead of just `Component`. The `loadFiles` parameter
  has been removed — files come from the same module load as the component.

- **Widget error handling widened**: `resolveWidgetTags` now catches errors from
  the `getWidget` callback (not just from `getData`/`renderHTML`), leaving the
  tag unchanged on load failure.

### Removed

- **`SsrRenderer.resolveWidget()`**: Method removed. Both renderers now handle
  widget loading and error handling via their per-render memoized callbacks.

## [1.10.0-beta.1] - 2026-03-11

### Removed

- **`WidgetRegistry` class**: Deleted. Widgets are now resolved on demand from
  the widgets manifest via `Pipeline.findWidgetModulePath()` → Runtime, the same
  pattern routes already use. This eliminates the frozen snapshot that caused
  stale widgets when the manifest was updated after server creation.

### Changed

- **Widget resolution is live**: SSR renderers (`SsrHtmlRenderer`,
  `SsrMdRenderer`) query the widgets manifest from Runtime on every render
  instead of reading from a frozen in-memory registry. Adding or removing
  widgets at runtime is now reflected immediately.

- **`Emroute.create({ widgets })` deprecated**: The `widgets` config option is
  ignored. Widgets are discovered from the manifest. External widgets (outside
  `widgetsDir`) should be added to the manifest via `runtime.command()`.

- **Browser boot (`bootEmrouteApp`)**: No longer creates a `WidgetRegistry`.
  Widget entries are registered directly with `ComponentElement.registerLazy()`
  for DOM hydration.

### Added

- **`Pipeline.findWidgetModulePath(name)`**: Reads the widgets manifest from
  Runtime and returns the module path for a given widget name. Single source of
  truth for widget resolution.

- **`widgetEntries` in test utilities**: `TestManifest` and `writeManifest()`
  now accept `widgetEntries` for writing the widgets manifest in unit tests.

## [1.9.0] - 2026-03-10

### Added

- **ServiceWorker runtime (`createEmrouteSW`)**: New `@emkodev/emroute/sw` entry
  point that wires Emroute into a ServiceWorker. Intercepts fetch events and
  serves pages offline using the same server code. Consumer bundles their own
  `sw.ts` with `createEmrouteSW({ cacheName, precache, content })`.

- **Split storage in SW**: Framework assets (JS bundles, CSS, import maps) are
  precached into the **Cache API**, while user content (pages, widgets,
  manifests) is stored in **IndexedDB**. The composite `SwRuntime` reads from
  both — Cache first, IDB fallback — and writes go to IDB.

- **`CacheRuntime`**: New browser Runtime backed by the Cache API. Uses a
  synthetic `https://emroute-cache` origin for consistent keys. Supports full
  CRUD via `handle()`/`query()`/`loadModule()`. Export: `@emkodev/emroute/runtime/cache`.

- **`IdbRuntime`**: New browser Runtime backed by IndexedDB. Single object store
  keyed by path, values as `Uint8Array`. Supports directory listing via
  `IDBKeyRange` prefix scans. Export: `@emkodev/emroute/runtime/idb`.

- **`manifest.json` support**: `buildHtmlShell()` probes for `/manifest.json`
  in the Runtime and emits `<link rel="manifest" href="/manifest.json">` when
  found.

- **Mode-distinguishing browser tests**: Each SPA mode now has tests verifying
  its unique HTTP-level behavior — `<script>` presence, `<base>` href target,
  `data-ssr-route` in SSR responses, redirect targets for bare and SSR paths.

### Changed

- **`EmrouteSWOptions.content`**: New option for paths to precache into IDB
  (user content), separate from `precache` (framework assets → Cache API).

- **`EmrouteSWOptions.dbName`**: Optional IDB database name, defaults to
  `'emroute-content'`.

## [1.8.2] - 2026-03-10

### Added

- **`BootOptions.extendContext`**: `bootEmrouteApp({ extendContext })` wires the
  context provider to both the Pipeline (page `getData()` during SPA navigation)
  and `ComponentElement` (widget `hydrate()` / `getData()`). Replaces the manual
  `ComponentElement.setContextProvider()` workaround.

### Changed

- **Lazy widget loading**: `Emroute.create()` no longer eagerly imports all
  widget modules at startup. Widgets are registered as lazy entries (name +
  module path) and loaded on demand when a renderer encounters a `<widget-*>`
  tag. Reduces server startup cost and eliminates redundant module fetches in
  the browser.

- **`resolveWidgetTags` accepts async getter**: Signature changed from
  synchronous registry lookup to `(name: string) => Promise<Component | undefined>`,
  enabling on-demand widget resolution through Pipeline → Runtime.

- **`extractWidgetExport` moved to `widget.registry.ts`**: Extracted from
  `Emroute` private static method to a shared export, used by both
  `SsrRenderer.resolveWidget()` and browser-side `ComponentElement`.

### Deprecated

- **`ComponentElement.setContextProvider()`**: Use `bootEmrouteApp({ extendContext })`
  instead.

### Fixed

- **Widget registry merging**: `Emroute.create()` now always auto-discovers
  widgets from the manifest, then merges manually provided widgets on top.
  Previously, providing `config.widgets` skipped auto-discovery entirely.

- **`mergeModules` runs for all SPA modes**: `buildClientBundles()` now
  transpiles `.ts` → `.js` modules before the `spa === 'none'` early return,
  ensuring manifests reference `.js` paths regardless of mode.

- **Shell generation moved to server**: `buildClientBundles()` now writes
  `importmap.json` instead of `index.html`. The server generates the HTML shell
  at request time via `buildHtmlShell()`, including `<base>`, import map,
  `<script>`, and `main.css` link based on the active SPA mode.

- **SPA base path from `<base>` tag**: `EmrouteApp` reads `<base href>` from
  the document to determine its app prefix, instead of requiring explicit
  `basePath` configuration.

- **`only` mode redirects SSR paths**: Unhandled `/html/*` and `/md/*` requests
  in `only` mode now 302-redirect to `/app/*` instead of serving the SPA shell
  at the wrong path.

## [1.8.1] - 2026-03-06

### Fixed

- **FetchRuntime blob URL leak**: `loadModule()` now revokes the object URL
  after dynamic import completes, preventing memory leaks in long-running
  browser sessions.

- **scanWidgets serial I/O**: companion file existence checks (html, md, css)
  now run in parallel via `Promise.all` instead of sequentially.

## [1.8.0] - 2026-03-05

### Added

- **`experimentalUseTemplate()`** on `Component` base class. Parse a template
  from companion HTML (`<template id>` + `<slot name>`) or markdown
  (`` ```template:id `` + `slot:name`) and get a reusable fill function. DOM
  overload for `hydrate()` returns `DocumentFragment` via native `cloneNode`.
  Throws on missing template id.

- **Server/client independence** documented in `doc/10-spa-mode.md`.
  `buildClientBundles()` is a standalone build step — not part of server init.
  Consumers own `index.html` and `main.ts`.

### Fixed

- **Widget file loading unified with page path**: removed `widgetFiles`
  indirection. Widgets now use `pipeline.loadModule()` →
  `pipeline.getModuleFiles()`, same as pages. `WidgetRegistry` stores
  `modulePath` alongside the widget component.

- **`noUncheckedIndexedAccess` enabled**: all 216 type errors fixed across
  source and test files. Array/record indexing now returns `T | undefined`.

### Changed

- **Version bump to 1.8.0** (from 1.8.0-beta.2).

## [1.8.0-beta.1] - 2026-03-04

### Changed

- **`core/` layer extraction**: platform-agnostic framework internals moved to
  `core/` — types, pipeline, renderers, router, widget system. `src/` retains
  only browser-specific code (custom elements, SPA entry, overlay).

- **`Emroute` class** replaces `createEmrouteServer()` factory. Use
  `Emroute.create(config, runtime)` instead. The old function and `EmrouteServer`
  type are preserved as deprecated aliases.

- **Logger DI**: `setLogger()` removed (deprecated no-op alias retained). Pass
  `logger` in the `Emroute.create()` config instead.

- **`RouteTrie`**: standalone helper functions inlined as private methods.

- **`BasePath` and `DEFAULT_BASE_PATH`** moved from `server.type.ts` into
  `emroute.server.ts`. `BasePath` type derived via
  `Record<keyof typeof DEFAULT_BASE_PATH, string>`.

- **Manifest constants** (`ROUTES_MANIFEST_PATH`, `WIDGETS_MANIFEST_PATH`,
  `ELEMENTS_MANIFEST_PATH`) canonical source is now
  `core/runtime/abstract.runtime.ts`.

- **`thin-client.ts`** renamed to `emroute.app.ts`.

### Removed

- `server/server-api.type.ts` (dead re-exports)
- `server/esbuild-manifest.plugin.ts`, `runtime/bun/esbuild-runtime-loader.plugin.ts` (esbuild replaced by Bun bundler)
- Duplicated `src/` files that now live in `core/`

### Deprecated

- `createEmrouteServer()` — use `Emroute.create()`
- `EmrouteServer` type — use `Emroute`
- `setLogger()` — pass `logger` in config

## [1.7.3] - 2026-02-27

### Added

- **`importmap.json` support**: place an `importmap.json` in your project root
  to map third-party packages for the browser. emroute merges your entries with
  its base import map and writes the combined map into the HTML shell.

- **`elements/` auto-discovery**: custom elements placed in
  `elements/{name}/{name}.element.ts` are discovered automatically.
  `bootEmrouteApp()` imports all element modules at boot and registers them via
  `customElements.define()`. Element names must contain a hyphen per web spec.

- **`ElementManifestEntry` type** exported from `@emkodev/emroute`.

- **`EmrouteServer.elementEntries`** exposes discovered element manifest entries.

- **`ELEMENTS_MANIFEST_PATH`** constant and `resolveElementsManifest()` /
  `scanElements()` on `Runtime`. All concrete runtimes (BunFs, BunSqlite,
  UniversalFs) intercept `elements.manifest.json` for auto-scanning.

- **`mergeModules`** now transpiles element `.ts` → `.js` during build.

- **`doc/14-browser-js.md`**: user-facing guide covering import maps, `main.ts`,
  widget and element registration, third-party packages, and framework usage.

### Fixed

- **`exactOptionalPropertyTypes`**: aligned unit and browser tests with strict
  optional property handling.

## [1.7.2] - 2026-02-27

### Changed

- **README**: updated Runtimes section to list all four runtimes
  (`BunFsRuntime`, `UniversalFsRuntime`, `BunSqliteRuntime`, `FetchRuntime`)
  with storage-agnostic framing.

### Fixed

- **Docs**: removed stale `entryPoint` from runtime config in markdown renderer
  setup guides (08a, 08b, 08c). Updated client-side examples from
  `createSpaHtmlRouter` + `emroute:routes` to `bootEmrouteApp()`.
- **Docs**: updated Hono integration guide (13) with `buildClientBundles()` call
  and corrected verify table for `/app/` prefix.

## [1.6.6-beta.5] - 2026-02-26

### Changed

- **Per-file module merging replaces app.js bundling** — route and widget `.ts`
  modules are no longer compiled into `app.js`. Instead, `buildClientBundles()`
  transpiles each `.ts` → `.js` via `Runtime.transpile()` and inlines companion
  files (`.html`, `.md`, `.css`) as `export const __files`. The browser
  lazy-loads individual `.js` files on demand via `FetchRuntime.loadModule()`.
  `app.js` now contains only consumer code (markdown renderer setup, custom
  elements, etc.).

- **`bootEmrouteApp()`** — new browser entry point that fetches
  `routes.manifest.json` and `widgets.manifest.json` as JSON, builds lazy module
  loaders, registers widgets for deferred hydration, creates `EmrouteServer`,
  and wires Navigation API. Replaces inline manifest bundling.

### Added

- **`Runtime.transpile()`** — abstract method for TypeScript → JavaScript
  transpilation. `BunFsRuntime` implements it via `Bun.Transpiler`.
- **`ComponentElement.registerLazy()`** — registers a widget custom element
  immediately (SSR content adopted), defers module loading until
  `connectedCallback`. Islands pattern: visible from SSR, interactive after
  lazy load.
- **`bootEmrouteApp()` + `BootOptions`** — exported from `@emkodev/emroute/spa`.
- **`MarkdownElement.getConfiguredRenderer()`** — public getter for the
  configured markdown renderer.

### Removed

- **`emroute:routes` / `emroute:widgets` virtual modules** — no longer used.
  Route tree and widget manifest are fetched as JSON at boot time.

## [1.6.6-beta.4] - 2026-02-26

### Changed

- **SPA replaced with thin client** — deleted `SpaBaseRouter`, `SpaHashRouter`,
  `SpaHtmlRouter` (832 lines). Replaced with `EmrouteApp` (165 lines) that wires
  Navigation API to an `EmrouteServer` running in the browser via `FetchRuntime`.
  Same server, same pipeline, one-third the code.

- **Build separated from Runtime** — `bundle()`, `transpile()`, `compress()`,
  `stopBundler()`, `writeShell()` removed from `Runtime`. Bundling is now a
  standalone `buildClientBundles()` function in `server/build.util.ts`. Runtime
  is pure storage + serving.

- **Pre-built browser bundle** — `dist/emroute.js` is produced at `bun run build`
  time (tsc + esbuild). `buildClientBundles()` copies it from dist/ instead of
  re-bundling with esbuild. Only consumer code (`app.js`) needs esbuild at build time.

- **Sitemap generator updated for RouteNode tree** — `generateSitemap()` now
  takes a `RouteNode` tree instead of the removed `RoutesManifest` array.

### Added

- **`FetchRuntime`** — browser-compatible Runtime that delegates reads to the
  server via `fetch()`. Export: `@emkodev/emroute/runtime/fetch`.
- **`EmrouteApp` + `createEmrouteApp`** — Navigation API glue for `/app/*`
  routes. Intercepts links, renders via `htmlRouter.render()`, injects content
  with view transitions.
- **`buildClientBundles()`** — standalone build function. Produces `emroute.js`
  (pre-built), `app.js` (consumer entry), `index.html` (shell with import map).
  Export: `@emkodev/emroute/server/build`.
- **`EmrouteServerConfig.moduleLoaders`** — pre-bundled module loaders for
  browser use. Skips `runtime.loadModule()` when provided.
- **`.js` merged module support** — `RouteFiles.js` field, scanRoutes/scanWidgets
  detect `.js` files, `buildComponentContext` reads inlined `__files` from modules.
- **`scripts/bundle-browser.ts`** — post-tsc esbuild step for `dist/emroute.js`.

### Removed

- **`SpaBaseRouter`**, **`SpaHashRouter`**, **`SpaHtmlRouter`** — replaced by
  `EmrouteApp` thin client.
- **`Runtime.bundle()`**, **`Runtime.transpile()`**, **`Runtime.compress()`**,
  **`Runtime.stopBundler()`**, **`Runtime.writeShell()`** — build is no longer
  a runtime concern.
- **`RuntimeConfig.entryPoint`**, **`RuntimeConfig.bundlePaths`**,
  **`RuntimeConfig.spa`** — moved to `BuildOptions`.
- **`EMROUTE_EXTERNALS`**, **`EMROUTE_VIRTUAL_NS`** from `Runtime` — moved to
  `server/build.util.ts`.

## [1.6.6-beta.3] - 2026-02-26

### Changed

- **Route matching replaced with trie** — `RouteMatcher` replaced by `RouteTrie`
  implementing a new `RouteResolver` interface. Route data is now a
  JSON-serializable `RouteNode` tree instead of a flat `RoutesManifest` array.

- **Router constructors take `RouteResolver`** — `createSpaHtmlRouter`,
  `createSsrHtmlRouter`, `createSsrMdRouter`, `SsrHtmlRouter`, and
  `SsrMdRouter` now accept a `RouteResolver` (e.g. `RouteTrie`) as the first
  argument instead of `RoutesManifest`. Auto-generated `main.ts` handles this
  automatically — no consumer changes needed unless you have a custom entry point.

- **Server API** — `EmrouteServerConfig.routesManifest` → `routeTree`,
  `EmrouteServer.manifest` → `routeTree`.

- **SPA basePath stripping** — SPA router now strips the HTML basePath prefix
  before trie matching, consistent with SSR routers.

- **esbuild manifest plugin** — generates `routeTree` + `moduleLoaders` instead
  of flat `RoutesManifest`. Redirect and error boundary `.ts` paths are included
  in module loaders for browser bundling.

### Added

- **`RouteTrie`** — trie-based route resolver with O(segments) matching.
- **`RouteNode`** type — JSON-serializable tree node for route definitions.
- **`RouteResolver`** interface — DI point for route matching (`match`,
  `findErrorBoundary`, `findRoute`).
- **`SpaHtmlRouterOptions.moduleLoaders`** — passes pre-bundled module loaders
  through to `RouteCore` for browser-side `.ts` module resolution.

### Removed

- **`RoutesManifest`** export — no longer part of the public API.
- **`prefixManifest()`** — base path prefixing is handled by the server, not the
  manifest.

### Fixed

- **SPA error boundaries** — `findErrorBoundary` now receives the stripped
  pathname (not the browser pathname with basePath prefix).
- **SPA `load` event** — emits `routeInfo.pathname` (actual URL) instead of
  `routeInfo.pattern` (trie pattern).
- **Server redirect prefixing** — only prepends basePath when redirect target
  starts with `/`, avoiding mangled absolute URLs.

## [1.6.0] - 2026-02-25

### Added

- **`spa` on `RuntimeConfig`** — the server passes the SPA mode to the runtime
  so `bundle()` can skip entirely when `spa: 'none'`. Custom runtime
  implementations can use `this.config.spa` for their own bundling decisions.

- **Hono integration guide** — `doc/13-hono.md` with complete setup example.

### Changed

- **Bare paths redirect in all modes** — previously `root` and `only` modes
  served the SPA shell at bare paths (`/`, `/about`). Now all modes redirect
  bare paths to the configured HTML base path (e.g. `/html/about`). The SPA
  router lives at `/html/*`, same as SSR. This fixes empty pages in `only` mode
  and "Not Found" on initial load in `root` mode.

- **Static file misses return `null`** — requests for nonexistent files with
  extensions (e.g. `/nonexistent.js`) now return `null` instead of falling
  through to a redirect. Consumers handle their own 404 logic.

## [1.6.0-beta.1] - 2026-02-24

### Added

- **ESLint** — `typescript-eslint` with recommended config, `prefer-const`,
  `eqeqeq`, `no-useless-assignment`. Lint script: `bun run lint`.

- **Missing package exports** — `@emkodev/emroute/ssr/html`,
  `@emkodev/emroute/ssr/md`, `@emkodev/emroute/runtime/sitemap` now exposed
  in `package.json` exports map.

- **`files` field in `package.json`** — only `src/`, `server/`, `runtime/`,
  `LICENSE`, and `README.md` ship to npm. Tests, docs, and build artifacts
  excluded.

- **New documentation** — error handling guide (`doc/11-error-handling.md`),
  Shadow DOM architecture (`doc/12-shadow-dom.md`), comprehensive nesting
  guide (`doc/05-nesting.md`).

### Changed

- **Documentation reorganized** — Deno-era docs removed, 1.6.0 numbered guides
  promoted to `doc/` root. README documentation section updated with all 12
  guides.

- **Test markdown renderer** — replaced vendored `emko-md` with
  `@emkodev/emkoma` for browser test server and client-side rendering.

### Removed

- **`server/vendor/`** — vendored `emko-md` files removed. Use `@emkodev/emkoma`
  or any markdown renderer that implements the `MarkdownRenderer` interface.

### Changed

- **Virtual manifest plugin** — `.g.ts` manifest files eliminated. An esbuild
  virtual plugin (`emroute:routes`, `emroute:widgets`) reads JSON manifests from
  the runtime at bundle time and generates `import()` calls in-memory. JSON is
  the single source of truth — no stale intermediaries.

- **`Runtime.loadModule()`** — replaces `moduleLoader` callback on server config.
  Each runtime implements dynamic module loading for SSR. `BunFsRuntime` uses
  native `import()`, `BunSqliteRuntime` transpiles via esbuild and imports from
  blob URLs.

- **Auto-generated `main.ts`** — when `config.entryPoint` is set but the file
  doesn't exist, `bundle()` generates a default entry point that imports from
  `emroute:routes`/`emroute:widgets`, registers widgets, and creates the SPA
  router. Consumer's existing `main.ts` is never overwritten.

- **Parallel bundling** — SPA, app, and widgets esbuild builds run concurrently
  via `Promise.all` instead of sequentially.

- **Import map derived from `EMROUTE_EXTERNALS`** — the generated `index.html`
  import map keys are derived from the `EMROUTE_EXTERNALS` constant instead of
  hardcoded strings.

### Removed

- **`moduleLoader` on `EmrouteServerConfig`** — server uses
  `runtime.loadModule()` automatically. No callback needed.

- **`createModuleLoader()` on `BunSqliteRuntime`** — replaced by `loadModule()`
  override.

- **`generateManifestCode()` / `generateWidgetsManifestCode()`** — codegen
  functions removed from public API. The esbuild virtual plugin is the sole
  consumer of this logic now.

- **`.g.ts` manifest files** — no longer generated during builds or tests.

## [1.5.3-beta.4] - 2026-02-21

> Versions 1.5.1 and 1.5.2 were yanked. This release includes all changes since 1.5.0.

### Changed

- **`Runtime` abstract class** — replaces `ServerRuntime`/`FileSystem`. Speaks
  `fetch()` signature (`Request`/`Response`) with three access patterns:
  `handle()` (raw passthrough), `query()` (read, with `{ as: "text" }` shortcut),
  `command()` (write). See ADR-1.

- **Bundling removed from server** — `Runtime.bundle()` eliminated. Bundling is
  a build step that runs externally (`deno task`, npm scripts, esbuild, etc.).
  The server detects pre-built bundles (`emroute.js`, `widgets.js`, `app.js`)
  and builds the import map accordingly.

- **Three-bundle split** — framework (`emroute.js`), widgets (`widgets.js`),
  and consumer app (`app.js`) are separate bundles connected via browser import
  maps. `deno bundle --external` externalizes cross-bundle imports.

- **Eliminated `dev.server.ts`** — `createDevServer` removed. All server concerns
  consolidated into `createEmrouteServer`. CLI and consumers wire bundling and
  file watching externally.

- **Shell auto-discovery** — `createEmrouteServer` now auto-discovers
  `index.html` (custom shell) and `main.css` (stylesheet injection) in appRoot.

- **Extracted `denoBundler`** — moved to `@emkodev/emroute/bundler/deno`.
  `build()` requires explicit bundler when spa !== 'none'.

- **Restructured server internals** — `tool/` moved to `server/generator/`,
  vendor files moved to `server/vendor/`. Export paths unchanged.

### Fixed

- `generateMainTs` now imports `ComponentElement` and `createSpaHtmlRouter` from
  `@emkodev/emroute/spa` instead of the main export (was a silent bundling error).

- Search filter in widgets now reads `shadowRoot.textContent` instead of
  `element.textContent` (shadow DOM elements return empty string for the latter).

## [1.5.0] - 2026-02-18

### Changed

- **Unified Shadow DOM architecture** — `ComponentElement` now always uses Shadow
  DOM (real in browser, mock on server). Content renders to
  `this.shadowRoot.innerHTML` instead of `this.innerHTML`. Provides true Web
  Components spec compliance, better CSS encapsulation, and consistent behavior
  across SSR and SPA rendering modes. See `doc/shadow-dom-architecture.md`.

- **Navigation API replaces History API** — the SPA router now uses the browser's
  Navigation API (`window.navigation`) instead of `pushState`/`replaceState`/
  `popstate`. Single `navigate` event handler replaces the `click` listener
  (with `composedPath()` traversal) and `popstate` listener. Scroll restoration
  handled by `event.scroll()`. Browsers without the Navigation API gracefully
  fall back to SSR full-page navigation. See ADR-0014.

- **Scoped `<router-slot pattern="...">`** — each `<router-slot>` is now
  attributed with the `pattern` of the route that produced it. SSR `injectSlot`
  targets slots by pattern instead of replacing the first match, preventing
  child content from rendering into ancestor slots. SPA renderer uses
  `querySelector('[pattern="..."]')` for the same scoped descent.

- **Configurable base paths** — `/html/` and `/md/` are now configurable via
  `BasePath` instead of hardcoded constants. `prefixManifest()` applies base
  paths to route manifests.

- **`hydrate()` receives render args** — signature changed from `hydrate?()` to
  `hydrate?(args: RenderArgs)`, providing `{ data, params, context }`. Existing
  widgets that ignore the argument still compile.

- **Built-in widgets are now opt-in** — `PageTitleWidget` and
  `BreadcrumbWidget` are no longer auto-registered when importing
  `@emkodev/emroute/spa`. Import and register them explicitly if needed.

- **Trailing slash normalization** — canonical URLs no longer have trailing
  slashes. SSR renderers return 301 redirects for trailing-slash URLs (e.g.
  `/html/about/` → `/html/about`). SPA `normalizeUrl()` strips trailing slashes.

- **Shared recursive widget resolver** — extracted `resolveRecursively<T>()` in
  `widget-resolve.util.ts`, used by both HTML and Markdown widget resolution.
  Resolve and wrap phases are now separated: inner HTML is resolved and recursed
  into first, then wrapped in the outer DSD template.

- **`isLeaf` check in default rendering** — `PageComponent.renderHTML` and
  `renderMarkdown` fallbacks no longer emit `<router-slot>` when
  `context.isLeaf` is `true`. Leaf routes produce clean output without unused
  slot placeholders.

- **`stripSlots` now strips unconsumed slots** — SSR HTML `stripSlots` changed
  from no-op to removing all unconsumed `<router-slot>` tags from final output.
  Markdown `stripSlots` handles both bare and parameterized slot blocks.

- **Toast dismiss is CSS-only** — `dismiss()` sets `data-dismissing` attribute,
  CSS `overlay-toast-exit` animation handles the exit. Dead toasts (with
  `data-dismissing`) are cleaned up before appending new ones.

- **Dev server mode-aware bundling** — `spa: 'none'` mode no longer spawns a
  bundle process or injects `<script>` tags. `spa: 'leaf'` mode uses generated
  `_main.generated.ts` (widget hydration only, no router) instead of consumer
  `main.ts`.

- **Dev server deduplication** — SSR router construction extracted into
  `rebuildSsrRouters()`, widget SSR import loop extracted into
  `importWidgetsForSsr()`.

- **`RouteCore.root` getter** — `get root(): string` returns `basePath || '/'`,
  replacing inline calculations across renderers.

- **`SpaHtmlRouter` no longer stores `mode`** — mode only lives on
  `DevServerConfig` to control whether the router is created at all.

- **BreadcrumbWidget reads `context.basePath`** — no longer hardcodes
  `DEFAULT_BASE_PATH.html`.

- **Improved SSR HTMLElement mock** — `SsrHTMLElement.style` uses a `Proxy` that
  accepts any CSS property assignment. `append()`, `childNodes`, `firstChild`
  stubs added for spec completeness.

- **`context` is now required on `DataArgs` and `RenderArgs`** — every real
  rendering codepath already provides context; the optional typing forced
  defensive `context?.` chaining everywhere. Error boundary and error handler
  fallback paths now construct a minimal context instead of omitting it.

- **`data-ssr` → boolean `ssr` attribute** — SSR-rendered widgets now use a
  simple boolean `ssr` attribute instead of serializing the full `getData()`
  result as JSON into `data-ssr='...'`. This eliminates HTML payload bloat
  for widgets with large data objects.

- **`exposeSsrData` opt-in for hydration data** — widgets that genuinely need
  their server-fetched data on the client can set `readonly exposeSsrData = true`.
  The `getData()` result is serialized as JSON text in the element's light DOM
  (invisible alongside the Declarative Shadow DOM root), parsed and cleared
  during hydration. Most widgets don't need this — the rendered Shadow DOM
  already contains the visual representation.

### Added

- **Declarative overlays** — popovers, modals, and toasts work with zero JS via
  Invoker Commands API (`commandfor`/`command`), `<form method="dialog">`, and
  CSS keyframe animations. See ADR-0013.

- **CSS-driven toast lifecycle** — toast auto-dismiss uses CSS `@keyframes`
  instead of JS timers. `--overlay-toast-duration` custom property controls
  timing (default 5s). `data-toast-manual` attribute opts out of auto-dismiss.

- **DOM-aware `dismissAll()`** — closes both programmatic overlays (managed by
  `OverlayService`) and declarative popovers/dialogs found via DOM queries
  (`:popover-open`, `dialog[open]`).

- **CSS anchor positioning for popovers** — declarative popovers use CSS anchor
  positioning for automatic anchor placement from `commandfor`.

- **Server-rendered flash toast** — `<div data-overlay-toast>` in SSR HTML
  auto-animates on page load via CSS. No JS required. Covers the flash message
  pattern for `spa: 'none'` mode.

- **Navigation API type declarations** — `src/type/navigation-api.d.ts` provides
  TypeScript types for the Navigation API (not yet in TypeScript's lib.dom.d.ts).
  Published as `@emkodev/emroute/types/navigation-api`.

- **Form GET interception** — `<form method="get">` submissions in `spa: 'root'`
  and `spa: 'only'` modes are now intercepted as SPA transitions instead of
  causing full page loads.

- **`logger.warn()` in SPA logger** — always logs via `console.warn` (not gated
  by debug flag). Used for missing slot warnings during SPA navigation.

- **`doc/shadow-dom-architecture.md`** — comprehensive documentation of the unified
  Shadow DOM architecture, SSR mocks, rendering strategies, and migration
  patterns.

- **Zero-config CLI** (experimental) — `deno run -A jsr:@emkodev/emroute/server/cli start`
  starts a dev server by scanning `routes/` and `widgets/` in the current
  directory. No config file, no `main.ts`, no `deno.json` required. Supports
  subcommands: `start` (default), `build`, `generate`. SPA mode is inferred
  automatically. The server CLI is experimental.

- **Production server API** — `createEmrouteServer()` and `build()` for
  production builds with split bundles, compression, and import maps.

- **Built-in markdown renderer** — CLI ships a vendored emko-md bundle for
  server-side `<mark-down>` expansion. Markdown content renders to HTML during
  SSR with zero JS required in the browser.

### Breaking Changes

- **Widget content queries must use `shadowRoot`** — widgets that query their own
  rendered content must change from `this.element.querySelector()` to
  `this.element.shadowRoot?.querySelector()`.

  ```typescript
  // Before (1.4.x):
  override hydrate(): void {
    const button = this.element.querySelector('button');
    button?.addEventListener('click', this.handleClick);
  }

  // After (1.5.0):
  override hydrate(): void {
    const button = this.element.shadowRoot?.querySelector('button');
    button?.addEventListener('click', this.handleClick);
  }
  ```

- **Built-in widget registration** — if you rely on `PageTitleWidget` or
  `BreadcrumbWidget`, you must now register them explicitly:

  ```typescript
  // Before (1.4.x): automatic
  import { createSpaHtmlRouter } from '@emkodev/emroute/spa';

  // After (1.5.0): explicit opt-in
  import { ComponentElement, createSpaHtmlRouter, PageTitleWidget } from '@emkodev/emroute/spa';
  ComponentElement.register(new PageTitleWidget());
  ```

### Removed

- **History API code** — `history.pushState`, `history.replaceState`, `popstate`
  listener, `click` listener with `composedPath()`, `scrollToAnchor()`, and
  `navigationController` field removed from the SPA renderer.

### Fixed

- **Container type layout bug** — removed `container-type: inline-size` from
  `ComponentElement` default styles. This CSS property was causing widgets to
  collapse to 0 width in flex layouts.

- **`parseAttrsToParams` unescaping** — now unescapes both `&#39;` → `'` and
  `&quot;` → `"`, matching the escape output.

- **SPA shell for bare paths** — bare paths in `root`/`only` mode serve the SPA
  shell (200) instead of 302 redirect. The SPA router handles client-side nav.

- **SPA markdown layout ordering** — child route content appeared after the
  layout footer in `root` and `only` modes. Reordered `attributeSlots` after
  `waitForMarkdownRender` so the SPA router finds `<router-slot>` inside
  rendered `<mark-down>` content.

- **Orphaned AbortController on initial SPA navigation** — `dispose()` now
  aborts in-flight initial `getData()` calls.

### Docs

- Updated README, guide, quick-start, and architecture docs for 1.5.0 changes
  (Shadow DOM queries, Navigation API, `hydrate(args)`, declarative overlays,
  configurable base paths, `setHTMLUnsafe`).

## [1.4.5] - 2026-02-14

### Added

- **`isLeaf` context property** — `ComponentContext` now includes an `isLeaf` boolean flag that indicates whether a component is the matched (leaf) route (`true`) or a parent layout route (`false`). This allows pages and widgets to conditionally render content based on their position in the route hierarchy. Available in all rendering modes (SPA, SSR HTML, SSR Markdown) and passed through context providers.

## [1.4.4] - 2026-02-14

### Changed

- **Code quality improvements** — comprehensive lint error resolution across test suite and source code. Removed all `any` types in favor of proper type annotations, fixed async/await patterns, and eliminated unused variables. All 120 files now pass strict linting with zero errors.

- **Type safety enhancements** — improved type annotations in test files, replacing generic `any` types with specific interface types for better compile-time safety and developer experience.

- **Test code consistency** — standardized async patterns by removing unnecessary `async` keywords from synchronous functions and properly wrapping return values in `Promise.resolve()` where needed.

## [1.4.3] - 2026-02-14

### Added

- **Recursive nested widget resolution in SSR (HTML + Markdown)** — widgets can now render other widgets in their `renderHTML()` and `renderMarkdown()` output. Both SSR renderers recursively resolve nested widgets up to `MAX_WIDGET_DEPTH=10`, enabling component composition and reusability across all three rendering modes (SPA, HTML, Markdown). Each widget maintains its own `data-ssr` attribute for independent hydration. Includes comprehensive test coverage with 5 new tests for nesting scenarios.

- **Shared recursive resolver in `SsrRenderer` base class** — extracted common recursion logic into `resolveWidgetsRecursively()` helper method, eliminating code duplication between HTML and Markdown renderers while maintaining consistent nesting behavior across all SSR formats.

### Changed

- **Cleaner `data-ssr` attribute format** — switched from double-quoted to single-quoted HTML attributes for `data-ssr`, making the JSON values more readable in HTML source (e.g., `data-ssr='{"key":"value"}'` instead of `data-ssr="{&quot;key&quot;:&quot;value&quot;}"`).

### Fixed

- **Widget resolution edge cases** — updated attribute escaping to handle single quotes in JSON values when using single-quoted HTML attributes.

## [1.4.2] - 2026-02-14

### Added

- **`hydrate()` lifecycle hook** — new optional lifecycle method for components and
  widgets to attach event listeners after SSR adoption or SPA rendering. Called after
  `getData()` and `renderHTML()` complete, enabling interactive functionality without
  re-rendering. Complements `destroy()` for proper memory management.
  See `test/browser/SSR-ADOPTION-VS-HYDRATION.md` for full documentation.

### Changed

- **Widget hydration optimization** — `ComponentElement` now checks for `hydrate()`
  method existence before queuing microtask, avoiding unnecessary async overhead for
  widgets without interactivity.

### Fixed

- **Test coverage** — comprehensive test suite updates for SSR adoption, hydration
  lifecycle, and widget rendering scenarios.

## [1.4.1] - 2026-02-13

### Fixed

- **Markdown renderer slot nesting** — the markdown renderer was concatenating
  route hierarchy content instead of nesting it into slots. Our tests were
  expecting similar output, because with nesting, a markdown+slot / markdown+slot
  structure would replace the first slot with subpage content and then strip the
  unused second slot. While the output was the same for most cases, the behaviour
  was not as planned. We apologize for any inconvenience. To avoid
  misunderstanding on how nesting works, we've created a
  [document describing the behaviour](doc/nesting.md) and some nice tricks for
  you to try.

### Changed

- **SSR renderer base class** — extracted shared rendering pipeline into abstract
  `SsrRenderer` base class. Both `SsrHtmlRouter` and `SsrMdRouter` now extend it,
  unifying route hierarchy composition, error handling, and status page rendering.

## [1.4.0] - 2026-02-12

### Added

- **Centralized overlay service** — new `@emkodev/emroute/overlay` module provides
  factory function `createOverlayService()` managing modals (`<dialog>`), toasts
  (`<div>` stack), and popovers (`popover` attribute). Integrates with component
  context via `extendContext`. Features include lazy DOM creation, CSS transitions
  with `@starting-style` and discrete animations, popover anchor positioning
  (CSS anchors with fallback), and navigation-triggered dismissal.

### Changed

- **Renderer-side widget expansion** — widget fenced blocks (`` `widget:name`)
  are now expanded by the markdown renderer's AST pipeline instead of regex-based
  post-processing. Requires `@emkodev/emko-md@0.1.0-beta.3` or a renderer that
  emits `<widget-*>` tags directly. Removed `processFencedWidgets` and
  `processFencedSlots` from `fenced-block.util.ts` (deleted).

## [1.3.4] - 2026-02-11

### Added

- **Container queries on all widget elements** — `ComponentElement` sets
  `container-type: inline-size` on every widget custom element. Widget CSS can
  use `@container` queries to respond to the widget's own width instead of the
  viewport. Works out of the box — no opt-in needed.
- **Cross-document view transitions** — generated HTML shell includes
  `@view-transition { navigation: auto; }` for animated SSR route transitions.
  Consumer-provided `index.html` can add the same rule to opt in.

## [1.3.3] - 2026-02-11

### Added

- **View Transitions on SPA navigation** — `SpaHtmlRouter` wraps route changes
  in `document.startViewTransition()` for animated cross-fades between pages.
  Progressive enhancement — browsers without support fall back to instant DOM
  updates. Customize animations via `::view-transition-*` CSS pseudo-elements.
  Disable with `::view-transition-group(*) { animation-duration: 0s; }`.

### Changed

- Test suite: 583 unit tests, 92 browser test steps.

## [1.3.2] - 2026-02-11

### Added

- **`content-visibility: auto` on all widget elements** — `ComponentElement` sets
  `content-visibility: auto` on every widget custom element in the browser.
  Off-screen widgets skip layout and paint entirely; visible widgets render
  normally. Users can override per-widget with CSS. Zero JS overhead.
- **`@scope` auto-injection for widget companion CSS** — companion `.widget.css`
  files are automatically wrapped in `@scope (widget-{name}) { ... }` by
  `WidgetComponent.renderHTML()`. Styles are scoped to the widget's custom element
  without Shadow DOM or manual class prefixes. Works in both SSR and SPA.
  `scopeWidgetCss()` utility exported for custom widget overrides.

## [1.3.1] - 2026-02-11

### Added

- **`lazy` attribute on widgets** — `<widget-foo lazy>` defers `loadData()` until
  the element enters the viewport via `IntersectionObserver`. Same pattern as
  `<img loading="lazy">`. Laziness is decided at the usage site, not the widget
  definition. SSR ignores the attribute — lazy widgets are still pre-rendered
  server-side. SSR-hydrated widgets skip `loadData` regardless of `lazy`
  (correct behavior). `reload()` always fetches immediately.

### Fixed

- SSR `parseAttrsToParams` now skips the `lazy` attribute, preventing it from
  leaking into widget params as `{ lazy: '' }`.

## [1.3.0] - 2026-02-11

### Added

- **`element` property on Component** — optional `HTMLElement` reference set by
  `ComponentElement` when the widget connects in the browser. Available in
  `getData()`, `renderHTML()`, `destroy()`, and any other method during the
  browser lifecycle. Stays `undefined` on the server (SSR/Markdown), preserving
  isomorphic safety. Cleared on disconnect.

## [1.2.0] - 2026-02-11

### Added

- **Extensible component context** — `extendContext` option on all routers
  (`createSpaHtmlRouter`, `SsrHtmlRouter`, `SsrMdRouter`) accepts a
  `ContextProvider` callback that enriches every `ComponentContext` with
  app-level services before it reaches components. Works for both pages and
  widgets across all three rendering contexts (SPA, SSR HTML, SSR Markdown).
- **`TContext` generic on Component** — third type parameter
  (`Component<TParams, TData, TContext>`) defaults to `ComponentContext`.
  Consumers can narrow context types per-component or use module augmentation
  for app-wide typing.
- **`ContextProvider` type** exported from `@emkodev/emroute`.
- **`SpaHtmlRouterOptions`** exported from `@emkodev/emroute/spa`.
- **`ComponentElement.setContextProvider()`** — static method for browser-side
  context enrichment, called automatically by `createSpaHtmlRouter`.

### Fixed

- `SpaHtmlRouter.dispose()` now clears the static context provider on
  `ComponentElement`, preventing stale providers from persisting across
  router re-creation (e.g., during HMR or tests).

### Changed

- Test suite: 576 unit tests, 86 browser test steps.

## [1.1.0] - 2026-02-11

### Added

- **File-based widget discovery** — `discoverWidgets()` scans a `widgetsDir/`
  for `{name}/{name}.widget.ts` modules and their companion files (html, md,
  css). Generates a `WidgetsManifest` with module loaders for SPA bundles.
  `generateWidgetsManifestCode()` produces the manifest source file.
- **Per-element widget instantiation** — `ComponentElement.register()` now
  creates a fresh widget instance per DOM element via the class constructor,
  giving each element its own state. Added `ComponentElement.registerClass()`
  for manifest-based registration where a class (not instance) is available.
- **`WidgetRegistry.toManifest()`** — emits a `WidgetsManifest` from manually
  registered widgets for programmatic use.
- **SPA mode configuration** — `DevServerConfig.spa` accepts `'root'` (default),
  `'leaf'`, `'none'`, or `'only'` to control how the server handles non-file
  requests and whether SSR endpoints are active.
- **Zero-config dev server** — `entryPoint` is now optional. When absent, the
  server generates `_main.generated.ts` with widget registration and router
  initialization. When `index.html` is absent, a minimal HTML shell is
  generated. When `main.css` exists, a `<link rel="stylesheet">` is
  auto-injected into `<head>`.
- **Script tag injection** — the server always injects the bundled `<script>`
  tag before `</body>`, whether using a consumer-provided or generated
  `index.html`. Consumer HTML shells no longer need a manual script tag.
- **`__emroute_router` global** — `createSpaHtmlRouter()` stores the router
  instance on `globalThis.__emroute_router` for programmatic access from
  consumer scripts. Duplicate calls return the existing instance with a warning.
- **`SpaMode` type** exported from `@emkodev/emroute` and `@emkodev/emroute/spa`.
- **CLI `--widgets` flag** — `deno run tool/cli.ts [routesDir] [output]
  [importPath] [--widgets widgetsDir widgetsOutput]` generates both route and
  widget manifests.

### Deprecated

- `discoverWidgetFiles()` — use `discoverWidgets()` instead.
- `generateWidgetFilesManifestCode()` — use `generateWidgetsManifestCode()`.
- `DevServerConfig.widgetFiles` — use `widgetsDir` for auto-discovery.

### Fixed

- Redirect responses (`Response.redirect()`) no longer crash the dev server
  when security headers are injected (immutable headers).
- Redirect path in `spa: 'none'` mode no longer produces double slashes
  (`/html//about` → `/html/about`).

### Changed

- Dev server widget discovery uses `relativeToAppRoot()` to compute correct
  manifest paths regardless of `appRoot` depth.
- SSR widget import uses `extractWidgetExport()` to handle default, named
  instance, and class exports uniformly.
- Quick start guide simplified to one file (just `routes/index.page.md`).
- Consumer guide updated with file-based widget discovery, SPA modes, zero-config
  setup, and `__emroute_router` documentation.
- Test suite: 564 unit tests, 86 browser test steps.

## [1.0.3] - 2026-02-11

### Added

- **`this['DataArgs']` / `this['RenderArgs']` type carriers** on `Component` —
  generic type parameters now flow into method overrides via `declare` fields.
  Eliminates the need to restate `{ params: TParams; ... }` on every override.

## [1.0.2] - 2026-02-11

### Fixed

- Dev server generated manifests with wrong import path (`@emkodev/eMroute`
  instead of `@emkodev/emroute`), causing type-check failures for consumers.

### Changed

- Guide clarifies that fenced widget JSON body is optional (parameterless
  widgets need no `{}`).

## [1.0.1] - 2026-02-11

### Fixed

- README images converted from SVG to PNG for JSR registry rendering.
- Removed banned triple-slash directive from `server/cli.deno.ts`.
- Added explicit type annotation on `builtInWidgets` export.

## [1.0.0] - 2026-02-10

### Changed

- **Stable release** — promoted from beta.14 with no API changes.
- Guide documents that `.page.html` companion files must be HTML fragments, not
  full documents (`<!DOCTYPE>`, `<html>`, `<head>`, `<body>` are not allowed).
- README image links updated to JSR-hosted URLs for registry rendering.

## [1.0.0-beta.14] - 2026-02-10

### Added

- **Pluggable logger** — minimal `Logger` interface (`error`, `warn`) with
  module-level no-op default. `setLogger(impl)` swaps in a real implementation
  at startup. All silent SSR catch blocks now call `logger.error()`. Exported
  from `@emkodev/emroute`.
- **SSR error boundaries** — both SSR HTML and SSR Markdown renderers now
  respect `findErrorBoundary()` and `getErrorHandler()` before falling back to
  inline error pages. Consistent with the SPA error chain.
- **SPA navigation race fix** — per-navigation `AbortController` cancels
  in-flight navigations when a new one starts. Signal propagated through
  `buildComponentContext` to `fetch()` calls and `getData()`.
- **CLI exported** — `@emkodev/emroute/server/cli` sub-export added to
  `deno.json`.

### Fixed

- `[^]*?` V8-specific regex in `widget-resolve.util.ts` replaced with `.*?`
  - `/s` dotAll flag, consistent with the rest of the codebase.

## [1.0.0-beta.13] - 2026-02-10

### Added

- **Sitemap generation** — opt-in `@emkodev/emroute/sitemap` submodule generates
  sitemap.xml from a `RoutesManifest`. Static routes are included directly with
  `/html/` prefix for SSR rendering; dynamic routes are expanded via optional
  async enumerators or excluded. Supports per-route and default `lastmod`,
  `changefreq`, `priority` per the sitemaps.org protocol.

## [1.0.0-beta.12] - 2026-02-10

### Changed

- **TypeScript lib bumped to `esnext`** — enables full ES2024+ type support
- `ComponentElement` deferred ready pattern uses single `PromiseWithResolvers`
  field instead of separate `readyPromise` + `readyResolve` fields
- `escapeHtml`, `unescapeHtml`, `escapeAttr` use `replaceAll()` instead of
  regex-global for literal string replacements
- `RouteCore.currentRoute` uses `accessor` keyword instead of manual
  getter/setter + backing field
- Named regex capture groups added to fenced-block patterns
- `WidgetManifestEntry.tagName` typed as `` `widget-${string}` `` template
  literal instead of plain `string`
- Removed dead `?? 0` fallback on `match.index` in `parseWidgetBlocks`

## [1.0.0-beta.11] - 2026-02-10

### Changed

- **Baseline 2025 modernization** — adopt modern JS features across `src/`:
  - Replace `[\s\S]*?` with dotAll `/s` flag in regex patterns
  - Add named capture groups (`(?<name>...)`) with `match.groups` access
  - Use `Promise.withResolvers()` instead of manual promise/resolve fields
  - Use `toSorted()` instead of `[...array].sort()` copy-to-sort
  - Use `matchAll().toArray()` instead of `[...matchAll()]` spread

## [1.0.0-beta.10] - 2026-02-10

### Added

- **Widget companion file auto-discovery** — `discoverWidgetFiles()` scans
  `{widgetsDir}/{name}/{name}.widget.{html,md,css}` and merges per-key with
  explicit `widget.files` (explicit wins, discovered fills gaps); no widget
  mutation
- **Widget files manifest generation** — `generateWidgetFilesManifestCode()`
  produces a plain TypeScript data module for SPA bundles
- **SPA widget context** — `ComponentElement` now loads companion files via
  static cache, builds `ComponentContext` with real `location.pathname`, and
  passes it to `getData()` and `renderHTML()`; widgets in SPA mode now receive
  route info and file content
- **`ComponentElement.register()` accepts optional `files`** — discovered file
  paths can be passed at registration time without mutating widget instances
- **`widgetFiles` option on SSR renderers and dev server** — `SsrHtmlRouter`,
  `SsrMdRouter`, and `DevServerConfig` accept a `widgetFiles` record; SSR
  renderers merge discovered + declared files internally
- `@emkodev/emroute/widget-generator` sub-export in `deno.json`
- `files` field on `WidgetManifestEntry` type

### Breaking

- **`resolveWidgetTags` callback signature changed** — `loadFiles` callback
  now receives `(widgetName: string, declaredFiles?)` instead of `(files)`;
  guard changed from `if (widget.files && loadFiles)` to `if (loadFiles)` so
  auto-discovered widgets without declared files are also resolved

### Changed

- Nav widget and file-widget test fixtures no longer declare manual `files` —
  companion files are auto-discovered
- Removed `.site-nav` CSS workaround from test fixture `index.html` — nav CSS
  now loads via `ComponentElement` context in SPA mode
- Test suite: 545 unit tests, 62 browser test steps

## [1.0.0-beta.9] - 2026-02-10

### Breaking

- **`ComponentContext` now extends `RouteInfo`** — requires `pattern` and
  `searchParams` fields; `pathname` now carries the actual URL path
  (`/projects/123`) instead of the route pattern (use `context.pattern` for the
  old behavior)
- **`RouteParams` is now `Readonly<Record<string, string>>`** — prevents
  accidental mutation of route parameters
- **`MatchedRoute` fields are now `readonly`**

### Added

- `RouteInfo` interface — immutable route context (pathname, pattern, params,
  searchParams) built once per navigation and shared across the entire render
  pipeline without decomposition
- `RouteCore.toRouteInfo()` — builds a `RouteInfo` from a `MatchedRoute` and
  resolved pathname
- `RouteInfo` exported from public API (`@emkodev/emroute`)

### Changed

- `buildComponentContext` signature simplified from 4 positional args to 2
  structured args (`routeInfo: RouteInfo`, `route: RouteConfig`)
- `resolveWidgetTags` takes `routeInfo: RouteInfo` instead of individual
  `pathname`/`routeParams` arguments
- All three renderers (SPA, SSR HTML, SSR MD) build `routeInfo` once after
  matching and pass it through the pipeline — eliminates destructure-and-
  reassemble anti-pattern
- Widget context construction simplified to `{ ...routeInfo, files }` instead
  of ad-hoc object assembly
- Test suite: 545 unit tests, 61 browser test steps

## [1.0.0-beta.8] - 2026-02-10

### Breaking

- **Root error handler renamed** — `routes/error.ts` is now
  `routes/index.error.ts` to follow the `{name}.{kind}.ts` naming convention;
  bare `error.ts` at the routes root is no longer recognized

### Added

- `doc/error-handling.md` — consumer-facing documentation for the three-layer
  error handling architecture (inline errors, scoped boundaries, root handler,
  status pages)
- `issues/pending/ssr-error-boundary.issue.md` — tracks SSR renderers ignoring
  error boundaries (known gap, blocked by route context rework)

### Fixed

- **Path traversal in dev server** — `safePath()` normalizes and validates
  all static file paths against their root directory; returns 403 on escape
- **Error response information leak** — dev server, SSR HTML, and SSR MD
  renderers now return generic error messages; stack traces logged server-side
  only
- **Open redirect via dangerous protocols** — `assertSafeRedirect()` blocks
  `javascript:`, `data:`, and `vbscript:` URLs in redirect configs (both SSR
  and SPA)
- **`escapeHtml` missing backtick** — added `` ` `` → `&#96;` escape and
  matching `unescapeHtml` reverse to keep the markdown SSR pipeline intact

### Changed

- Dev server static file serving restricted to an allowlist of safe extensions
  (`.html`, `.js`, `.css`, `.wasm`, images, fonts, media, etc.)
- Dev server responses include `X-Content-Type-Options: nosniff` and
  `X-Frame-Options: DENY` headers
- `MarkdownRenderer.render()` JSDoc documents that output is set via
  `innerHTML` and renderer must sanitize; `doc/markdown-renderer.md` expanded
  with security section covering SSR vs SPA risk profiles
- `toUrl` re-exported from `route.matcher.ts` directly instead of via
  `route.core.ts` for better tree-shaking
- `PageComponent` consolidated into `page.component.ts` (moved from
  `abstract.component.ts`)

## [1.0.0-beta.7] - 2026-02-10

### Fixed

- Query string parameters now preserved through all three renderers — added
  `searchParams` to `MatchedRoute` and `ComponentContext`, threaded through SPA,
  SSR HTML, and SSR MD `renderRouteContent` paths
- `buildComponentContext` fetches companion files (html, md, css) in parallel
  via `Promise.all` instead of sequentially
- `loadWidgetFiles` fetches widget files in parallel via `Promise.all`
- `MarkdownElement` error display uses `c-error` CSS class instead of inline
  styles, consistent with `abstract.component.ts` error rendering

### Changed

- Split `html.util.ts` into three focused modules: core HTML utilities remain in
  `html.util.ts`, fenced block processing moves to `fenced-block.util.ts`, and
  SSR widget tag resolution moves to `widget-resolve.util.ts`
- Centralized SSR prefix stripping into `stripSsrPrefix()` utility — replaces 7
  duplicated inline implementations across renderers, elements, and dev server
- Extracted magic strings and numbers to named constants: `DATA_SSR_ATTR`,
  `CSS_LOADING`, `CSS_MARKDOWN`, `CSS_ERROR`, `MARKDOWN_RENDER_TIMEOUT`,
  `BUNDLE_WARMUP_DELAY`, `WATCH_DEBOUNCE_DELAY`, `DATA_ROUTER_SLOT_ATTR`,
  `DEFAULT_HTML_SEPARATOR`, `DEFAULT_MD_SEPARATOR`
- `resolveWidgetTags` uses `Component` and `ComponentContext` types directly,
  eliminating ad-hoc `WidgetLike` and `WidgetRouteContext` interfaces
- Deleted dead `src/route/router.ts` backward-compatibility shim
- `DATA_SSR_ATTR`, `CSS_ERROR`, `stripSsrPrefix` exported from public API
- Removed obsolete `<title>` element extraction test from SPA browser suite
- Test fixture app expanded with article, dashboard, and guide routes plus 8 new
  widget fixtures; 536 unit tests, 60 browser test steps

## [1.0.0-beta.6] - 2026-02-10

### Fixed

- `parseAttrsToParams` now handles single-quoted (`attr='value'`), unquoted
  (`attr=value`), and boolean (`disabled`) attributes — previously only
  double-quoted attributes were parsed, causing SSR/SPA data mismatch
- `resolveWidgetTags` no longer matches self-closing syntax (`<widget-foo />`),
  aligning SSR with the HTML spec where self-closing custom elements are
  invalid — only paired tags (`<widget-foo></widget-foo>`) are resolved
- SPA click handler no longer intercepts `/html/` and `/md/` links — these
  SSR prefixes now trigger full page navigation as intended
- `PageComponent.renderHTML` injects `.md` content into empty
  `<mark-down></mark-down>` tags when both `.html` and `.md` files exist
- SSR Markdown renderer strips unsubstituted `router-slot` placeholders from
  leaf pages instead of emitting useless fenced code blocks

### Changed

- SSR Markdown Content-Type changed from `text/plain; charset=utf-8` to
  `text/markdown; charset=utf-8; variant=CommonMark` per RFC 7763
- `parseAttrsToParams` is now exported for direct use and testing
- Test suite expanded: 536 unit tests, 61 browser test steps

## [1.0.0-beta.5] - 2026-02-09

### Added

- CSS companion files for pages (`.page.css`) and widgets (`.widget.css`) —
  discovered, loaded, and injected as `<style>` tags in SSR HTML output
- Widget file support: widgets can declare `.html`, `.md`, and `.css` files
  that get loaded by SSR infrastructure and passed through `ComponentContext.files`
- WidgetComponent default `renderHTML`/`renderMarkdown` fallback chains that
  use declared files automatically (html file → md `<mark-down>` → base default)
- Remote widget files: absolute URLs supported for widget file paths (fetched
  at render time with caching)
- `leafPathname` propagation in both SSR HTML and Markdown renderers — widgets
  in parent layouts now see the actual target route's pathname, not the layout's
- Nav widget test fixture demonstrating CSS files + active route highlighting

### Fixed

- XSS in dev server title injection (escapeHtml)
- Code injection via file paths in generated route manifest
- Broken route collision detection in generator
- Self-closing widget tag matching in `resolveWidgetTags`
- Markdown renderer race condition (eager init, local ref capture)
- `buildComponentContext` not throwing on failed fetch responses
- URLPattern groups cast (filter undefined values)
- `readyPromise` hang on disconnect (signal before nulling)
- SPA renderer timeout leak — added `dispose()` for listener cleanup
- Single-quote escaping added to `escapeHtml`/`unescapeHtml`

### Changed

- Renamed `Widget` → `WidgetComponent`, `PageContext` → `ComponentContext`
- Widgets receive `pathname` and route params during SSR via unified context
- Breadcrumb widget works server-side via `ComponentContext.pathname`
- Sort error boundaries once at construction instead of per lookup
- Removed dead code from `markdown.element.ts`
- Test suite expanded: 506 unit tests, 33 SSR browser test steps

## [1.0.0-beta.4] - 2026-02-08

### Added

- WidgetRegistry — canonical registry where all widgets live, used by all
  renderers (SPA, SSR HTML, SSR Markdown)
- Server-side widget rendering: SSR HTML calls getData() + renderHTML() on
  widgets, injects content + data-ssr attribute for hydration
- Server-side widget rendering: SSR Markdown resolves fenced widget blocks
  via getData() + renderMarkdown(), replacing blocks with text output
- SPA hydration: router detects data-ssr-route on <router-slot>, skips
  initial render and adopts SSR content
- Widget hydration: ComponentElement skips render() when data-ssr present,
  restores state from attribute, removes it after adoption
- ADR-0011: Light DOM with Server-Side Widget Rendering (rejects Shadow DOM,
  defines CSS scoping by convention, unifies SSR/hydration/CSS decisions)

### Changed

- Everything non-page is now a Widget (dropped c-* prefix, removed tagPrefix
  from Widget class, ComponentElement.register always uses widget-* prefix)
- SSR HTML shell adds data-ssr-route attribute to <router-slot> for SPA
  adoption

## [1.0.0-beta.3] - 2026-02-08

### Fixed

- File watcher on macOS not detecting new .page.* files (FSEvents reports
  "other" instead of "create")
- SSR HTML shell now reuses the app's index.html instead of generating a
  bare-bones shell (fixes unstyled SSR output and "[Router] Slot not found"
  console error)

### Added

- Component destroy lifecycle hook (`destroy?(): void` on Component class)
- Built-in `widget-page-title` — sets document.title from .page.html/.page.md
- Built-in `widget-breadcrumb` — renders breadcrumb navigation from URL path
- ADR-0009: no inline script activation (widgets solve this)
- ADR-0010: raw HTML attributes for component params

### Changed

- Component params now use raw HTML attributes instead of `data-params` JSON
  blob. Fenced widget JSON keys become individual attributes. Type coercion
  via JSON.parse with string fallback.

## [1.0.0-beta.2] - 2026-02-08

### Fixed

- Generated manifest ././ double paths in module loaders
- MarkdownIsland → MarkdownElement naming in markdown-renderer docs
- Import paths in markdown-renderer docs (`@emkodev/emroute` → `@emkodev/emroute/spa`)
- SSR HTML import path in markdown-renderer docs
- CLI entryPoint default changed from `routes/index.page.ts` to `main.ts`
- Missing `--allow-write` and `--allow-run` permissions in dev task and CLI docs

### Added

- Quick start guide (`doc/quick-start.md`)
- emko-md setup guide (`doc/setup-emko-md.md`)
- @emkodev/emko-md as recommended renderer in markdown-renderer docs
- "When do you need a renderer" guidance in SPA Setup section
- Root index layout behavior documentation in Nested Routes section
- Three-file composition example (`.ts` + `.html` + `.md` via `<mark-down>`)
- Clarified root `index.page.*` acts as layout parent in File-Based Routing rules

## [1.0.0-beta.1] - 2026-02-08

### Added

- Initial release of emroute
- File-based routing with dynamic segments and catch-all directories
- Triple rendering: SPA, SSR HTML, and SSR Markdown from single components
- Widget system for interactive islands with data lifecycle and error handling
- Error boundaries with scoped error handlers per route prefix
- Redirect support with 301/302 status codes
- Native browser APIs only (URLPattern, custom elements, Navigation API)
- Development server with hot reload
- Comprehensive test suite (456 unit tests, 48 browser test steps)
- Full TypeScript support with strict compiler options
- ESM exports for granular imports
