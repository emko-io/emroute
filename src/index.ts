/**
 * @emkodev/emroute
 *
 * Public API — types, component base classes, and utilities for consumer code.
 *
 * For environment-specific code, use sub-exports:
 *   @emkodev/emroute/spa        — Browser: SPA router + custom elements
 *   @emkodev/emroute/ssr/html   — Server: SSR HTML renderer
 *   @emkodev/emroute/ssr/md     — Server: SSR Markdown renderer
 *   @emkodev/emroute/server     — Production server
 *   @emkodev/emroute/runtime    — Abstract runtime + constants
 *   @emkodev/emroute/runtime/sitemap — Sitemap generation
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
} from './type/route.type.ts';

export type { RouteNode } from './type/route-tree.type.ts';
export type { RouteResolver, ResolvedRoute } from './route/route.resolver.ts';
export { RouteTrie } from './route/route.trie.ts';

export type {
  ParsedWidgetBlock,
  SpaMode,
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
  type ContextProvider,
  type FileContents,
  type RenderContext,
} from './component/abstract.component.ts';

export { PageComponent } from './component/page.component.ts';
export { WidgetComponent } from './component/widget.component.ts';
export { WidgetRegistry } from './widget/widget.registry.ts';

// Route config
export { type BasePath, DEFAULT_BASE_PATH } from './route/route.core.ts';

// Utils
export { escapeHtml, scopeWidgetCss } from './util/html.util.ts';
