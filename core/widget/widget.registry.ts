/**
 * Widget Registry
 *
 * Name → Component lookup. Used by all renderers.
 * Pages are NOT in this registry — they live in the routes manifest.
 *
 * Supports eager entries (widget instance) and lazy entries (module path only).
 * Lazy entries are resolved on demand by the renderer via Pipeline → Runtime.
 */

import type { WidgetComponent } from '../component/widget.component.ts';

interface RegistryEntry {
  widget?: WidgetComponent;
  modulePath?: string | undefined;
}

export class WidgetRegistry {
  private entries = new Map<string, RegistryEntry>();

  /** Register a widget instance (eager). */
  add(widget: WidgetComponent, modulePath?: string): void {
    this.entries.set(widget.name, { widget, modulePath });
  }

  /** Register a widget by name and module path (lazy — resolved on demand by renderer). */
  addLazy(name: string, modulePath: string): void {
    if (!this.entries.has(name)) {
      this.entries.set(name, { modulePath });
    }
  }

  get(name: string): WidgetComponent | undefined {
    return this.entries.get(name)?.widget;
  }

  getModulePath(name: string): string | undefined {
    return this.entries.get(name)?.modulePath;
  }

  [Symbol.iterator](): IterableIterator<WidgetComponent> {
    const entries = this.entries.values();
    return (function* () {
      for (const entry of entries) {
        if (entry.widget) yield entry.widget;
      }
    })();
  }
}

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
