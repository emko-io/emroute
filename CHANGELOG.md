# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
