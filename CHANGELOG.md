# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Native browser APIs only (URLPattern, custom elements, History API)
- Development server with hot reload
- Comprehensive test suite (456 unit tests, 48 browser test steps)
- Full TypeScript support with strict compiler options
- ESM exports for granular imports
