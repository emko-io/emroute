# ADR-0011: Light DOM with Server-Side Widget Rendering

**Status**: Accepted
**Date**: 2025-02-08

## Context

Three open design questions were interconnected:

1. **Shadow DOM encapsulation** — should components use Shadow DOM for style
   isolation?
2. **CSS strategy** — how should component styles be delivered and scoped?
3. **SSR widget rendering + hydration** — how should widgets render server-side
   and how does the SPA adopt SSR content?

The key insight: if SSR replaces widget tags with their rendered output (calling
getData() + renderHTML()/renderMarkdown() server-side), the content lives in
light DOM. This kills the Shadow DOM option — there is no shadow root to attach
to. And it solves all three problems at once.

## Decision

**Light DOM rendering with server-side widget resolution.**

Components (pages and widgets) render into light DOM. SSR renderers resolve
widgets by calling getData() and renderHTML()/renderMarkdown() server-side,
producing fully rendered output. No Shadow DOM.

### How it works per context

**SSR Markdown** (`/md/`): fenced `widget:name` block is replaced with
`renderMarkdown()` output as plain text. No HTML tag, no wrapper. This is final
output — /md/ routes have zero client-side JS.

**SSR HTML** (`/html/`): `<widget-name>` tags are filled with rendered content:

```html
<widget-crypto-price coin="bitcoin" data-ssr='{"price":42000}'>
  <span>$42,000</span>
</widget-crypto-price>
```

The tag stays as a hydration anchor. Content is rendered inside it (light DOM).
`data-ssr` carries the serialized data for client-side adoption.

**SPA hydration**: custom element registers, `connectedCallback()` fires, sees
`data-ssr` → skips getData() and render(), adopts existing innerHTML. Widget is
now live for interactions (reload, events, re-fetch).

### CSS scoping

Without Shadow DOM, styles are scoped by convention:

- Custom element tag names are natural scope boundaries:
  `widget-crypto-price { }` only targets that widget
- `.page.css` files alongside `.page.ts` for route-specific styles
- Per-route CSS composition: server collects CSS for the rendered route hierarchy
- Global styles (typography, theming, resets) cascade into components naturally
- Container queries recommended for responsive widgets

### Two component modes

ComponentElement operates in two modes:

1. **Hydrate from SSR**: `data-ssr` present → skip getData + render, adopt DOM
2. **Render from scratch**: no `data-ssr` → full getData + render (SPA
   navigation, pure SPA, dynamically added components)

Both coexist. Initial load from /html/* uses mode 1. Subsequent SPA navigation
or pure SPA loads use mode 2.

## Consequences

### Positive

- SSR produces complete content for both HTML and Markdown contexts
- /md/ routes (zero JS) get fully rendered widgets
- Global CSS cascades naturally — theming, typography, resets all work
- No Declarative Shadow DOM complexity for SSR
- Hydration is simple: detect attribute, skip render, adopt DOM
- Custom element tag names provide natural CSS scoping
- Self-contained: widget data travels with the element via data-ssr attribute

### Negative

- No browser-enforced style encapsulation (convention-based only)
- Component styles can technically leak (mitigated by unique tag names)

### Neutral

- Requires a server-side widget registry so SSR renderers can resolve widgets
- Built-in and user widgets must be discoverable at server startup

## References

- Issues: `issues/shadow-dom-encapsulation.design.md`,
  `issues/css-strategy.design.md`, `issues/ssr-spa-double-render.issue.md`
- Code: `src/element/component.element.ts` (hydration), `src/util/html.util.ts`
  (processFencedWidgets), `src/renderer/ssr/html.renderer.ts`,
  `src/renderer/ssr/md.renderer.ts`
- Related: ADR-0009 (no inline script activation), ADR-0010 (raw attributes)
