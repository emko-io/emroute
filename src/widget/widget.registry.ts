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

import type { WidgetComponent } from '../component/widget.component.ts';
import type { WidgetManifestEntry, WidgetsManifest } from '../type/widget.type.ts';

export class WidgetRegistry {
  private widgets = new Map<string, WidgetComponent>();

  /** Register a widget by its name. */
  add(widget: WidgetComponent): void {
    this.widgets.set(widget.name, widget);
  }

  /** Look up a widget by name. */
  get(name: string): WidgetComponent | undefined {
    return this.widgets.get(name);
  }

  /** Iterate all registered widgets. */
  [Symbol.iterator](): IterableIterator<WidgetComponent> {
    return this.widgets.values();
  }

  /** Emit a WidgetsManifest from registered widgets. */
  toManifest(): WidgetsManifest {
    const widgets: WidgetManifestEntry[] = [];
    const moduleLoaders: Record<string, () => Promise<unknown>> = {};

    for (const [name, widget] of this.widgets) {
      const entry: WidgetManifestEntry = {
        name,
        modulePath: name,
        tagName: `widget-${name}`,
        files: widget.files,
      };
      widgets.push(entry);
      moduleLoaders[name] = () => Promise.resolve({ default: widget.constructor });
    }

    return { widgets, moduleLoaders };
  }
}
