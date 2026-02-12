/**
 * Overlay Service
 *
 * Factory function that creates an OverlayService instance managing
 * modals (<dialog>), toasts (<div> stack), and popovers (<div popover>).
 * DOM elements are lazily created on first use and appended to document.body.
 */

import type { ModalOptions, OverlayService, PopoverOptions, ToastOptions } from './overlay.type.ts';
import { overlayCSS } from './overlay.css.ts';

const ANIMATION_SAFETY_TIMEOUT = 300;
const DEFAULT_TOAST_TIMEOUT = 5000;

/**
 * Animate an element out by setting `data-dismissing`, waiting for
 * `transitionend`, then calling the provided callback. Includes a
 * safety timeout in case the transition event never fires.
 */
function animateDismiss(el: HTMLElement, onDone: () => void): void {
  el.setAttribute('data-dismissing', '');

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onDone();
  };

  el.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, ANIMATION_SAFETY_TIMEOUT);
}

export function createOverlayService(): OverlayService {
  let styleInjected = false;

  // Modal state
  let dialog: HTMLDialogElement | null = null;
  // Uses `any` because modalResolve is reassigned across multiple modal() calls
  // with different type parameters T. Each call creates a Promise.withResolvers<T>(),
  // so the resolver function signature changes (accepts T | PromiseLike<T | undefined>).
  // Type safety is maintained by closeModal<T>(value?: T) which ensures only valid
  // types are passed to the resolver.
  // deno-lint-ignore no-explicit-any
  let modalResolve: ((value: any) => void) | null = null;
  let modalOnClose: (() => void) | undefined;

  // Toast state
  let toastContainer: HTMLDivElement | null = null;
  interface ToastEntry {
    el: HTMLDivElement;
    timerId: ReturnType<typeof setTimeout> | null;
  }
  const activeToasts = new Set<ToastEntry>();

  // Popover state
  let popoverEl: HTMLDivElement | null = null;
  let popoverAnchorObserver: MutationObserver | null = null;
  const supportsAnchor = typeof CSS !== 'undefined' &&
    CSS.supports('anchor-name', '--a');

  function injectCSS(): void {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement('style');
    style.textContent = overlayCSS;
    document.head.appendChild(style);
  }

  function ensureDialog(): HTMLDialogElement {
    if (dialog) return dialog;
    injectCSS();
    dialog = document.createElement('dialog');
    dialog.setAttribute('data-overlay-modal', '');
    document.body.appendChild(dialog);

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        closeModal(undefined);
      }
    });

    return dialog;
  }

  function ensureToastContainer(): HTMLDivElement {
    if (toastContainer) return toastContainer;
    injectCSS();
    toastContainer = document.createElement('div');
    toastContainer.setAttribute('data-overlay-toast-container', '');
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  function ensurePopover(): HTMLDivElement {
    if (popoverEl) return popoverEl;
    injectCSS();
    popoverEl = document.createElement('div');
    popoverEl.setAttribute('data-overlay-popover', '');
    popoverEl.setAttribute('popover', '');
    document.body.appendChild(popoverEl);
    return popoverEl;
  }

  // --- Modal ---

  function modal<T = undefined>(options: ModalOptions<T>): Promise<T | undefined> {
    const d = ensureDialog();

    // Clean up any lingering dismiss state from a previous close
    d.removeAttribute('data-dismissing');

    // Immediately dismiss popover — modal takes over the top layer
    hidePopoverImmediate();

    // Last wins: close current modal if open
    if (d.open) {
      d.close();
      if (modalResolve) {
        modalResolve(undefined);
        modalResolve = null;
      }
      if (modalOnClose) {
        modalOnClose();
        modalOnClose = undefined;
      }
    }

    d.innerHTML = '';
    options.render(d);
    modalOnClose = options.onClose;

    const { promise, resolve } = Promise.withResolvers<T | undefined>();
    modalResolve = resolve;

    d.showModal();

    return promise;
  }

  function closeModal<T>(value?: T): void {
    if (!dialog || !dialog.open) return;

    const resolve = modalResolve;
    const onClose = modalOnClose;
    const dialogRef = dialog;
    modalResolve = null;
    modalOnClose = undefined;

    animateDismiss(dialogRef, () => {
      if (dialogRef && dialogRef.open) {
        dialogRef.close();
        if (resolve) resolve(value);
        if (onClose) onClose();
      }
    });
  }

  // --- Toast ---

  function toast(options: ToastOptions): { dismiss(): void } {
    const container = ensureToastContainer();

    const el = document.createElement('div');
    el.setAttribute('data-overlay-toast', '');
    options.render(el);
    container.appendChild(el);

    const timeout = options.timeout ?? DEFAULT_TOAST_TIMEOUT;

    const entry: ToastEntry = { el, timerId: null };
    activeToasts.add(entry);

    const dismiss = () => {
      if (!activeToasts.has(entry)) return;
      activeToasts.delete(entry);
      if (entry.timerId) clearTimeout(entry.timerId);

      animateDismiss(el, () => {
        el.remove();
      });
    };

    if (timeout > 0) {
      entry.timerId = setTimeout(dismiss, timeout);
    }

    return { dismiss };
  }

  // --- Popover ---

  function popover(options: PopoverOptions): void {
    const el = ensurePopover();

    // Last wins: hide current popover if showing
    cleanupPopoverAnchorObserver();
    try {
      el.hidePopover();
    } catch {
      // Not shown — ignore
    }
    el.removeAttribute('data-dismissing');

    el.innerHTML = '';
    options.render(el);

    // Anchor positioning
    if (supportsAnchor) {
      const anchorName = '--overlay-anchor';
      options.anchor.style.setProperty('anchor-name', anchorName);
      el.style.setProperty('position-anchor', anchorName);
      el.style.removeProperty('top');
      el.style.removeProperty('left');
    } else {
      const rect = options.anchor.getBoundingClientRect();
      el.style.top = `${rect.bottom + globalThis.scrollY}px`;
      el.style.left = `${rect.left + globalThis.scrollX}px`;
      el.style.position = 'absolute';
    }

    el.showPopover();

    // Watch for anchor disconnect
    watchAnchorDisconnect(options.anchor);
  }

  function watchAnchorDisconnect(anchor: HTMLElement): void {
    cleanupPopoverAnchorObserver();

    const parent = anchor.parentNode;
    if (!parent) {
      closePopover();
      return;
    }

    popoverAnchorObserver = new MutationObserver(() => {
      if (!document.contains(anchor)) {
        closePopover();
      }
    });

    popoverAnchorObserver.observe(parent, { childList: true });
  }

  /** Hide popover instantly without dismiss animation. */
  function hidePopoverImmediate(): void {
    cleanupPopoverAnchorObserver();
    if (!popoverEl) return;
    try {
      popoverEl.hidePopover();
    } catch {
      // Not shown — ignore
    }
    popoverEl.removeAttribute('data-dismissing');
  }

  function cleanupPopoverAnchorObserver(): void {
    if (popoverAnchorObserver) {
      popoverAnchorObserver.disconnect();
      popoverAnchorObserver = null;
    }
  }

  function closePopover(): void {
    cleanupPopoverAnchorObserver();

    if (!popoverEl) return;

    // Check if popover is showing via matches(':popover-open')
    let isOpen = false;
    try {
      isOpen = popoverEl.matches(':popover-open');
    } catch {
      // :popover-open may not be supported — fall back
      isOpen = popoverEl.hasAttribute('popover') && popoverEl.style.display !== 'none';
    }

    if (!isOpen) return;

    animateDismiss(popoverEl, () => {
      try {
        popoverEl!.hidePopover();
      } catch {
        // Already hidden
      }
    });
  }

  // --- Dismiss all ---

  function dismissAll(): void {
    // Close modal
    if (dialog && dialog.open) {
      const resolve = modalResolve;
      const onClose = modalOnClose;
      modalResolve = null;
      modalOnClose = undefined;

      dialog.removeAttribute('data-dismissing');
      dialog.close();

      if (resolve) resolve(undefined);
      if (onClose) onClose();
    }

    // Remove all toasts
    for (const entry of activeToasts) {
      if (entry.timerId) clearTimeout(entry.timerId);
      entry.el.remove();
    }
    activeToasts.clear();

    // Hide popover
    hidePopoverImmediate();
  }

  return {
    modal,
    closeModal,
    toast,
    popover,
    closePopover,
    dismissAll,
  };
}
