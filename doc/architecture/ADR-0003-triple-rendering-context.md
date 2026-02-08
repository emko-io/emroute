# ADR-0003: Triple Rendering Context

**Status**: Accepted
**Date**: 2026-02-07
**Decision Makers**: Development Team

## Context

Most routers only output HTML. A few support SSR. None treat markdown as a
rendering target.

HTML is for browsers. Not every consumer is a browser. LLMs reading your site
need `## Projects`, not `<div class="flex gap-4">`. CLI tools piping docs need
text, not DOM. Search indexers want structure, not presentation. Markdown is the
universal content format.

emroute was designed from the start to serve the same content to browsers,
servers, and text-based consumers.

## Decision

emroute renders every route in three contexts from a single component:

- **SPA** (`/`) — browser renders into live DOM, client-side navigation, hydrated
  widgets.
- **SSR HTML** (`/html/*`) — server renders to HTML, expands markdown server-side,
  widgets hydrate as islands.
- **SSR Markdown** (`/md/*`) — server renders to plain markdown, readable by LLMs,
  curl, text clients.

The same `PageComponent` produces all three outputs. The router decides which
renderer to call based on the request path prefix. Each component implements
`renderHTML()` and `renderMarkdown()`. `getData()` runs server-side for SSR,
client-side for SPA.

## Consequences

### Positive

- **LLM-friendly out of the box**: Any route is available as plain markdown at
  `/md/*`. No scraping, no parsing, no prompt-engineering around HTML noise.
- **Content is testable as plain text**: Markdown output is a string. Assert
  against it directly — no DOM queries, no snapshot fragility.
- **Same component, no duplication**: One `PageComponent` defines the content
  once. The three renderers extract the appropriate format.
- **curl-friendly**: `curl https://site.com/md/about` returns `text/plain`.
  Readable in a terminal, pipeable to other tools.

### Negative

- **Every component needs two render methods**: `renderHTML()` and
  `renderMarkdown()` must both be implemented. The base class provides sensible
  defaults (HTML from file, markdown from file), but custom components carry the
  cost of maintaining both.
- **Markdown can't express all HTML**: Complex layouts, interactive widgets, and
  visual styling degrade gracefully in markdown output. The markdown context
  shows content, not presentation.

### Neutral

- The SPA renderer reuses the same HTML output as SSR HTML. The difference is
  where it runs (browser vs server) and how widgets activate (full hydration vs
  island hydration).

## References

- Code: `emroute/src/abstract.component.ts` — Component with
  renderHTML/renderMarkdown
- Code: `emroute/src/spa/html.renderer.ts` — SPA renderer
- Code: `emroute/src/ssr/html.renderer.ts` — SSR HTML renderer
- Code: `emroute/src/ssr/md.renderer.ts` — SSR Markdown renderer
- Doc: `emroute/doc/architecture.md`

## Notes

### Alternatives Considered

1. **HTML-only with scraping**: Extract text from HTML for non-browser consumers.
   Lossy, fragile, can't express semantic structure. The scraper has to guess
   what's content and what's chrome.

2. **Separate markdown files alongside components**: Maintain `.md` files next to
   each component with equivalent content. Content duplication, divergence risk —
   the HTML and markdown versions inevitably drift.

3. **Auto-convert HTML to markdown**: Run HTML through a converter at serve time.
   Lossy, styling artifacts leak into output, no semantic control. A
   `<div class="grid-3">` becomes meaningless noise in markdown.
