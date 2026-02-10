/**
 * Route Matcher
 *
 * URLPattern-based route matching with support for:
 * - Static routes (/about)
 * - Dynamic segments (/projects/:id)
 * - Wildcard/catch-all (future)
 *
 * Uses native URLPattern API (Safari may need polyfill later).
 */

/** Parse a URL path string into a URL object. Passes through URL objects unchanged. */
export function toUrl(url: string | URL): URL {
  return typeof url === 'string' ? new URL(url, 'http://url-parse') : url;
}

import type {
  ErrorBoundary,
  MatchedRoute,
  RouteConfig,
  RouteParams,
  RoutesManifest,
} from '../type/route.type.ts';

/** Compiled route with URLPattern instance */
interface CompiledRoute {
  route: RouteConfig;
  pattern: URLPattern;
}

/**
 * Route matcher using native URLPattern API.
 *
 * Routes are matched in order of specificity:
 * 1. Exact static matches first
 * 2. Dynamic segment matches
 * 3. More specific patterns before less specific
 */
export class RouteMatcher {
  private compiledRoutes: CompiledRoute[] = [];
  private errorBoundaries: ErrorBoundary[] = [];
  private statusPages = new Map<number, RouteConfig>();
  private errorHandler?: RouteConfig;

  /**
   * Initialize matcher with routes manifest.
   * Routes should be pre-sorted by specificity in the manifest.
   */
  constructor(manifest: RoutesManifest) {
    this.errorBoundaries = [...manifest.errorBoundaries].sort(
      (a, b) => b.pattern.length - a.pattern.length,
    );
    this.statusPages = manifest.statusPages;
    this.errorHandler = manifest.errorHandler;

    // Compile URLPatterns for all routes
    for (const route of manifest.routes) {
      try {
        const pattern = new URLPattern({ pathname: route.pattern });
        this.compiledRoutes.push({ route, pattern });
      } catch (e) {
        console.error(`[Router] Invalid pattern: ${route.pattern}`, e);
      }
    }
  }

  /**
   * Match a URL against registered routes.
   * Returns the first matching route or undefined.
   */
  match(url: URL | string): MatchedRoute | undefined {
    const urlObj = toUrl(url);

    const searchParams = urlObj.searchParams;

    for (const { route, pattern } of this.compiledRoutes) {
      const result = pattern.exec(urlObj);
      if (result) {
        return {
          route,
          params: this.extractParams(result),
          searchParams,
          patternResult: result,
        };
      }
    }

    return undefined;
  }

  /**
   * Find error boundary for a given pathname.
   * Searches from most specific to least specific.
   */
  findErrorBoundary(pathname: string): ErrorBoundary | undefined {
    for (const boundary of this.errorBoundaries) {
      const prefix = boundary.pattern.endsWith('/') ? boundary.pattern : boundary.pattern + '/';
      if (pathname === boundary.pattern || pathname.startsWith(prefix)) {
        return boundary;
      }
    }

    return undefined;
  }

  /**
   * Get status-specific page (404, 401, 403).
   */
  getStatusPage(status: number): RouteConfig | undefined {
    return this.statusPages.get(status);
  }

  /**
   * Get generic error handler.
   */
  getErrorHandler(): RouteConfig | undefined {
    return this.errorHandler;
  }

  /**
   * Find a route by its exact pattern or by matching a pathname.
   * Used for building route hierarchy.
   */
  findRoute(patternOrPath: string): RouteConfig | undefined {
    // First try exact pattern match
    for (const { route } of this.compiledRoutes) {
      if (route.pattern === patternOrPath) {
        return route;
      }
    }

    // Then try to match as a URL path
    const matched = this.match(toUrl(patternOrPath));
    return matched?.route;
  }

  /**
   * Extract params from URLPatternResult.
   */
  private extractParams(result: URLPatternResult): RouteParams {
    const groups = result.pathname.groups;
    const params: RouteParams = {};
    for (const [key, value] of Object.entries(groups)) {
      if (value !== undefined) {
        params[key] = value;
      }
    }
    return params;
  }
}

/**
 * Convert file-based route path to URLPattern.
 *
 * Examples:
 * - index.page.ts → /
 * - about.page.ts → /about
 * - projects/index.page.ts → /projects/:rest*
 * - projects/[id].page.ts → /projects/:id
 * - projects/[id]/tasks.page.ts → /projects/:id/tasks
 *
 * Directory index files (non-root) become wildcard catch-all routes.
 * See ADR-0002: Wildcard Routes via Directory Index Convention.
 */
export function filePathToPattern(filePath: string): string {
  // Remove routes/ prefix and file extension
  let pattern = filePath
    .replace(/^routes\//, '')
    .replace(/\.(page|error|redirect)\.(ts|html|md|css)$/, '');

  // Detect non-root directory index before stripping
  const isDirectoryIndex = pattern.endsWith('/index') && pattern !== 'index';

  // Handle index files
  pattern = pattern.replace(/\/index$/, '').replace(/^index$/, '');

  // Convert [param] to :param
  pattern = pattern.replace(/\[([^\]]+)\]/g, ':$1');

  // Ensure leading slash
  pattern = '/' + pattern;

  // Non-root directory index becomes wildcard catch-all
  if (isDirectoryIndex) {
    pattern += '/:rest*';
  }

  return pattern;
}

/**
 * Determine route type from filename.
 */
export function getRouteType(
  filename: string,
): 'page' | 'error' | 'redirect' | null {
  if (
    filename.endsWith('.page.ts') ||
    filename.endsWith('.page.html') ||
    filename.endsWith('.page.md')
  ) {
    return 'page';
  }
  if (filename.endsWith('.error.ts')) {
    return 'error';
  }
  if (filename.endsWith('.redirect.ts')) {
    return 'redirect';
  }
  return null;
}

/**
 * Get the file extension type from a page filename.
 */
export function getPageFileType(
  filename: string,
): 'ts' | 'html' | 'md' | 'css' | null {
  if (filename.endsWith('.page.ts')) return 'ts';
  if (filename.endsWith('.page.html')) return 'html';
  if (filename.endsWith('.page.md')) return 'md';
  if (filename.endsWith('.page.css')) return 'css';
  return null;
}

/**
 * Sort routes by specificity.
 * Non-wildcards before wildcards, static before dynamic, longer paths first.
 */
export function sortRoutesBySpecificity(routes: RouteConfig[]): RouteConfig[] {
  return [...routes].sort((a, b) => {
    const aSegments = a.pattern.split('/').filter(Boolean);
    const bSegments = b.pattern.split('/').filter(Boolean);

    // Wildcards always sort last
    const aIsWildcard = aSegments.some((s) => s.endsWith('*') || s.endsWith('+'));
    const bIsWildcard = bSegments.some((s) => s.endsWith('*') || s.endsWith('+'));
    if (aIsWildcard !== bIsWildcard) {
      return aIsWildcard ? 1 : -1;
    }

    // More segments = more specific
    if (aSegments.length !== bSegments.length) {
      return bSegments.length - aSegments.length;
    }

    // Compare segment by segment
    for (let i = 0; i < aSegments.length; i++) {
      const aIsDynamic = aSegments[i].startsWith(':');
      const bIsDynamic = bSegments[i].startsWith(':');

      // Static segments are more specific than dynamic
      if (aIsDynamic !== bIsDynamic) {
        return aIsDynamic ? 1 : -1;
      }
    }

    return 0;
  });
}
