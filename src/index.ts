/**
 * @emkodev/emroute
 *
 * Public API — types, component base classes, and utilities for consumer code.
 *
 * For environment-specific code, use sub-exports:
 *   @emkodev/emroute/spa        — Browser: SPA router + custom elements
 *   @emkodev/emroute/ssr/html   — Server: SSR HTML renderer
 *   @emkodev/emroute/ssr/md     — Server: SSR Markdown renderer
 *   @emkodev/emroute/server     — Dev server
 *   @emkodev/emroute/generator  — Build-time route generator
 */

// Types
export type {
  ErrorBoundary,
  MatchedRoute,
  NavigateOptions,
  RedirectConfig,
  RouteConfig,
  RouteFiles,
  RouteFileType,
  RouteInfo,
  RouteParams,
  RouterEvent,
  RouterEventListener,
  RouterEventType,
  RouterState,
  RoutesManifest,
} from './type/route.type.ts';

export type {
  ParsedWidgetBlock,
  WidgetManifestEntry,
  WidgetsManifest,
} from './type/widget.type.ts';

export type { MarkdownRenderer } from './type/markdown.type.ts';
export { type Logger, setLogger } from './type/logger.type.ts';

// Components
export {
  Component,
  type ComponentContext,
  type ComponentManifestEntry,
  type RenderContext,
} from './component/abstract.component.ts';

export { PageComponent } from './component/page.component.ts';
export { WidgetComponent } from './component/widget.component.ts';
export { WidgetRegistry } from './widget/widget.registry.ts';

// Utils
export { escapeHtml } from './util/html.util.ts';
