/**
 * SPA (Browser) Module
 *
 * Everything needed for the browser bundle:
 * - SPA router with client-side navigation
 * - Custom elements for rendering and hydrating SSR islands
 * - Widget registry (built-in widgets are opt-in)
 */

import { RouterSlot } from '../../element/slot.element.ts';
import { MarkdownElement } from '../../element/markdown.element.ts';
import { ComponentElement } from '../../element/component.element.ts';
import { WidgetRegistry } from '../../widget/widget.registry.ts';

export { createSpaHtmlRouter, SpaHtmlRouter, type SpaHtmlRouterOptions } from './html.renderer.ts';
export {
  createHashRouter,
  type HashRouteConfig,
  HashRouter,
  type HashRouterOptions,
} from './hash.renderer.ts';
export { ComponentElement, MarkdownElement, RouterSlot, WidgetRegistry };
export type { SpaMode, WidgetsManifest } from '../../type/widget.type.ts';

// Register core custom elements in the browser
if (globalThis.customElements) {
  if (!customElements.get('router-slot')) customElements.define('router-slot', RouterSlot);
  if (!customElements.get('mark-down')) customElements.define('mark-down', MarkdownElement);
}

// Optional: Built-in widgets (tree-shakeable - only bundled if imported)
export { PageTitleWidget } from '../../widget/page-title.widget.ts';
export { BreadcrumbWidget } from '../../widget/breadcrumb.widget.ts';
