/**
 * Router Types
 *
 * Native browser APIs only - no external dependencies.
 * Follows islands architecture: pages = HTML, widgets = web components.
 */

/** Parameters extracted from URL patterns */
export type RouteParams = Record<string, string>;

/** Supported file patterns in file-based routing */
export type RouteFileType = 'page' | 'error' | 'redirect';

/** Redirect configuration */
export interface RedirectConfig {
  to: string;
  status: 301 | 302;
}

/** Available files for a route */
export interface RouteFiles {
  /** TypeScript module path (.page.ts) */
  ts?: string;

  /** HTML template path (.page.html) */
  html?: string;

  /** Markdown content path (.page.md) */
  md?: string;
}

/** Route configuration for a single route */
export interface RouteConfig {
  /** URLPattern pathname pattern (e.g., '/projects/:id') */
  pattern: string;

  /** Type of route file */
  type: RouteFileType;

  /** Module path for dynamic import (primary file based on precedence) */
  modulePath: string;

  /** Available files for this route */
  files?: RouteFiles;

  /** Parent route pattern for nested routes */
  parent?: string;

  /** HTTP status code (for status-specific pages like 404, 401, 403) */
  statusCode?: number;
}

/** Result of matching a URL against routes */
export interface MatchedRoute {
  /** The matched route configuration */
  route: RouteConfig;

  /** Extracted URL parameters */
  params: RouteParams;

  /** The URLPatternResult from matching */
  patternResult?: URLPatternResult;
}

/** Error boundary configuration */
export interface ErrorBoundary {
  /** Pattern prefix this error boundary handles */
  pattern: string;

  /** Module path for the error handler */
  modulePath: string;
}

/** Generated routes manifest from build tool */
export interface RoutesManifest {
  /** All page routes */
  routes: RouteConfig[];

  /** Error boundaries by pattern prefix */
  errorBoundaries: ErrorBoundary[];

  /** Status-specific pages (404, 401, 403) */
  statusPages: Map<number, RouteConfig>;

  /** Generic error handler */
  errorHandler?: RouteConfig;

  /** Pre-bundled module loaders keyed by module path (for SPA bundles) */
  moduleLoaders?: Record<string, () => Promise<unknown>>;
}

/** Router state for history management */
export interface RouterState {
  /** Current URL pathname */
  pathname: string;

  /** Extracted route parameters */
  params: RouteParams;

  /** Scroll position to restore */
  scrollY?: number;
}

/** Navigation options */
export interface NavigateOptions {
  /** Replace current history entry instead of pushing */
  replace?: boolean;

  /** State to store in history */
  state?: RouterState;

  /** Hash to scroll to after navigation */
  hash?: string;
}

/** Router event types */
export type RouterEventType = 'navigate' | 'error' | 'load';

/** Router event payload */
export interface RouterEvent {
  type: RouterEventType;
  pathname: string;
  params: RouteParams;
  error?: Error;
}

/** Router event listener */
export type RouterEventListener = (event: RouterEvent) => void;
