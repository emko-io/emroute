# ADR-0005: Unified Component-Widget Model

**Status**: Accepted
**Date**: 2026-02-07
**Decision Makers**: Development Team

## Context

The project originally had two separate systems for custom elements:

- **Component** with `ComponentElement` — for developer-built interactive elements.
- **WidgetDefinition** (plain object interface) with `WidgetElement` — for content-author-facing widgets embedded in Markdown/HTML.

These had identical runtime behavior: same data fetching, same SSR hydration, same
rendering pipeline. The duplication created maintenance burden and conceptual confusion.
A widget IS a component published for content authors. Two custom element implementations,
two data-fetching patterns, two sets of lifecycle hooks — all doing the same thing.

## Decision

Widget extends Component. No behavioral difference at runtime — same interface, same
Promise-based data state, same rendering pipeline, same AbortSignal lifecycle. The only
difference is audience and tag prefix.

**Component** is the base class:

- Abstract class with `getData({ params, signal? })`, `renderMarkdown({ data, params })`,
  `renderHTML({ data, params })`.
- Custom element tag prefix: `c-`.
- Developer vocabulary: "I built a component."

**Widget** extends Component:

- `static readonly tagPrefix = 'widget'`.
- Custom element tag prefix: `widget-`.
- Content author vocabulary: "I added a widget."

**PageComponent** extends Component for route pages. Params come from the URL,
context carries file content.

**ComponentElement** is the single custom element class for both. It reads
`component.constructor.tagPrefix` to determine the tag name during registration.
AbortController created on `connectedCallback`, aborted on `disconnectedCallback`.
Signal forwarded to `getData()` via the args object (`{ params, signal }`). `dataPromise` exposed for
external consumers.

## Consequences

### Positive

- **One class hierarchy, one custom element, one rendering pipeline**: No parallel
  implementations to keep in sync.
- **Widget inherits all Component capabilities**: AbortSignal, `dataPromise`, and all
  future Component improvements come for free.
- **Two vocabularies, one thing**: Content authors see `widget-name` in markup,
  developers see Component in code. Same runtime behavior, different audience framing.
- **Extension point preserved**: If Widget needs to diverge later, it already extends
  Component and can override.

### Negative

- **Semantic-only distinction**: Slightly less obvious what makes a Widget different
  from a Component — the answer is purely naming and audience convention.
- **Migration cost**: Existing widget authors must convert from plain objects
  (`WidgetDefinition`) to classes extending Widget.

### Neutral

- `WidgetDefinition` interface removed. `ParsedWidgetBlock`, `WidgetManifestEntry`,
  and `WidgetsManifest` kept — these are parsing and build types, not runtime.

## References

- Code: `emroute/src/abstract.component.ts` — Component, PageComponent,
  PageContext
- Code: `emroute/src/widget.component.ts` — Widget extends Component
- Code: `emroute/src/component.element.ts` — unified ComponentElement with
  AbortSignal
- Doc: `emroute/COMPONENT_ARCHITECTURE.md` — "Revised: Component vs Widget"
  section

## Notes

### Alternatives Considered

1. **Keep both systems**: `WidgetDefinition` as plain object, Component as class.
   Duplicates behavior, diverges over time, two custom element implementations
   to maintain.

2. **Merge into one class with no subclass**: Lose the `widget-` tag prefix
   convention. Content authors and developers see the same `c-` prefix, losing the
   vocabulary distinction.

3. **Widget as a composition wrapper**: Widget wraps a Component instance rather
   than extending. Adds indirection without behavioral benefit.
