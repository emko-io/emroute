/**
 * Widget Registry
 *
 * Canonical registry where all widgets live. Used by all renderers:
 * - SSR HTML: resolves widgets by name, calls getData() + renderHTML()
 * - SSR Markdown: resolves widgets by name, calls getData() + renderMarkdown()
 * - SPA: registers custom elements for each widget
 *
 * Pages are NOT in this registry — they live in the routes manifest.
 */

import type { Component } from '../component/abstract.component.ts';

export class WidgetRegistry {
  private widgets = new Map<string, Component>();

  /** Register a widget by its name. */
  add(widget: Component): void {
    this.widgets.set(widget.name, widget);
  }

  /** Look up a widget by name. */
  get(name: string): Component | undefined {
    return this.widgets.get(name);
  }

  /** Iterate all registered widgets. */
  [Symbol.iterator](): IterableIterator<Component> {
    return this.widgets.values();
  }
}
