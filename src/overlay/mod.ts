/**
 * Overlay Module
 *
 * Programmatic overlay API for modals, toasts, and popovers.
 * For simple cases, use declarative HTML (commandfor/command + popover/dialog).
 * dismissAll() closes both programmatic and declarative overlays.
 */

export type { ModalOptions, OverlayService, PopoverOptions, ToastOptions } from './overlay.type.ts';
export { createOverlayService } from './overlay.service.ts';
