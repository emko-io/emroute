/**
 * Overlay Default CSS
 *
 * Injects default styles for modals, toasts, and popovers.
 * Uses CSS custom properties for theming. Consumers override
 * properties in their own stylesheets.
 */

export const overlayCSS: string = /* css */ `
:root {
  --overlay-backdrop: oklch(0% 0 0 / 0.5);
  --overlay-surface: oklch(100% 0 0);
  --overlay-radius: 8px;
  --overlay-shadow: 0 8px 32px oklch(0% 0 0 / 0.2);
  --overlay-toast-gap: 8px;
  --overlay-z: 1000;
}

/* --- Modal (dialog) --- */

dialog[data-overlay-modal] {
  border: none;
  padding: 0;
  background: var(--overlay-surface);
  border-radius: var(--overlay-radius);
  box-shadow: var(--overlay-shadow);
  max-width: min(90vw, 560px);
  max-height: 85vh;
  overflow: auto;
  opacity: 1;
  translate: 0 0;
  transition:
    opacity 200ms,
    translate 200ms;
}

dialog[data-overlay-modal][open] {
  transition:
    opacity 200ms,
    translate 200ms,
    display 200ms allow-discrete,
    overlay 200ms allow-discrete;

  @starting-style {
    opacity: 0;
    translate: 0 20px;
  }
}

dialog[data-overlay-modal]::backdrop {
  background: var(--overlay-backdrop);
  opacity: 1;
  transition: opacity 200ms;
}

dialog[data-overlay-modal][open]::backdrop {
  transition:
    opacity 200ms,
    display 200ms allow-discrete,
    overlay 200ms allow-discrete;

  @starting-style {
    opacity: 0;
  }
}

dialog[data-overlay-modal][data-dismissing] {
  opacity: 0;
  translate: 0 20px;
}

dialog[data-overlay-modal][data-dismissing]::backdrop {
  opacity: 0;
}

/* --- Toast container --- */

[data-overlay-toast-container] {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: var(--overlay-z);
  display: flex;
  flex-direction: column;
  gap: var(--overlay-toast-gap);
  pointer-events: none;
}

/* --- Toast item --- */

[data-overlay-toast] {
  pointer-events: auto;
  background: var(--overlay-surface);
  border-radius: var(--overlay-radius);
  box-shadow: var(--overlay-shadow);
  padding: 12px 16px;
  opacity: 1;
  translate: 0 0;
  transition:
    opacity 200ms,
    translate 200ms;

  @starting-style {
    opacity: 0;
    translate: 20px 0;
  }
}

[data-overlay-toast][data-dismissing] {
  opacity: 0;
  translate: 20px 0;
}

/* --- Popover --- */

[data-overlay-popover] {
  border: none;
  padding: 0;
  margin: 0;
  background: var(--overlay-surface);
  border-radius: var(--overlay-radius);
  box-shadow: var(--overlay-shadow);
  opacity: 1;
  scale: 1;
  transition:
    opacity 200ms,
    scale 200ms;
}

[data-overlay-popover]:popover-open {
  transition:
    opacity 200ms,
    scale 200ms,
    display 200ms allow-discrete,
    overlay 200ms allow-discrete;

  @starting-style {
    opacity: 0;
    scale: 0.95;
  }
}

[data-overlay-popover][data-dismissing] {
  opacity: 0;
  scale: 0.95;
}
`;
