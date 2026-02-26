/**
 * Router Types
 *
 * Native browser APIs only - no external dependencies.
 * Follows islands architecture: pages = HTML, widgets = web components.
 */

/** Parameters extracted from URL patterns */
export type RouteParams = Readonly<Record<string, string>>;

/** Immutable route context built once per navigation, shared across the render pipeline. */
export interface RouteInfo {
  /** The URL being rendered. Components read pathname, searchParams, hash from this. */
  readonly url: URL;

  /** URL parameters extracted by the trie match. */
  readonly params: RouteParams;
}

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

  /** JavaScript module — merged module with inlined companions (.page.js) */
  js?: string;

  /** HTML template path (.page.html) */
  html?: string;

  /** Markdown content path (.page.md) */
  md?: string;

  /** CSS stylesheet path (.page.css) */
  css?: string;
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
  readonly route: RouteConfig;

  /** Extracted URL parameters */
  readonly params: RouteParams;
}

/** Error boundary configuration */
export interface ErrorBoundary {
  /** Pattern prefix this error boundary handles */
  pattern: string;

  /** Module path for the error handler */
  modulePath: string;
}

export type { RouteNode } from './route-tree.type.ts';

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
