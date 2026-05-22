# ADR-0011 · Light DOM + Server-Side Widgets

**Status**: Accepted

All components render into light DOM — no Shadow DOM by default. SSR
resolves widgets server-side by calling their `getData()` and render
methods inline. The browser detects `data-ssr` and adopts the existing
DOM instead of re-rendering.

## Why

This decision quietly solves three problems at once:

1. **`/md/` widgets work.** Markdown can't host shadow trees, but it
   can host fully-rendered HTML.
2. **Global CSS cascades normally.** No shadow boundary means consumer
   styles apply everywhere they always did.
3. **No double render.** SSR output becomes the hydrated DOM directly.

The cost is encapsulation — widgets can be styled from outside. But
that's a feature for documentation widgets, theming, and CMS-driven
sites, where consumers *expect* to restyle embedded components.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0011-light-dom-server-side-widget-rendering.md)
