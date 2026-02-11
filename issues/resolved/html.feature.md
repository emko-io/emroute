# Modern HTML Features for Widgets

Now that widgets have `this.element` (1.3.0), these native APIs become directly
usable without framework abstractions.

## CSS `@scope` — Scoped Styles Without Shadow DOM [IMPLEMENTED in 1.3.2]

Built into `WidgetComponent.renderHTML()` — companion `.widget.css` files are
automatically wrapped in `@scope (widget-{name}) { ... }`. `scopeWidgetCss()`
utility exported for custom overrides. See `doc/guide.md` "Widget Files" section.

**Resolution:** `scopeWidgetCss()` added to `html.util.ts` and called in
`widget.component.ts` `renderHTML()`. Exported from public API for custom use.
Widget CSS is scoped at render time — no Shadow DOM, no class prefixes.

## Popover API — Native Portals [OPEN]

`popover` attribute escapes overflow clipping and z-index stacking without moving
the element in the DOM:

```html
<button popovertarget="details">Info</button>
<div id="details" popover>Content here</div>
```

Imperative control via `this.element.querySelector('[popover]')?.showPopover()`.
No z-index wars, no body-appended divs. Browser handles the top layer.

**Status:** Deferred. Will be a router-level feature with an API for widgets
to call, not a widget-level concern.

## View Transitions API — Animated State Changes [IMPLEMENTED in 1.3.3]

Built into `SpaHtmlRouter` — route changes are wrapped in
`document.startViewTransition()` for animated cross-fades. Per-widget view
transitions (e.g. counter value changes) are still up to widget authors via
`this.element`. See `doc/guide.md` "SPA Router" section.

**Resolution:** `handleNavigation()` in `html.renderer.ts` wraps `renderPage()`
in `document.startViewTransition()` when available. Progressive enhancement —
no option needed. Abort signal calls `skipTransition()` on navigation cancel.
Customize or disable via `::view-transition-*` CSS pseudo-elements.

## IntersectionObserver — Lazy Widgets [IMPLEMENTED in 1.3.1]

Built into `ComponentElement` via the `lazy` attribute:
`<widget-foo lazy>` defers `loadData()` until the element enters the viewport.
See `doc/guide.md` "Lazy Loading" section.

**Resolution:** `IntersectionObserver` added to `component.element.ts`. The
`lazy` attribute is parsed in `connectedCallback()` — observer defers
`loadData()` until the element is visible, then disconnects. SSR-hydrated
widgets skip `loadData` regardless. Observer cleaned up in `disconnectedCallback()`.

## `content-visibility: auto` — Native Virtualization [IMPLEMENTED in 1.3.2]

Built into `ComponentElement` — all widget elements get
`content-visibility: auto` by default. Off-screen widgets skip layout and paint.
Users can override per-widget with CSS. See `doc/guide.md` "Widget Files" section.

**Resolution:** Single line in `connectedCallback()`:
`this.style.contentVisibility = 'auto'`. Zero JS overhead — the browser handles
all rendering optimization. Users override per-widget with CSS if needed.

## Form-Associated Custom Elements [OPEN]

`ElementInternals` lets a widget be a real form field — validation, submission,
reset, all native:

```ts
static formAssociated = true;
internals = this.attachInternals();

// Widget can then:
this.internals.setFormValue(value);
this.internals.setValidity({ valueMissing: true }, 'Required');
```

A `<widget-color-picker>` inside a `<form>` just works with `FormData`,
`:invalid` CSS, and `form.reportValidity()`.

**Status:** Open. Left to widget authors — `this.element` already provides
access to `attachInternals()`. May become first-class if patterns emerge.

## `scheduler.postTask()` — Priority Scheduling [OPEN]

Priority-based task scheduling for widget data fetching:

```ts
override getData({ params }: this['DataArgs']) {
  return scheduler.postTask(
    () => this.expensiveComputation(params),
    { priority: 'background' }
  );
}
```

Low-priority widgets yield to user interactions. High-priority ones go first.

**Status:** Open. Left to widget authors — usable directly in `getData()`.
No framework integration needed.

## Open Questions

- ~~Which of these should be first-class in emroute (built into ComponentElement)
  vs. left to widget authors?~~ Resolved: lazy loading, content-visibility,
  @scope, and view transitions are first-class. Form-associated elements and
  scheduler are left to widget authors.
- ~~Should `IntersectionObserver`-based lazy loading be an opt-in flag on widgets
  (e.g. `lazy: true`)?~~ Done — `lazy` attribute on widget tags (1.3.1).
- ~~Should `content-visibility: auto` be applied by default to all widget elements?~~
  Done — default on all widget elements (1.3.2).
- ~~Should `@scope` be injected automatically for widget companion CSS files?~~
  Done — auto-injected for companion CSS (1.3.2).
- Should Popover API be a router-level feature? Yes — deferred for future work.
