/**
 * Route Core
 *
 * Shared routing logic used by all renderers:
 * - Route matching and hierarchy building
 * - Module loading and caching
 * - Event emission
 * - URL normalization
 */

import type {
  MatchedRoute,
  RouteConfig,
  RouteParams,
  RouterEvent,
  RouterEventListener,
  RoutesManifest,
} from '../type/route.type.ts';
import type { ComponentContext } from '../component/abstract.component.ts';
import { RouteMatcher, toUrl } from './route.matcher.ts';
export { toUrl } from './route.matcher.ts';

/** SSR prefix for HTML rendering (e.g. /html/about → /about) */
export const SSR_HTML_PREFIX = '/html/';

/** SSR prefix for Markdown rendering (e.g. /md/about → /about) */
export const SSR_MD_PREFIX = '/md/';

/** Strip /html/ or /md/ prefix from a pathname, returning the bare route path. */
export function stripSsrPrefix(pathname: string): string {
  if (pathname.startsWith(SSR_HTML_PREFIX)) {
    return '/' + pathname.slice(SSR_HTML_PREFIX.length);
  }
  if (pathname.startsWith(SSR_MD_PREFIX)) {
    return '/' + pathname.slice(SSR_MD_PREFIX.length);
  }
  return pathname;
}

/** Default root route - renders a slot for child routes */
export const DEFAULT_ROOT_ROUTE: RouteConfig = {
  pattern: '/',
  type: 'page',
  modulePath: '__default_root__',
};

/** Options for RouteCore */
export interface RouteCoreOptions {
  /** Base URL for fetching files (e.g., 'http://myserver:8080') */
  baseUrl?: string;
}

/**
 * Core router functionality shared across all rendering contexts.
 */
export class RouteCore {
  readonly matcher: RouteMatcher;
  private listeners: Set<RouterEventListener> = new Set();
  private moduleCache: Map<string, unknown> = new Map();
  private widgetFileCache: Map<string, string> = new Map();
  private moduleLoaders: Record<string, () => Promise<unknown>>;
  private _currentRoute: MatchedRoute | null = null;
  private baseUrl: string;

  constructor(manifest: RoutesManifest, options: RouteCoreOptions = {}) {
    this.matcher = new RouteMatcher(manifest);
    this.baseUrl = options.baseUrl ?? '';
    this.moduleLoaders = manifest.moduleLoaders ?? {};
  }

  get currentRoute(): MatchedRoute | null {
    return this._currentRoute;
  }

  set currentRoute(route: MatchedRoute | null) {
    this._currentRoute = route;
  }

  /**
   * Get current route parameters.
   */
  getParams(): RouteParams {
    return this._currentRoute?.params ?? {};
  }

  /**
   * Add event listener for router events.
   */
  addEventListener(listener: RouterEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit router event to listeners.
   */
  emit(event: RouterEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('[Router] Event listener error:', e);
      }
    }
  }

  /**
   * Match a URL to a route.
   * Falls back to the default root route for '/'.
   */
  match(url: URL | string): MatchedRoute | undefined {
    const matched = this.matcher.match(url);
    if (matched) return matched;

    const urlObj = toUrl(url);
    if (urlObj.pathname === '/') {
      return { route: DEFAULT_ROOT_ROUTE, params: {}, searchParams: urlObj.searchParams };
    }

    return undefined;
  }

  /**
   * Build route hierarchy from a pathname.
   * e.g., '/projects/1/tasks' -> ['/', '/projects', '/projects/:id', '/projects/:id/tasks']
   */
  buildRouteHierarchy(pathname: string): string[] {
    if (pathname === '/') {
      return ['/'];
    }

    const hierarchy: string[] = ['/'];
    const segments = pathname.split('/').filter(Boolean);

    let current = '';
    for (const segment of segments) {
      current += '/' + segment;
      hierarchy.push(current);
    }

    return hierarchy;
  }

  /**
   * Normalize URL by removing trailing slashes (except root).
   */
  normalizeUrl(url: string): string {
    if (url.length > 1 && url.endsWith('/')) {
      return url.slice(0, -1);
    }
    return url;
  }

  /**
   * Convert relative path to absolute path.
   */
  toAbsolutePath(path: string): string {
    return path.startsWith('/') ? path : '/' + path;
  }

  /**
   * Load a module with caching.
   * Uses pre-bundled loaders when available, falls back to dynamic import.
   */
  async loadModule<T>(modulePath: string): Promise<T> {
    if (this.moduleCache.has(modulePath)) {
      return this.moduleCache.get(modulePath) as T;
    }

    let module: unknown;
    const loader = this.moduleLoaders[modulePath];
    if (loader) {
      module = await loader();
    } else {
      const absolutePath = this.toAbsolutePath(modulePath);
      module = await import(absolutePath);
    }

    this.moduleCache.set(modulePath, module);
    return module as T;
  }

  /**
   * Load widget file contents with caching.
   * Relative paths are resolved via baseUrl; absolute URLs (http/https) are fetched directly.
   * Returns an object with loaded file contents.
   */
  async loadWidgetFiles(
    widgetFiles: { html?: string; md?: string; css?: string },
  ): Promise<{ html?: string; md?: string; css?: string }> {
    const load = async (path: string): Promise<string | undefined> => {
      const cached = this.widgetFileCache.get(path);
      if (cached !== undefined) return cached;

      try {
        const url = path.startsWith('http://') || path.startsWith('https://')
          ? path
          : this.baseUrl + this.toAbsolutePath(path);

        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`[RouteCore] Failed to load widget file ${path}: ${response.status}`);
          return undefined;
        }

        const content = await response.text();
        this.widgetFileCache.set(path, content);
        return content;
      } catch (e) {
        console.warn(
          `[RouteCore] Failed to load widget file ${path}:`,
          e instanceof Error ? e.message : e,
        );
        return undefined;
      }
    };

    const [html, md, css] = await Promise.all([
      widgetFiles.html ? load(widgetFiles.html) : undefined,
      widgetFiles.md ? load(widgetFiles.md) : undefined,
      widgetFiles.css ? load(widgetFiles.css) : undefined,
    ]);

    return { html, md, css };
  }

  /**
   * Build a ComponentContext from a route's files and params.
   * Fetches html/md/css file content as needed.
   */
  async buildComponentContext(
    pathname: string,
    route: RouteConfig,
    params: RouteParams,
    searchParams?: URLSearchParams,
  ): Promise<ComponentContext> {
    const fetchFile = async (filePath: string): Promise<string> => {
      const url = this.baseUrl + this.toAbsolutePath(filePath);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${filePath}: ${response.status}`);
      }
      return response.text();
    };

    const rf = route.files;
    const [html, md, css] = await Promise.all([
      rf?.html ? fetchFile(rf.html) : undefined,
      rf?.md ? fetchFile(rf.md) : undefined,
      rf?.css ? fetchFile(rf.css) : undefined,
    ]);

    return { pathname, params, searchParams, files: { html, md, css } };
  }
}
