# ADR-0013 · Invoker Commands API

**Status**: Accepted

Overlays (modals, popovers, toasts) work two ways:

- **Declarative, zero JS** — native `commandfor` + `command` attributes,
  `popover`, `<dialog>`. The browser handles open, close, focus, escape.
- **Programmatic** — `createOverlayService()` for cases that need to
  build content on the fly. Same DOM, same dismissal semantics.

`dismissAll()` is DOM-aware: it closes whatever's open, regardless of
which path created it.

## Why

The previous overlay service was JS-only, which broke `spa: 'none'`
sites — exactly the consumers most likely to want zero JS. The browser
already shipped a complete overlay model (Invoker, popovers, dialogs);
using it directly is more reliable, more accessible, and smaller than
re-implementing it.

The programmatic API stays because dynamic content (a modal with form
results, a toast triggered by a fetch) genuinely needs JavaScript. Both
paths end up in the same DOM with the same dismissal behavior.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0013-invoker-commands-api.md)
