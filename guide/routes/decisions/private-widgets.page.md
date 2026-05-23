# ADR-0018 · Private Widgets Replace Elements

**Status**: Accepted

Developer-only components live in `widgets/` with `private: true` on
the class. They're hidden from CMS enumeration but share the full
widget pipeline (SSR, hydration, markdown rendering, lifecycle).

`elements/` shrinks to a small escape hatch for plain `HTMLElement`
custom elements with no SSR contract.

## Why

`elements/` originally existed for "developer-only" custom elements,
but it drifted from the unified component model (ADR-0005). Elements
had no `renderHTML`, no `renderMarkdown`, no `hydrate()` — which left
holes in `/html/` and `/md/` output any time someone reached for them.

A boolean flag on the widget class is simpler than two parallel
pipelines. CMS-listed vs. developer-only is one bit of metadata, not a
different file extension.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0018-private-widgets-replace-elements.md)
