# ADR-0006: Native APIs, Zero Dependencies

**Status**: Accepted
**Date**: 2026-02-07
**Decision Makers**: Development Team

## Context

Every major router is tied to a framework -- React Router to React, @solidjs/router
to Solid, @lit-labs/router to Lit. Even "minimal" routers like wouter depend on
framework primitives (hooks, components). emroute was designed to work without
any framework, using only APIs that browsers and server runtimes provide natively.

The router is ~500 lines across three renderers sharing a core. No virtual DOM, no
build-time JSX transform, no client-side state management, no hydration mismatch
problem.

## Decision

emroute uses exclusively native browser/runtime APIs with zero external
dependencies.

The APIs used:

- **URLPattern** for route matching (native in Deno, Chrome, Safari; polyfill-able
  for Node)
- **Custom Elements** (Web Components) for UI -- `<router-slot>`, `<mark-down>`,
  component/widget elements
- **History API** for navigation
- **AbortController/AbortSignal** for request cancellation
- **`fetch()`** for data loading (in components, not the router itself)
- **`innerHTML`** for SPA rendering, string concatenation for SSR
- **Template literals** for HTML generation (no JSX, no virtual DOM)

The markdown renderer is the one pluggable dependency -- the app provides its own
parser (marked, markdown-it, @emkodev/emko-md, etc.) via
`MarkdownElement.setRenderer()`. The router doesn't know or care what parses the
markdown.

## Consequences

### Positive

- **Zero bundle overhead from the router** -- only native APIs.
- **No framework lock-in** -- works with Deno, Node, Bun, any browser.
- **No version conflicts** with framework dependencies.
- **No hydration mismatch** -- SPA renders fresh, SSR serves complete HTML.
- **Smaller mental model** -- standard web APIs, nothing framework-specific to learn.

### Negative

- **No reactive state updates** -- components must manually re-render (call
  `reload()`, set innerHTML).
- **Custom Elements require class-based syntax** (no functional components, no hooks).
- **URLPattern needs a polyfill** in Node.js.
- **innerHTML has XSS risk** if not escaped (mitigated by escapeHtml utility).

### Neutral

- Markdown rendering is pluggable -- not zero-dependency in practice, but the choice
  is the app's, not the router's.

## References

- Code: `emroute/src/route.matcher.ts` -- URLPattern usage
- Code: `emroute/src/component.element.ts` -- Custom Elements + AbortController
- Code: `emroute/src/spa/html.renderer.ts` -- History API + innerHTML
- Code: `emroute/src/element/markdown.element.ts` -- pluggable MarkdownRenderer interface
- Doc: `emroute/doc/markdown-renderer.md` -- supported markdown parsers

## Notes

### Alternatives Considered

1. **Lit as base** -- provides reactive properties, shadow DOM, lifecycle management.
   Adds ~80KB dependency. Custom Elements are sufficient without Lit's abstractions.

2. **Preact/lightweight VDOM** -- enables functional components and JSX. Adds
   build-time transform, framework coupling, VDOM diffing overhead. innerHTML is
   simpler and sufficient.

3. **Signals for reactivity** -- frameworks like Solid use signals for fine-grained
   updates. Adds a reactive runtime. URL is the state; components re-render on
   navigation, not on reactive state changes.
