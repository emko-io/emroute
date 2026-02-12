/**
 * Overlay Module
 *
 * Centralized overlay service for modals, toasts, and popovers.
 * Built on native platform APIs (<dialog>, popover attribute, CSS anchor()).
 */

export type { ModalOptions, OverlayService, PopoverOptions, ToastOptions } from './overlay.type.ts';
export { createOverlayService } from './overlay.service.ts';
