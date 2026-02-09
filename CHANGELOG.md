# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
