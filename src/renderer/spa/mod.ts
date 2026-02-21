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

// Re-export base classes and types for consumer code (pages, widgets)
export { PageComponent } from '../../component/page.component.ts';
export { WidgetComponent } from '../../component/widget.component.ts';
export {
  Component,
  type ComponentContext,
  type ComponentManifestEntry,
  type ContextProvider,
  type RenderContext,
} from '../../component/abstract.component.ts';
export type {
  MatchedRoute,
  NavigateOptions,
  RouteParams,
  RouterEvent,
  RouterEventListener,
  RouterEventType,
  RoutesManifest,
} from '../../type/route.type.ts';
export type { MarkdownRenderer } from '../../type/markdown.type.ts';
export { type BasePath, DEFAULT_BASE_PATH } from '../../route/route.core.ts';
export { escapeHtml, scopeWidgetCss } from '../../util/html.util.ts';
export type { RedirectConfig, RouteConfig, RouteFiles, RouteFileType, RouteInfo, RouterState, ErrorBoundary } from '../../type/route.type.ts';
export type { ParsedWidgetBlock, WidgetManifestEntry } from '../../type/widget.type.ts';
export { type Logger, setLogger } from '../../type/logger.type.ts';

// Register core custom elements in the browser
if (globalThis.customElements) {
  if (!customElements.get('router-slot')) customElements.define('router-slot', RouterSlot);
  if (!customElements.get('mark-down')) customElements.define('mark-down', MarkdownElement);
}

// Overlay API (tree-shakeable - only bundled if imported)
export { createOverlayService } from '../../overlay/overlay.service.ts';
export type { ModalOptions, OverlayService, PopoverOptions, ToastOptions } from '../../overlay/overlay.type.ts';

// Optional: Built-in widgets (tree-shakeable - only bundled if imported)
export { PageTitleWidget } from '../../widget/page-title.widget.ts';
export { BreadcrumbWidget } from '../../widget/breadcrumb.widget.ts';
