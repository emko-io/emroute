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
  RouteInfo,
  RouteParams,
  RouterEvent,
  RouterEventListener,
  RoutesManifest,
} from '../type/route.type.ts';
import type { ComponentContext, ContextProvider } from '../component/abstract.component.ts';
import { RouteMatcher, toUrl } from './route.matcher.ts';

/** Base paths for the two SSR rendering endpoints. */
export interface BasePath {
  /** Base path for SSR HTML rendering (default: '/html') */
  html: string;
  /** Base path for SSR Markdown rendering (default: '/md') */
  md: string;
}

/** Default base paths — backward compatible with existing /html/ and /md/ prefixes. */
export const DEFAULT_BASE_PATH: BasePath = { html: '/html', md: '/md' };

/**
 * Create a copy of a manifest with basePath prepended to all patterns.
 * Used by the server to prefix bare in-memory manifests before passing to routers.
 */
export function prefixManifest(manifest: RoutesManifest, basePath: string): RoutesManifest {
  if (!basePath) return manifest;
  return {
    routes: manifest.routes.map((r) => ({
      ...r,
      // Root pattern '/' becomes basePath itself (e.g. '/html'), not '/html/'
      pattern: r.pattern === '/' ? basePath : basePath + r.pattern,
      parent: r.parent ? (r.parent === '/' ? basePath : basePath + r.parent) : undefined,
    })),
    errorBoundaries: manifest.errorBoundaries.map((e) => ({
      ...e,
      pattern: e.pattern === '/' ? basePath : basePath + e.pattern,
    })),
    statusPages: new Map(
      [...manifest.statusPages].map(([status, route]) => [
        status,
        { ...route, pattern: basePath + route.pattern },
      ]),
    ),
    errorHandler: manifest.errorHandler,
    moduleLoaders: manifest.moduleLoaders,
  };
}

const BLOCKED_PROTOCOLS = /^(javascript|data|vbscript):/i;

/** Throw if a redirect URL uses a dangerous protocol. */
export function assertSafeRedirect(url: string): void {
  if (BLOCKED_PROTOCOLS.test(url.trim())) {
    throw new Error(`Unsafe redirect URL blocked: ${url}`);
  }
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
  /** Enriches every ComponentContext with app-level services before it reaches components. */
  extendContext?: ContextProvider;
  /** Base path prepended to route patterns for URL matching (e.g. '/html'). No trailing slash. */
  basePath?: string;
}

/**
 * Core router functionality shared across all rendering contexts.
 */
export class RouteCore {
  readonly matcher: RouteMatcher;
  /** Registered context provider (if any). Exposed so renderers can apply it to inline contexts. */
  readonly contextProvider: ContextProvider | undefined;
  /** Base path for URL matching (e.g. '/html'). Empty string when no basePath. */
  readonly basePath: string;
  /** The root pattern — basePath when set, '/' otherwise. */
  get root(): string {
    return this.basePath || '/';
  }
  private listeners: Set<RouterEventListener> = new Set();
  private moduleCache: Map<string, unknown> = new Map();
  private widgetFileCache: Map<string, string> = new Map();
  private moduleLoaders: Record<string, () => Promise<unknown>>;
  currentRoute: MatchedRoute | null = null;
  private baseUrl: string;

  constructor(manifest: RoutesManifest, options: RouteCoreOptions = {}) {
    this.basePath = options.basePath ?? '';
    this.matcher = new RouteMatcher(manifest);
    this.baseUrl = options.baseUrl ?? '';
    this.contextProvider = options.extendContext;
    this.moduleLoaders = manifest.moduleLoaders ?? {};
  }

  /**
   * Get current route parameters.
   */
  getParams(): RouteParams {
    return this.currentRoute?.params ?? {};
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
   * Falls back to the default root route for the basePath root (or '/' when no basePath).
   */
  match(url: URL | string): MatchedRoute | undefined {
    const matched = this.matcher.match(url);
    if (matched) return matched;

    const urlObj = toUrl(url);
    if (urlObj.pathname === this.root || urlObj.pathname === this.root + '/') {
      return {
        route: { ...DEFAULT_ROOT_ROUTE, pattern: this.root },
        params: {},
        searchParams: urlObj.searchParams,
      };
    }

    return undefined;
  }

  /**
   * Build route hierarchy from a pattern.
   *
   * When basePath is set, the root is the basePath itself and only
   * segments after it are split into ancestors.
   *
   * e.g., basePath='/html', pattern='/html/projects/:id/tasks'
   *   → ['/html', '/html/projects', '/html/projects/:id', '/html/projects/:id/tasks']
   *
   * Without basePath: '/projects/:id/tasks'
   *   → ['/', '/projects', '/projects/:id', '/projects/:id/tasks']
   */
  buildRouteHierarchy(pattern: string): string[] {
    if (pattern === this.root || pattern === this.root + '/') {
      return [this.root];
    }

    // Extract the part after basePath
    const tail = this.basePath ? pattern.slice(this.basePath.length) : pattern;
    const segments = tail.split('/').filter(Boolean);

    const hierarchy: string[] = [this.root];
    let current = this.basePath || '';
    for (const segment of segments) {
      current += '/' + segment;
      hierarchy.push(current);
    }

    return hierarchy;
  }

  /**
   * Normalize URL by removing trailing slashes (except bare '/').
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
   * Build a RouteInfo from a matched route and the resolved URL pathname.
   * Called once per navigation; the result is reused across the route hierarchy.
   */
  toRouteInfo(matched: MatchedRoute, pathname: string): RouteInfo {
    return {
      pathname,
      pattern: matched.route.pattern,
      params: matched.params,
      searchParams: matched.searchParams ?? new URLSearchParams(),
    };
  }

  /**
   * Build a ComponentContext by extending RouteInfo with loaded file contents.
   * When a signal is provided it is forwarded to fetch() calls and included
   * in the returned context so that getData() can observe cancellation.
   */
  async buildComponentContext(
    routeInfo: RouteInfo,
    route: RouteConfig,
    signal?: AbortSignal,
    isLeaf?: boolean,
  ): Promise<ComponentContext> {
    const fetchFile = async (filePath: string): Promise<string> => {
      const url = this.baseUrl + this.toAbsolutePath(filePath);
      const response = await fetch(url, signal ? { signal } : undefined);
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

    const base: ComponentContext = {
      ...routeInfo,
      files: { html, md, css },
      signal,
      isLeaf,
      basePath: this.basePath || undefined,
    };
    return this.contextProvider ? this.contextProvider(base) : base;
  }
}
