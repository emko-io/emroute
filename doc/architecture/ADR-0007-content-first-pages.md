# ADR-0007: Content-First Pages

**Status**: Accepted
**Date**: 2026-02-07
**Decision Makers**: Development Team

## Context

Most routers require a component (React component, Solid component, Lit element)
for every route. Even a static "About" page needs a JavaScript file that imports
the framework and returns markup. This creates unnecessary boilerplate for
content-heavy sites.

emroute was designed for sites where most pages are content (documentation,
blogs, marketing pages) with occasional interactive widgets. The common case —
display this markdown/HTML — should require zero JavaScript.

## Decision

A page can be just a `.page.md` or `.page.html` file with no JavaScript. The
router provides a `DefaultPageComponent` that renders file content automatically
using a fallback chain.

The router loads file content before calling the component. The component receives
it via `PageContext.files: { html?: string; md?: string }`. The component never
fetches its own files — the router does that once, passes the context, and the
component decides how to use it.

When no `.page.ts` overrides render methods, `DefaultPageComponent` applies these
defaults:

| Files present   | `renderHTML()`                         | `renderMarkdown()`        |
| --------------- | -------------------------------------- | ------------------------- |
| `.html` + `.md` | HTML file content                      | Markdown file content     |
| `.html` only    | HTML file content                      | `router-slot` placeholder |
| `.md` only      | `<mark-down>` wrapping markdown + slot | Markdown file content     |
| Neither         | Bare `<router-slot>`                   | `router-slot` placeholder |

A `.page.ts` file is only needed when a page has:

- Custom data fetching (override `getData`)
- Custom rendering logic (override `renderHTML` or `renderMarkdown`)
- Dynamic behavior beyond static content

## Consequences

### Positive

- **Zero JS for static pages**: Content authors can create pages without writing
  any code. No JS overhead for pure content.
- **Incremental upgrade**: File precedence (`.ts` > `.html` > `.md`) lets pages
  graduate from static to dynamic incrementally. Start with a markdown file, add
  HTML for layout, add TypeScript when you need logic.
- **Minimal overrides**: The fallback chain means components only override what
  they need. A component that overrides `renderHTML` still gets the default
  `renderMarkdown` for free.
- **Pure components**: `PageContext` keeps components testable — no filesystem
  access in render methods. The router owns file loading, the component owns
  rendering.

### Negative

- **Implicit behavior**: Understanding what `DefaultPageComponent` does requires
  knowing the fallback chain. A new developer seeing only `about.page.md` won't
  immediately know how it gets rendered.
- **Three file types per route**: A route can have `.ts`, `.html`, and `.md` files.
  Which takes precedence and how they interact isn't obvious without reading the
  documentation.

### Neutral

- Markdown rendering depends on a pluggable `MarkdownRenderer` — content-first
  works, but markdown-to-HTML conversion requires a parser to be configured.

## References

- Code: `emroute/src/abstract.component.ts` — PageComponent fallback chain
- Code: `emroute/src/page.component.ts` — DefaultPageComponent
- Code: `emroute/src/route.core.ts` — file loading into PageContext
- Doc: `emroute/doc/architecture.md` — "The Fallback Chain" section
- Example: `vanilla-app/routes/about.page.md` — content-only page
- Example: `vanilla-app/routes/crypto/eth.page.md` — child page with just markdown

## Notes

### Alternatives Considered

1. **Require `.page.ts` for all routes**: Explicit but verbose. Every static page
   needs boilerplate `export default class extends PageComponent { ... }`. For a
   documentation site with 50 pages, that's 50 identical TypeScript files that do
   nothing but exist.

2. **Convention-only (no DefaultPageComponent)**: The router injects file content
   directly without a component. Loses the component interface — no `getData`, no
   `validateParams`, no `renderError`. Components that want to override one method
   can't fall back to defaults for the rest.

3. **Frontmatter in markdown**: Embed metadata (title, layout, data) in YAML
   frontmatter. Adds a parsing dependency and mixes concerns. Page metadata
   belongs in the component or file conventions, not in the content.
