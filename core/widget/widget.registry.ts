/**
 * Widget Registry Utilities
 *
 * Helpers for extracting widget components from loaded modules.
 * Widget resolution is handled by Pipeline → Runtime (widgets manifest).
 */

import type { WidgetComponent } from '../component/widget.component.ts';

/** Extract a WidgetComponent from a loaded module's exports. */
export function extractWidgetExport(mod: Record<string, unknown>): WidgetComponent | null {
  for (const value of Object.values(mod)) {
    if (!value) continue;
    if (typeof value === 'object' && 'getData' in value) {
      return value as WidgetComponent;
    }
    if (typeof value === 'function' && value.prototype?.getData) {
      return new (value as new () => WidgetComponent)();
    }
  }
  return null;
}
