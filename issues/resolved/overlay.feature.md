# Overlay Service

Centralized overlay service for modals, toasts, and popovers — built on native
platform APIs (`<dialog>`, `popover` attribute, CSS `anchor()`). Ships as a
standalone module with zero router or framework coupling.

## Overlay Types

| Type    | DOM element                    | Concurrency              | Dismissal                                      |
| ------- | ------------------------------ | ------------------------ | ---------------------------------------------- |
| Modal   | `<dialog>` (reused)            | One at a time, last wins | `.close()`, backdrop click, navigation         |
| Toast   | `<div>` per toast in container | Multiple stack           | Auto-dismiss after timeout, manual, navigation |
| Popover | `<div popover>` (reused)       | One at a time, last wins | Manual, anchor disconnect, navigation          |

### Modal

A single `<dialog>` element is created once and reused for every modal. Opening a
new modal while one is already visible closes the current one (last wins). The
dialog is opened via `showModal()`, which promotes it to the top layer and
provides a native `::backdrop`.

The `modal()` call returns a `Promise` backed by `Promise.withResolvers`. The
promise settles when the modal is closed — either with a value passed to
`close(value)` or `undefined` on backdrop click / navigation dismissal. This
lets callers `await` the result of a confirmation dialog or form.

```ts
const confirmed = await overlay.modal({
  render(dialog) {
    dialog.innerHTML = `<p>Delete?</p><button data-action="confirm">Yes</button>`;
    dialog.querySelector('[data-action="confirm"]')!
      .addEventListener('click', () => overlay.closeModal(true));
  },
});

if (confirmed) deleteItem();
```

Backdrop click calls `close()` (resolves with `undefined`). This is wired via
the `<dialog>` `click` event — checking `e.target === dialog` to detect the
backdrop hit.

### Toast

Each toast gets its own `<div>` appended to a persistent container element. The
container uses a CSS flex column to stack toasts. Multiple toasts coexist;
new ones are appended at the end (bottom of the stack by default, configurable
via CSS).

Auto-dismiss is handled by `setTimeout`. The timeout duration has a sensible
default (e.g. 5000ms) but can be overridden per toast. Setting timeout to `0`
disables auto-dismiss. Each toast can also be dismissed manually via a returned
`dismiss` function.

```ts
const { dismiss } = overlay.toast({
  render(el) {
    el.textContent = 'Item saved';
  },
  timeout: 3000,
});

// or dismiss early
dismiss();
```

Exit animations are handled via CSS — the service adds a `data-dismissing`
attribute before removing the element, giving CSS time to animate via
`transition-behavior: allow-discrete`.

### Popover

A single `<div popover>` element is reused. Opening a new popover closes the
previous one (last wins). The element is shown via the `showPopover()` method
and positioned relative to an anchor element.

Positioning uses CSS `anchor()` when supported, with a `getBoundingClientRect`
fallback that sets `top`/`left` inline styles. Anchor support is detected once
via `CSS.supports('anchor-name', '--a')`.

```ts
overlay.popover({
  anchor: buttonElement,
  render(el) {
    el.innerHTML = '<ul><li>Edit</li><li>Delete</li></ul>';
  },
});
```

When the anchor element disconnects from the DOM (e.g. navigation), the popover
is dismissed. This is detected via a `MutationObserver` on the anchor's parent
or via `document.contains(anchor)` checked at dismiss points.

## API

```ts
interface OverlayService {
  modal<T = undefined>(options: ModalOptions<T>): Promise<T | undefined>;
  closeModal<T>(value?: T): void;

  toast(options: ToastOptions): { dismiss(): void };

  popover(options: PopoverOptions): void;
  closePopover(): void;

  dismissAll(): void;
}

interface ModalOptions<T = undefined> {
  render(dialog: HTMLDialogElement): void;
  onClose?(): void;
}

interface ToastOptions {
  render(el: HTMLDivElement): void;
  timeout?: number; // ms, default 5000, 0 = no auto-dismiss
}

interface PopoverOptions {
  anchor: HTMLElement;
  render(el: HTMLDivElement): void;
}
```

### `dismissAll()`

Closes the active modal (resolves with `undefined`), removes all toasts, and
hides the popover. Intended as the single hook for navigation-driven cleanup.

## Factory

```ts
function createOverlayService(): OverlayService;
```

Not a class, not a singleton. Returns a plain object with the methods above.
Internally creates and manages the DOM elements (dialog, toast container,
popover div). Elements are lazily created on first use and appended to
`document.body`.

The consumer owns the instance and passes it into the component tree via
`extendContext`:

```ts
const overlay = createOverlayService();

const router = await createSpaHtmlRouter(manifest, {
  extendContext: (base) => ({ ...base, overlay }),
});
```

Components access the service through context:

```ts
// in app code
declare module '@emkodev/emroute' {
  interface ComponentContext {
    overlay: OverlayService;
  }
}

// in a widget
class DeleteButton extends WidgetComponent {
  async onDelete() {
    const confirmed = await this.context.overlay.modal({ ... });
  }
}
```

## Navigation Dismissal

The overlay service has zero knowledge of the router. The consumer wires
dismissal in their app setup code:

```ts
router.addEventListener('navigate', () => overlay.dismissAll());
```

This keeps the service fully decoupled from routing. If the app doesn't use a
router, overlays still work — they just don't auto-dismiss on navigation.

## Animations

Entry and exit animations use native CSS transitions with `@starting-style`
and `transition-behavior: allow-discrete` — no JavaScript animation logic.

```css
dialog[open] {
  opacity: 1;
  translate: 0 0;
  transition: opacity 200ms, translate 200ms, display 200ms allow-discrete;

  @starting-style {
    opacity: 0;
    translate: 0 20px;
  }
}
```

For exit, the `data-dismissing` attribute is set before closing. A
`transitionend` listener performs the actual removal/close after the animation
completes.

Toast and popover elements follow the same `@starting-style` pattern.

## Styling

The service injects a default CSS string (from `overlay.css.ts`) into a
`<style>` element on first use. The CSS uses custom properties for theming:

```css
:root {
  --overlay-backdrop: oklch(0% 0 0 / 0.5);
  --overlay-surface: oklch(100% 0 0);
  --overlay-radius: 8px;
  --overlay-shadow: 0 8px 32px oklch(0% 0 0 / 0.2);
  --overlay-toast-gap: 8px;
  --overlay-z: 1000;
}
```

Consumers override these properties in their own CSS. The dialog's `::backdrop`
pseudo-element is styled via `dialog::backdrop { background: var(--overlay-backdrop) }`.

## Files

```
src/overlay/
  overlay.type.ts       — OverlayService, ModalOptions, ToastOptions, PopoverOptions
  overlay.service.ts    — createOverlayService factory
  overlay.css.ts        — default CSS string constant
  mod.ts                — barrel export
```

Export added to `deno.json`:

```json
"./overlay": "./src/overlay/mod.ts"
```

## Open Questions

- Should `modal()` accept a CSS class or `data-*` attribute for per-modal
  styling variants, or is the `render` callback sufficient (consumer can set
  classes inside `render`)?
- Toast position (top-right, bottom-center, etc.) — configurable via factory
  options, or purely CSS?
- Should the popover support explicit placement hints (`top`, `bottom`, `left`,
  `right`) passed to the `popover()` call, or leave it entirely to CSS
  `anchor()` / `position-area`?
