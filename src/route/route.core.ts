/**
 * Route Core
 *
 * Shared routing logic used by all renderers:
 * - Route matching (delegates to RouteResolver)
 * - Module loading and caching
 * - Event emission
 * - URL normalization
 * - BasePath stripping
 */

import type {
  MatchedRoute,
  RouteConfig,
  RouteInfo,
  RouteParams,
  RouterEvent,
  RouterEventListener,
} from '../type/route.type.ts';
import type { ComponentContext, ContextProvider } from '../component/abstract.component.ts';
import type { RouteResolver, ResolvedRoute } from './route.resolver.ts';

/** Base paths for the two SSR rendering endpoints. */
export interface BasePath {
  /** Base path for SSR HTML rendering (default: '/html') */
  html: string;
  /** Base path for SSR Markdown rendering (default: '/md') */
  md: string;
  /** Base path for PWA/SPA rendering (default: '/app') */
  app: string;
}

/** Default base paths — backward compatible with existing /html/ and /md/ prefixes. */
export const DEFAULT_BASE_PATH: BasePath = { html: '/html', md: '/md', app: '/app' };

const BLOCKED_PROTOCOLS = /^(javascript|data|vbscript):/i;

/** Throw if a redirect URL uses a dangerous protocol. */
export function assertSafeRedirect(url: string): void {
  if (BLOCKED_PROTOCOLS.test(url.trim())) {
    throw new Error(`Unsafe redirect URL blocked: ${url}`);
  }
}

/** Default root route — renders a slot for child routes. */
export const DEFAULT_ROOT_ROUTE: RouteConfig = {
  pattern: '/',
  type: 'page',
  modulePath: '__default_root__',
};

/** Synthesize a RouteConfig from a ResolvedRoute (bridge for renderer compatibility). */
function toRouteConfig(resolved: ResolvedRoute): RouteConfig {
  const node = resolved.node;
  return {
    pattern: resolved.pattern,
    type: node.redirect ? 'redirect' : 'page',
    modulePath: node.redirect ?? node.files?.ts ?? node.files?.js ?? node.files?.html ?? node.files?.md ?? '',
    files: node.files,
  };
}

/** Options for RouteCore */
export interface RouteCoreOptions {
  /**
   * Read a companion file (.html, .md, .css) by path — returns its text content.
   * SSR: `(path) => runtime.query(path, { as: 'text' })`.
   * SPA default: `fetch(path, { headers: { Accept: 'text/plain' } }).then(r => r.text())`.
   */
  fileReader?: (path: string) => Promise<string>;
  /** Enriches every ComponentContext with app-level services before it reaches components. */
  extendContext?: ContextProvider;
  /** Module loaders keyed by path — server provides these for SSR imports. */
  moduleLoaders?: Record<string, () => Promise<unknown>>;
}

/**
 * Core router functionality shared across all rendering contexts.
 */
export class RouteCore {
  private readonly resolver: RouteResolver;
  /** Registered context provider (if any). Exposed so renderers can apply it to inline contexts. */
  readonly contextProvider: ContextProvider | undefined;
  private listeners: Set<RouterEventListener> = new Set();
  private moduleCache: Map<string, unknown> = new Map();
  private widgetFileCache: Map<string, string> = new Map();
  private moduleLoaders: Record<string, () => Promise<unknown>>;
  currentRoute: MatchedRoute | null = null;
  private readFile: (path: string) => Promise<string>;

  constructor(resolver: RouteResolver, options: RouteCoreOptions = {}) {
    this.resolver = resolver;
    this.readFile = options.fileReader ??
      ((path) => fetch(path, { headers: { Accept: 'text/plain' } }).then((r) => r.text()));
    this.contextProvider = options.extendContext;
    this.moduleLoaders = options.moduleLoaders ?? {};
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
   * Falls back to the default root route for '/'.
   */
  match(url: URL): MatchedRoute | undefined {
    const pathname = url.pathname;

    const resolved = this.resolver.match(pathname);
    if (resolved) {
      return {
        route: toRouteConfig(resolved),
        params: resolved.params,
      };
    }

    if (pathname === '/' || pathname === '') {
      return {
        route: DEFAULT_ROOT_ROUTE,
        params: {},
      };
    }

    return undefined;
  }

  /** Get status-specific page (404, 401, 403). */
  getStatusPage(status: number): RouteConfig | undefined {
    const node = this.resolver.findRoute(`/${status}`);
    if (!node) return undefined;
    return {
      pattern: `/${status}`,
      type: 'page',
      modulePath: node.files?.ts ?? node.files?.js ?? node.files?.html ?? node.files?.md ?? '',
      files: node.files,
    };
  }

  /** Get global error handler (root errorBoundary). */
  getErrorHandler(): RouteConfig | undefined {
    const modulePath = this.resolver.findErrorBoundary('/');
    if (!modulePath) return undefined;
    return { pattern: '/', type: 'error', modulePath };
  }

  /**
   * Find error boundary for a given pathname.
   * Note: pattern is the input pathname, not the boundary's own pattern.
   * Callers should only rely on modulePath.
   */
  findErrorBoundary(pathname: string): { pattern: string; modulePath: string } | undefined {
    const modulePath = this.resolver.findErrorBoundary(pathname);
    if (!modulePath) return undefined;
    return { pattern: pathname, modulePath };
  }

  /**
   * Find a route by its exact pattern.
   * Used for building route hierarchy.
   */
  findRoute(pattern: string): RouteConfig | undefined {
    const node = this.resolver.findRoute(pattern);
    if (!node) return undefined;
    return {
      pattern,
      type: node.redirect ? 'redirect' : 'page',
      modulePath: node.redirect ?? node.files?.ts ?? node.files?.js ?? node.files?.html ?? node.files?.md ?? '',
      files: node.files,
    };
  }

  /**
   * Build route hierarchy from a pattern.
   * Patterns are always unprefixed (no basePath).
   *
   * e.g., '/projects/:id/tasks'
   *   → ['/', '/projects', '/projects/:id', '/projects/:id/tasks']
   */
  buildRouteHierarchy(pattern: string): string[] {
    if (pattern === '/') {
      return ['/'];
    }

    const segments = pattern.split('/').filter(Boolean);

    const hierarchy: string[] = ['/'];
    let current = '';
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
   */
  async loadWidgetFiles(
    widgetFiles: { html?: string; md?: string; css?: string },
  ): Promise<{ html?: string; md?: string; css?: string }> {
    const load = async (path: string): Promise<string | undefined> => {
      const absPath = this.toAbsolutePath(path);
      const cached = this.widgetFileCache.get(absPath);
      if (cached !== undefined) return cached;

      try {
        const content = await this.readFile(absPath);
        this.widgetFileCache.set(absPath, content);
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
  toRouteInfo(matched: MatchedRoute, url: URL): RouteInfo {
    return {
      url,
      params: matched.params,
    };
  }

  /**
   * Get inlined `__files` from a cached module (merged module pattern).
   * Returns undefined if the module isn't cached or has no __files.
   */
  getModuleFiles(modulePath: string): { html?: string; md?: string; css?: string } | undefined {
    const cached = this.moduleCache.get(modulePath);
    if (!cached || typeof cached !== 'object') return undefined;
    const files = (cached as Record<string, unknown>).__files;
    if (!files || typeof files !== 'object') return undefined;
    return files as { html?: string; md?: string; css?: string };
  }

  /**
   * Build a ComponentContext by extending RouteInfo with loaded file contents.
   *
   * When the route module is a merged module (contains `__files`), uses
   * inlined content directly. Otherwise falls back to reading companion files.
   */
  async buildComponentContext(
    routeInfo: RouteInfo,
    route: RouteConfig,
    signal?: AbortSignal,
    isLeaf?: boolean,
  ): Promise<ComponentContext> {
    const rf = route.files;
    const modulePath = rf?.ts ?? rf?.js;

    // Try inlined __files from merged module (already cached by loadRouteContent)
    const inlined = modulePath ? this.getModuleFiles(modulePath) : undefined;

    let html: string | undefined;
    let md: string | undefined;
    let css: string | undefined;

    if (inlined) {
      html = inlined.html;
      md = inlined.md;
      css = inlined.css;
    } else {
      const fetchFile = (filePath: string): Promise<string> =>
        this.readFile(this.toAbsolutePath(filePath));
      [html, md, css] = await Promise.all([
        rf?.html ? fetchFile(rf.html) : undefined,
        rf?.md ? fetchFile(rf.md) : undefined,
        rf?.css ? fetchFile(rf.css) : undefined,
      ]);
    }

    const base: ComponentContext = {
      ...routeInfo,
      pathname: routeInfo.url.pathname,
      searchParams: routeInfo.url.searchParams,
      files: { html, md, css },
      signal,
      isLeaf,
    };
    return this.contextProvider ? this.contextProvider(base) : base;
  }
}
