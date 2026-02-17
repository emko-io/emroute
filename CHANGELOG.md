# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0-beta.3] - 2026-02-17

### Changed

- **`context` is now required on `DataArgs` and `RenderArgs`** — every real
  rendering codepath already provides context; the optional typing forced
  defensive `context?.` chaining everywhere. Error boundary and error handler
  fallback paths now construct a minimal context instead of omitting it.

## [1.5.0] - 2026-02-17

### Changed

- **Unified Shadow DOM architecture** — `ComponentElement` now always uses Shadow
  DOM (real in browser, mock on server). Content renders to
  `this.shadowRoot.innerHTML` instead of `this.innerHTML`. Provides true Web
  Components spec compliance, better CSS encapsulation, and consistent behavior
  across SSR and SPA rendering modes. See `SHADOW-DOM-ARCHITECTURE.md`.

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

- **`SHADOW-DOM-ARCHITECTURE.md`** — comprehensive documentation of the unified
  Shadow DOM architecture, SSR mocks, rendering strategies, and migration
  patterns.

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
