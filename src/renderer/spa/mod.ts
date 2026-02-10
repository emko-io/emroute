/**
 * SPA (Browser) Module
 *
 * Everything needed for the browser bundle:
 * - SPA router with client-side navigation
 * - Custom elements for rendering and hydrating SSR islands
 * - Widget registry with built-in widgets
 */

import { RouterSlot } from '../../element/slot.element.ts';
import { MarkdownElement } from '../../element/markdown.element.ts';
import { ComponentElement } from '../../element/component.element.ts';
import { WidgetRegistry } from '../../widget/widget.registry.ts';
import { PageTitleWidget } from '../../widget/page-title.widget.ts';
import { BreadcrumbWidget } from '../../widget/breadcrumb.widget.ts';

export { createSpaHtmlRouter, SpaHtmlRouter } from './html.renderer.ts';
export { ComponentElement, MarkdownElement, RouterSlot, WidgetRegistry };

/** Default widget registry with built-in widgets. */
export const builtInWidgets: WidgetRegistry = new WidgetRegistry();
builtInWidgets.add(new PageTitleWidget());
builtInWidgets.add(new BreadcrumbWidget());

// Register all custom elements in the browser
if (globalThis.customElements) {
  if (!customElements.get('router-slot')) customElements.define('router-slot', RouterSlot);
  if (!customElements.get('mark-down')) customElements.define('mark-down', MarkdownElement);
  for (const widget of builtInWidgets) {
    ComponentElement.register(widget);
  }
}
