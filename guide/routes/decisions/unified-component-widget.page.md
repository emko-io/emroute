# ADR-0005 · Unified Component Model

**Status**: Accepted

`Widget extends Component`. One class hierarchy, one custom element
implementation, one rendering pipeline. A widget *is* a component —
published with a different audience and tag prefix (`widget-`).

## Why

The original design had two parallel systems: `Component` for pages and
`WidgetDefinition` for embeddable units. At runtime they did the same
thing — fetch data, render HTML, hydrate in the browser — but the code
paths were duplicated.

Pages and widgets are different in *who picks them* (developers vs.
content authors) and *where they appear* (routes vs. embeds), not in
how they work. Collapsing the implementation made adding new component
kinds (private widgets, elements) a matter of flipping a flag rather
than building new pipelines.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0005-unified-component-widget-model.md)
