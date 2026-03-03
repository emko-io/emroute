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
} from '../core/type/route.type.ts';

export type { RouteNode } from '../core/type/route-tree.type.ts';
export type { RouteResolver, ResolvedRoute } from '../core/router/route.resolver.ts';
export { RouteTrie } from '../core/router/route.trie.ts';

export type {
  ParsedWidgetBlock,
  SpaMode,
  WidgetManifestEntry,
  WidgetsManifest,
} from '../core/type/widget.type.ts';

export type { ElementManifestEntry } from '../core/type/element.type.ts';
export type { MarkdownRenderer } from '../core/type/markdown.type.ts';
export { type Logger, setLogger } from '../core/type/logger.type.ts';

// Components
export {
  Component,
} from '../core/component/abstract.component.ts';

export type {
  ComponentContext,
  ComponentManifestEntry,
  ContextProvider,
  FileContents,
  RenderContext,
} from '../core/type/component.type.ts';

export { PageComponent } from '../core/component/page.component.ts';
export { WidgetComponent } from '../core/component/widget.component.ts';
export { WidgetRegistry } from '../core/widget/widget.registry.ts';

// Route config
export { type BasePath, DEFAULT_BASE_PATH } from '../core/server/server.type.ts';

// Utils
export { escapeHtml, scopeWidgetCss } from '../core/util/html.util.ts';
