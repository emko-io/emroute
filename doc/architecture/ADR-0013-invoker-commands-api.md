# ADR-0013: Invoker Commands API — Unified Overlay Model

**Status**: Accepted
**Date**: 2026-02-17
**Decision Makers**: Development Team

## Context

The current `OverlayService` provides a programmatic API for modals, toasts,
and popovers. Every overlay requires JavaScript — a widget with event listener
wiring. This works in SPA modes but is impossible in `spa: 'none'`.

The **Invoker Commands API** (`commandfor` / `command` attributes) lets buttons
declaratively trigger popovers and modals without JavaScript. The browser
handles triggering and fires native events (`beforetoggle`, `toggle`, `close`).

For a native web router (ADR-0006), this API is a natural fit. But requiring
all overlays to be declarative would limit developers who prefer or need
programmatic control.

## Decision

**One system, two entry points:**

1. **Declarative** (CSS + HTML attributes) — `commandfor`/`command` +
   `popover`/`<dialog>` + CSS styling via `data-overlay-*` attributes. Works in
   all modes including `spa: 'none'` with zero JS. The browser handles
   triggering, CSS handles positioning and animations.

2. **Programmatic** (`OverlayService`) — `popover()`, `modal()`, `toast()`,
   `closeModal()`, `closePopover()` for dynamic content, programmatic triggers,
   and complex workflows. Available when JS is loaded.

Both entry points produce the same visual result (same CSS). The service does
not duplicate the browser — it provides what declarative HTML cannot (dynamic
content, promises, toasts, anchor disconnect watching).

**`dismissAll()` is DOM-aware**: it closes both programmatic overlays managed by
the service AND declarative popovers/dialogs found via DOM queries
(`:popover-open`, `dialog[open]`). This means navigation cleanup works
regardless of how overlays were opened.

### Declarative Path (zero JS)

```html
<button commandfor="user-menu" command="toggle-popover">Menu</button>
<div id="user-menu" popover data-overlay-popover>
  <a href="/html/profile">Profile</a>
  <a href="/html/settings">Settings</a>
</div>

<button commandfor="confirm" command="show-modal">Delete</button>
<dialog id="confirm" data-overlay-modal>
  <form method="dialog">
    <p>Are you sure?</p>
    <button value="cancel">Cancel</button>
    <button value="confirm">Confirm</button>
  </form>
</dialog>
```

### Programmatic Path (OverlayService)

```ts
overlay.popover({
  anchor: button,
  render(el) {
    el.innerHTML = '<ul>...</ul>';
  },
});

const result = await overlay.modal({
  render(dialog) {
    dialog.innerHTML = '<form>...</form>';
  },
});
```

### Navigation Cleanup

```ts
router.addEventListener((e) => {
  if (e.type === 'navigate') overlay.dismissAll();
});
// Closes all open popovers (programmatic + declarative) and dialogs
```

## Consequences

### Positive

- `spa: 'none'` gains popover and modal capabilities with zero JS
- Aligns with ADR-0006 (native APIs, zero dependencies)
- Built-in accessibility for declarative trigger→target relationships
- Programmatic API unchanged — no migration cost for existing code
- `dismissAll()` covers both worlds via DOM queries
- `<form method="dialog">` provides native modal return values

### Negative

- Declarative popovers need content in the DOM upfront (not lazily rendered)
- Developers must learn `commandfor`/`command` for the declarative path

### Neutral

- Toast remains purely imperative — no native trigger equivalent
- CSS (anchor positioning, animations) serves both paths identically
- `OverlayService` API surface unchanged

## References

- Code: `src/overlay/overlay.service.ts`
- Code: `src/overlay/overlay.type.ts`
- Related: ADR-0006 (Native APIs, Zero Dependencies)
- External: [Invoker Commands API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Invoker_Commands_API)
