# Unified Overlay Model with Invoker Commands API

## Goal

Enable declarative popovers, modals, and toasts via HTML + CSS with zero JS.
The existing `OverlayService` programmatic API remains unchanged for dynamic
content and complex workflows. `dismissAll()` is DOM-aware — closes both
programmatic and declarative overlays. Consistent UI across all SPA modes.

## Rationale

emroute components are unified across SPA modes. The overlay system should work
(with limitations) in `spa: 'none'` where no JS is served, and fully in other
modes. The Invoker Commands API provides the declarative path for popovers and
modals; server-rendered HTML provides the declarative path for toasts. The
`OverlayService` provides the programmatic path. One system, two entry points,
same CSS.

## What Changed

### OverlayService

- `dismissAll()` now queries the DOM for `:popover-open` and `dialog[open]`
  in addition to closing its own programmatic overlays. Navigation cleanup
  covers both declarative and programmatic overlays.
- `popover()`, `modal()`, `closeModal()`, `closePopover()`, `toast()` —
  unchanged. Full programmatic API preserved.

### CSS (`overlay.css.ts`)

Existing styles already target `[data-overlay-popover]`,
`dialog[data-overlay-modal]`, and `[data-overlay-toast]`. These work
identically for both declarative elements in HTML and programmatic elements
created by the service.

Toast CSS uses `@keyframes` for auto-animate on load: fade in, hold, fade out,
`display: none`. No JS required — the element's presence in the DOM triggers
the animation.

### Declarative Popovers and Modals

`commandfor`/`command` + `popover`/`<dialog>` + `data-overlay-*` attributes:

```html
<button commandfor="menu" command="toggle-popover">Menu</button>
<div id="menu" popover data-overlay-popover>
  <a href="/html/profile">Profile</a>
</div>

<button commandfor="confirm" command="show-modal">Delete</button>
<dialog id="confirm" data-overlay-modal>
  <form method="dialog">
    <button value="cancel">Cancel</button>
    <button value="confirm">Confirm</button>
  </form>
</dialog>
```

### Declarative Toasts (Server-Rendered Flash Messages)

In `spa: 'none'`, form success → server redirect → server renders toast HTML
in the response. CSS auto-animates on page load. Same elements and styles as
`OverlayService.toast()` creates programmatically — consistent UI across modes.

```html
<!-- Server renders in response after form success -->
<div data-overlay-toast-container>
  <div data-overlay-toast>Saved successfully!</div>
</div>
```

Not popover-based (popovers escape their container via top layer promotion,
breaking flex stacking). Regular elements in a fixed container, animated by
CSS keyframes.

## Remaining Work

- Add toast auto-animate CSS keyframes to `overlay.css.ts` (fade in, hold,
  fade out, `display: none`)
- Add CSS anchor positioning rules for declarative popovers (implicit anchor
  from `commandfor` via `position-anchor: auto`)
- Add declarative overlay examples to test fixtures and documentation
- Verify `commandfor`/`command` attributes pass through SSR renderer unstripped

## Design Decisions

- **No auto-registration / MutationObserver**: the declarative path is pure
  CSS + HTML. The service does not watch the DOM. Enhancement is CSS, not JS.
- **`dismissAll()` queries DOM directly**: `:popover-open` and `dialog[open]`
  find all open overlays regardless of how they were triggered. No tracking.
- **`CommandEvent.source` is the anchor**: for declarative popovers, CSS
  `position-anchor: auto` uses the implicit anchor set by `commandfor`.
- **Toast is not popover-based**: popovers get promoted to the top layer,
  breaking container stacking. Declarative toasts are regular elements in a
  fixed container, animated by CSS keyframes on load. Programmatic toasts
  (`OverlayService.toast()`) create the same elements.
- **Declarative toast = flash message pattern**: server renders toast HTML
  after form success redirect. CSS handles the lifecycle. Same visual result
  as programmatic `overlay.toast()`.

## References

- ADR-0013: Invoker Commands API — Unified Overlay Model
- ADR-0006: Native APIs, Zero Dependencies
- [Invoker Commands API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Invoker_Commands_API)

## Resolution

**Resolved in 1.5.0.** ADR-0013 accepted. `OverlayService.dismissAll()` queries
`:popover-open` and `dialog[open]` for DOM-aware cleanup. CSS supports declarative
`[data-overlay-popover]`, `dialog[data-overlay-modal]`, `[data-overlay-toast]`.
Toast auto-animation via `@keyframes overlay-toast-auto`. `position-anchor: auto`
for declarative popover positioning.
