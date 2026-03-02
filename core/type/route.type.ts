/**
 * Route Types
 *
 * Pure routing types. No rendering, no navigation, no browser concerns.
 */

export type { RouteNode, RouteFiles } from './route-tree.type.ts';

/** Parameters extracted from URL patterns. */
export type RouteParams = Readonly<Record<string, string>>;

/** Immutable route context built once per navigation, shared across the render pipeline. */
export interface RouteInfo {
  readonly url: URL;
  readonly params: RouteParams;
}

/** Supported file patterns in file-based routing. */
export type RouteFileType = 'page' | 'error' | 'redirect';

/** Redirect configuration. */
export interface RedirectConfig {
  to: string;
  status: 301 | 302;
}

/** Route configuration for a single matched route. */
export interface RouteConfig {
  pattern: string;
  type: RouteFileType;
  modulePath: string;
  files?: import('./route-tree.type.ts').RouteFiles;
  parent?: string;
  statusCode?: number;
}

/** Result of matching a URL against routes. */
export interface MatchedRoute {
  readonly route: RouteConfig;
  readonly params: RouteParams;
}

/** Error boundary configuration. */
export interface ErrorBoundary {
  pattern: string;
  modulePath: string;
}
