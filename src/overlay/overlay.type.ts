/**
 * Overlay Service Types
 *
 * Programmatic API for overlays. For simple cases, use declarative HTML
 * attributes (commandfor/command + popover/dialog) — zero JS required.
 * This service provides the imperative path for dynamic content,
 * programmatic triggers, and complex workflows. dismissAll() is
 * DOM-aware and closes both programmatic and declarative overlays.
 */

export interface ToastHandle {
  id: number;
  dismiss(): void;
  update(opts: { message?: string; type?: string; timeout?: number }): void;
}

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastFunction {
  (options: ToastOptions): ToastHandle;
  success(message: string, timeout?: number): ToastHandle;
  error(message: string, timeout?: number): ToastHandle;
  warning(message: string, timeout?: number): ToastHandle;
  info(message: string, timeout?: number): ToastHandle;
}

export interface OverlayService {
  modal<T = undefined>(options: ModalOptions<T>): Promise<T | undefined>;
  closeModal<T>(value?: T): void;

  popover(options: PopoverOptions): void;
  closePopover(): void;

  toast: ToastFunction;

  /** Close all open overlays — programmatic and declarative — and toasts. */
  dismissAll(): void;
}

export interface ModalOptions<T = undefined> { // eslint-disable-line @typescript-eslint/no-unused-vars
  render(dialog: HTMLDialogElement): void;
  onClose?(): void;
}

export interface PopoverOptions {
  anchor: HTMLElement;
  render(el: HTMLDivElement): void;
}

export interface ToastOptions {
  /** Custom render function — escape hatch for full control. */
  render?(el: HTMLDivElement): void;
  /** Text content (alternative to render). */
  message?: string;
  /** Toast type — sets `data-toast-type` attribute. */
  type?: ToastType;
  /** Confirm button label. Shows button, makes toast manual, returns PromiseLike<boolean>. */
  confirm?: string;
  /** Reject button label. */
  reject?: string;
  /** Auto-dismiss timeout in ms. Default 0 (manual dismiss only). Set to a positive ms value for auto-dismiss via CSS animation. */
  timeout?: number;
}
