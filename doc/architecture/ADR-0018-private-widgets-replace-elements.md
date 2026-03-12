# ADR-0018: Private Widgets Replace Elements

**Status**: Proposed
**Date**: 2026-03-11
**Decision Makers**: Development Team

## Context

ADR-0005 established that Widget extends Component — same pipeline, same
rendering, same hydration. The only difference is audience: developers vs
content authors.

In practice, the `elements/` directory drifted from this intent. Elements
became plain `HTMLElement` subclasses with no rendering contract — no
`getData`, `renderHTML`, `renderMarkdown`, no `hydrate()`. This means:

- Any page using an element renders a hole in `/html/` and `/md/`. Triple
  rendering breaks the moment a developer reaches for interactivity.
- In `none` mode (no JS), elements render nothing at all. In practice,
  no-JS browser environments are practically non-existent — `/md/` is the
  true no-JS content path, and by definition it requires no custom HTML
  elements. In `/html/`, parent widgets can provide SSR markup around
  elements, and CSS (global or via class attributes) can style the gap —
  HTML is ultimately a richer presentation of the same markdown content.
- Developers who need SSR + hydration are forced to create a Widget, even when
  their component is an internal implementation detail not meant for CMS
  end-users.
- A plain `HTMLElement` does not require a framework. If that's all elements
  offer, the `elements/` convention adds no value beyond auto-registration.
- Many element use cases (canvas, audio, video) are inherently non-textual
  and have no meaningful SSR or markdown representation anyway.

## Decision

Developers who need SSR + hydration place their component in `widgets/` and
set `private = true` on the class. Private widgets are excluded from CMS
enumeration but share the full rendering pipeline.

```ts
class PriceChart extends WidgetComponent {
  override readonly name = 'price-chart';
  override readonly private = true;
  // getData, renderHTML, renderMarkdown, hydrate — all work
}
```

- `private` is an optional boolean on `WidgetComponent`, defaulting to `false`.
- Discovery writes it into `WidgetManifestEntry`.
- CMS tools (emkoma etc.) filter out entries where `private: true`.
- SSR pipeline, `ComponentElement`, `<widget-*>` prefix, `loadWidget()` — all
  unchanged. Private widgets are widgets.

The `elements/` directory remains for plain `HTMLElement` custom elements —
auto-discovered and registered in the browser for `root`/`only` modes. No
rendering contract, no SSR. This is the escape hatch for third-party web
components or truly client-only UI that does not participate in triple
rendering. A browser will still render unhydrated custom elements (with a
flash of unstyled content), so elements nested inside widgets can be made
viable — but the element itself has no SSR story.

## Consequences

### Positive

- **Triple rendering preserved**: Developer components SSR in `/html/`, `/md/`,
  and `/app/`. No holes in `none` mode.
- **One pipeline**: No parallel element resolution. Same manifest, same
  resolver, same `<widget-*>` prefix, same `ComponentElement`.
- **Clean audience split**: `private: false` (default) = CMS-listed for
  end-users. `private: true` = developer-only, hidden from CMS.
- **No new concepts**: No `kind`, no element-specific base class, no second
  tag prefix. Just a boolean.

### Negative

- **Developer widgets use `widget-` prefix**: `<widget-price-chart>` for an
  internal component. Acceptable if the mental model is Flutter-style
  "everything is a widget."
- **`elements/` is diminished**: Now only for plain custom elements that opt
  out of SSR. The valuable developer path is `widgets/` with `private: true`.

### Neutral

- `WidgetManifestEntry` gains an optional `private` field. Existing manifests
  without it default to public.
- `elements/` discovery and browser registration unchanged.

## References

- ADR-0005: Unified Component-Widget Model
- Code: `core/component/widget.component.ts` — WidgetComponent base
- Code: `core/pipeline/pipeline.ts` — `loadWidget()` reads widgets manifest

## Notes

### Alternatives Considered

1. **Elements extend Component with separate pipeline**: Full SSR for elements
   via parallel `resolveElementTags()`, separate manifest, `loadElement()`.
   Rejected — duplicates the widget pipeline for no behavioral difference.

2. **`kind: 'element'` field**: Distinguishes widget vs element in the
   manifest. Rejected — `kind` implies a behavioral difference that doesn't
   exist. The difference is purely visibility.

3. **Separate `c-` tag prefix for developer components** (original ADR-0005
   design): Two prefixes, two regex patterns. Rejected — one prefix is simpler,
   and the Flutter "everything is a widget" mental model makes `widget-`
   natural for all components.
