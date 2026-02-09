/**
 * @emkodev/emroute
 *
 * Universal module — works in both browser and server.
 * Contains types, component base classes, route matching, and utilities.
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

// Components
export {
  Component,
  type ComponentManifestEntry,
  PageComponent,
  type ComponentContext,
  type RenderContext,
} from './component/abstract.component.ts';

export { WidgetComponent } from './component/widget.component.ts';
export { WidgetRegistry } from './widget/widget.registry.ts';
export { DefaultPageComponent } from './component/page.component.ts';

// Route matching
export {
  filePathToPattern,
  getPageFileType,
  getRouteType,
  RouteMatcher,
  sortRoutesBySpecificity,
} from './route/route.matcher.ts';

export {
  DEFAULT_ROOT_ROUTE,
  RouteCore,
  SSR_HTML_PREFIX,
  SSR_MD_PREFIX,
} from './route/route.core.ts';

// Component/widget rendering
export {
  parseComponentBlocks,
  type ParsedComponentBlock,
  renderComponent,
  replaceComponentBlocks,
} from './renderer/component/component.renderer.ts';

export { parseWidgetBlocks, replaceWidgetBlocks } from './widget/widget.parser.ts';

// Utils
export { escapeHtml, STATUS_MESSAGES } from './util/html.util.ts';
