/**
 * Widget Registry
 *
 * Name → Component lookup. Used by all renderers.
 * Pages are NOT in this registry — they live in the routes manifest.
 */

import type { WidgetComponent } from '../component/widget.component.ts';

interface RegistryEntry {
  widget: WidgetComponent;
  modulePath?: string | undefined;
}

export class WidgetRegistry {
  private entries = new Map<string, RegistryEntry>();

  add(widget: WidgetComponent, modulePath?: string): void {
    this.entries.set(widget.name, { widget, modulePath });
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
      for (const entry of entries) yield entry.widget;
    })();
  }
}
