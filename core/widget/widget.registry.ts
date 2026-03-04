/**
 * Widget Registry
 *
 * Name → Component lookup. Used by all renderers.
 * Pages are NOT in this registry — they live in the routes manifest.
 */

import type { WidgetComponent } from '../component/widget.component.ts';

export class WidgetRegistry {
  private widgets = new Map<string, WidgetComponent>();

  add(widget: WidgetComponent): void {
    this.widgets.set(widget.name, widget);
  }

  get(name: string): WidgetComponent | undefined {
    return this.widgets.get(name);
  }

  [Symbol.iterator](): IterableIterator<WidgetComponent> {
    return this.widgets.values();
  }
}
