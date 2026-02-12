/**
 * Overlay Service Types
 *
 * Interfaces for the centralized overlay service supporting
 * modals, toasts, and popovers via native platform APIs.
 */

export interface OverlayService {
  modal<T = undefined>(options: ModalOptions<T>): Promise<T | undefined>;
  closeModal<T>(value?: T): void;

  toast(options: ToastOptions): { dismiss(): void };

  popover(options: PopoverOptions): void;
  closePopover(): void;

  dismissAll(): void;
}

export interface ModalOptions<T = undefined> {
  render(dialog: HTMLDialogElement): void;
  onClose?(): void;
}

export interface ToastOptions {
  render(el: HTMLDivElement): void;
  /** Auto-dismiss timeout in ms. Default 5000. Set to 0 to disable. */
  timeout?: number;
}

export interface PopoverOptions {
  anchor: HTMLElement;
  render(el: HTMLDivElement): void;
}
