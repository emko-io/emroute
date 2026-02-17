/**
 * Overlay Service Types
 *
 * Programmatic API for overlays. For simple cases, use declarative HTML
 * attributes (commandfor/command + popover/dialog) — zero JS required.
 * This service provides the imperative path for dynamic content,
 * programmatic triggers, and complex workflows. dismissAll() is
 * DOM-aware and closes both programmatic and declarative overlays.
 */

export interface OverlayService {
  modal<T = undefined>(options: ModalOptions<T>): Promise<T | undefined>;
  closeModal<T>(value?: T): void;

  popover(options: PopoverOptions): void;
  closePopover(): void;

  toast(options: ToastOptions): { dismiss(): void };

  /** Close all open overlays — programmatic and declarative — and toasts. */
  dismissAll(): void;
}

export interface ModalOptions<T = undefined> {
  render(dialog: HTMLDialogElement): void;
  onClose?(): void;
}

export interface PopoverOptions {
  anchor: HTMLElement;
  render(el: HTMLDivElement): void;
}

export interface ToastOptions {
  render(el: HTMLDivElement): void;
  /** Auto-dismiss timeout in ms. Default 0 (manual dismiss only). Set to a positive ms value for auto-dismiss via CSS animation. */
  timeout?: number;
}
