# ADR-0020: Browser API Adoption Plan

**Status**: Proposed
**Date**: 2026-03-15

## Context

emroute targets modern browsers (same baseline as `@scope`, `adoptedStyleSheets`,
Popover API). Several newer browser APIs align naturally with the framework's
architecture — shadow DOM widgets, SPA routing, overlay service — and could
replace manual implementations or unlock new capabilities with minimal code.

This document tracks which APIs to adopt, how, and in what order.

## APIs

### Container queries — adopt now

**Priority**: High
**Baseline**: Widely available (Chrome 105, Firefox 110, Safari 16)

Widgets are natural containers. A `widget-card` in a sidebar should adapt to
its own width, not the viewport. Shadow DOM already creates a containment
context.

**Implementation**: Set `container-type: inline-size` on the host element in
`connectedCallback()`, alongside the existing `content-visibility: auto`.
Consumers get `@container` queries for free in their companion CSS:

```css
/* nav.widget.css */
@container (max-width: 600px) {
  .site-nav { flex-direction: column; }
}
```

emkoma and consumers already use containers as a default pattern. The framework
should make this automatic.

**Consideration**: `container-type: inline-size` prevents the element from using
its own content for inline size. This is correct for widgets (they fill their
parent), but if a widget needs intrinsic sizing, it would need to opt out.
A `no-container` attribute or class could handle this edge case.

---

### `:has()` + custom states — document

**Priority**: Medium (documentation only, no code changes)
**Baseline**: Widely available (Chrome 105, Firefox 121, Safari 15.4)

Combining `:has()` with the framework's custom states (`:state()`) enables
powerful layout-level styling from light DOM:

```css
/* Layout adapts when any child widget is loading */
.content:has(> widget-feed:state(loading)) {
  min-height: 400px;
}

/* Hide legend while chart has an error */
widget-chart:state(error) ~ .chart-legend {
  display: none;
}

/* Parent card highlights when its widget is ready */
.card:has(> widget-preview:state(ready)) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
```

No framework changes needed — this works today. Add examples to the styling
documentation.

---

### `AbortSignal.timeout()` — adopt

**Priority**: Medium
**Baseline**: Widely available (Chrome 103, Firefox 100, Safari 16)

Widgets already receive an `AbortSignal` in `getData()`. Adding a `timeout`
attribute lets consumers cap data fetches declaratively:

```html
<widget-feed timeout="5000"></widget-feed>
```

**Implementation**: In `ComponentElement`, compose the existing abort signal
with a timeout signal:

```ts
const timeout = this.getAttribute('timeout');
const signals = [this.abortController.signal];
if (timeout) signals.push(AbortSignal.timeout(Number(timeout)));
const signal = AbortSignal.any(signals);
```

Requires `AbortSignal.any()` (Chrome 124, Firefox 124, Safari 17.4).

---

### CSS anchor positioning — evaluate

**Priority**: Low
**Baseline**: Chrome 125, Firefox 131, Safari 18

The overlay service currently uses JavaScript for popover positioning relative
to trigger elements. CSS anchor positioning (`anchor-name`, `position-anchor`,
`position-area`) could replace this:

```css
.trigger {
  anchor-name: --my-trigger;
}

[data-overlay-popover] {
  position-anchor: --my-trigger;
  position-area: block-end span-inline-end;
}
```

**Consideration**: The overlay service already works and handles edge cases
(viewport overflow, stacking, animations). Anchor positioning simplifies the
common case but may not cover all scenarios. Evaluate when the overlay service
next needs changes.

---

### `CloseWatcher` — adopt

**Priority**: Medium
**Baseline**: Chrome 120, Firefox 132, Safari 18.2

Unified close signal for escape key and Android back button. The overlay
service likely handles escape via `keydown` listener — `CloseWatcher` provides
this plus platform back navigation:

```ts
const watcher = new CloseWatcher();
watcher.onclose = () => overlay.dismiss();
```

Replaces manual `keydown` listeners. Gives Android users back-button dismissal
for free.

---

### Container queries in SSR — investigate

**Priority**: Low

`container-type` on the host element is set by JavaScript in
`connectedCallback()`. In `none` mode (no JS), the container type is not set
and `@container` queries in companion CSS won't activate.

Options:
1. Accept this — `none` mode is SSR-only, responsive design via `@media` works.
2. Inject `container-type` as an inline style in the SSR HTML output.
3. Add a default rule in the SSR `<style>` tag: `:host { container-type: inline-size; }`.

Option 3 is cleanest — the `:host` rule lives inside shadow DOM and applies
the containment context from CSS alone.

## Decision

Adopt container queries as an immediate next step. Document `:has()` patterns.
Evaluate the others as opportunities arise.

## References

- Container queries: [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries)
- `:has()`: [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/:has)
- `AbortSignal.timeout()`: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)
- CSS anchor positioning: [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_anchor_positioning)
- `CloseWatcher`: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/CloseWatcher)
- Code: `src/element/component.element.ts`, `src/overlay/overlay.service.ts`
