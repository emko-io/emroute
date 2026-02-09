/**
 * SPA (Browser) Module
 *
 * Everything needed for the browser bundle:
 * - SPA router with client-side navigation
 * - Custom elements for rendering and hydrating SSR islands
 * - Widget registry with built-in widgets
 */

export { createSpaHtmlRouter, SpaHtmlRouter } from './html.renderer.ts';
export { RouterSlot } from '../../element/slot.element.ts';
export { MarkdownElement } from '../../element/markdown.element.ts';
export { ComponentElement } from '../../element/component.element.ts';
export { WidgetRegistry } from '../../widget/widget.registry.ts';

// Built-in widgets
import { pageTitleWidget } from '../../widget/page-title.widget.ts';
import { breadcrumbWidget } from '../../widget/breadcrumb.widget.ts';
import { WidgetRegistry } from '../../widget/widget.registry.ts';
import { ComponentElement } from '../../element/component.element.ts';

/** Default widget registry with built-in widgets. */
export const builtInWidgets = new WidgetRegistry();
builtInWidgets.add(pageTitleWidget);
builtInWidgets.add(breadcrumbWidget);

// Register built-in widgets as custom elements in the browser
if (globalThis.customElements) {
  for (const widget of builtInWidgets) {
    ComponentElement.register(widget);
  }
}
