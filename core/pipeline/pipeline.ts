/**
 * Pipeline
 *
 * Orchestration layer between Router, Runtime, and Component.
 *
 * Owns:
 * - Route matching → RouteConfig conversion
 * - Module loading + caching
 * - Companion file reading + caching
 * - ComponentContext building
 * - Route hierarchy construction
 *
 * Does NOT own:
 * - Rendering (that's Renderer)
 * - HTTP routing / base paths (that's Server)
 * - Storage I/O (that's Runtime)
 * - Navigation events (that's the browser adapter)
 */

import type { RouteResolver, ResolvedRoute } from '../router/route.resolver.ts';
import type { RouteConfig, MatchedRoute, RouteInfo } from '../type/route.type.ts';
import type { ComponentContext, ContextProvider, FileContents } from '../type/component.type.ts';
import type { Runtime } from '../runtime/abstract.runtime.ts';

/** Default root route — renders a slot for child routes. */
export const DEFAULT_ROOT_ROUTE: RouteConfig = {
  pattern: '/',
  type: 'page',
  modulePath: '__default_root__',
};

/** Synthesize a RouteConfig from a ResolvedRoute. */
function toRouteConfig(resolved: ResolvedRoute): RouteConfig {
  const node = resolved.node;
  return {
    pattern: resolved.pattern,
    type: node.redirect ? 'redirect' : 'page',
    modulePath: node.redirect ?? node.files?.ts ?? node.files?.js ?? node.files?.html ?? node.files?.md ?? '',
    ...(node.files ? { files: node.files } : {}),
  };
}

/** Pipeline configuration. */
export interface PipelineOptions {
  runtime: Runtime;
  resolver: RouteResolver;
  contextProvider?: ContextProvider;
  /** Pre-bundled module loaders (browser boot passes these). */
  moduleLoaders?: Record<string, () => Promise<unknown>>;
}

export class Pipeline {
  private readonly resolver: RouteResolver;
  private readonly runtime: Runtime;
  readonly contextProvider: ContextProvider | undefined;
  private readonly moduleLoaders: Record<string, () => Promise<unknown>>;
  private readonly moduleCache = new Map<string, unknown>();
  private readonly fileCache = new Map<string, string>();

  constructor(options: PipelineOptions) {
    this.resolver = options.resolver;
    this.runtime = options.runtime;
    this.contextProvider = options.contextProvider;
    this.moduleLoaders = options.moduleLoaders ?? {};
  }

  // ── Matching (thin wrappers around RouteResolver) ──────────────────

  match(url: URL): MatchedRoute | undefined {
    const resolved = this.resolver.match(url.pathname);
    if (resolved) {
      return { route: toRouteConfig(resolved), params: resolved.params };
    }
    if (url.pathname === '/' || url.pathname === '') {
      return { route: DEFAULT_ROOT_ROUTE, params: {} };
    }
    return undefined;
  }

  findRoute(pattern: string): RouteConfig | undefined {
    const node = this.resolver.findRoute(pattern);
    if (!node) return undefined;
    return {
      pattern,
      type: node.redirect ? 'redirect' : 'page',
      modulePath: node.redirect ?? node.files?.ts ?? node.files?.js ?? node.files?.html ?? node.files?.md ?? '',
      ...(node.files ? { files: node.files } : {}),
    };
  }

  findErrorBoundary(pathname: string): { pattern: string; modulePath: string } | undefined {
    const modulePath = this.resolver.findErrorBoundary(pathname);
    if (!modulePath) return undefined;
    return { pattern: pathname, modulePath };
  }

  getStatusPage(status: number): RouteConfig | undefined {
    const node = this.resolver.findRoute(`/${status}`);
    if (!node) return undefined;
    return {
      pattern: `/${status}`,
      type: 'page',
      modulePath: node.files?.ts ?? node.files?.js ?? node.files?.html ?? node.files?.md ?? '',
      ...(node.files ? { files: node.files } : {}),
    };
  }

  getErrorHandler(): RouteConfig | undefined {
    const modulePath = this.resolver.findErrorBoundary('/');
    if (!modulePath) return undefined;
    return { pattern: '/', type: 'error', modulePath };
  }

  // ── Route hierarchy ────────────────────────────────────────────────

  buildRouteHierarchy(pattern: string): string[] {
    if (pattern === '/') return ['/'];
    const segments = pattern.split('/').filter(Boolean);
    const hierarchy: string[] = ['/'];
    let current = '';
    for (const segment of segments) {
      current += '/' + segment;
      hierarchy.push(current);
    }
    return hierarchy;
  }

  // ── Module loading ─────────────────────────────────────────────────

  async loadModule<T>(modulePath: string): Promise<T> {
    const cached = this.moduleCache.get(modulePath);
    if (cached !== undefined) return cached as T;

    let mod: unknown;
    const loader = this.moduleLoaders[modulePath];
    if (loader) {
      mod = await loader();
    } else {
      const abs = modulePath.startsWith('/') ? modulePath : '/' + modulePath;
      mod = await this.runtime.loadModule(abs);
    }

    this.moduleCache.set(modulePath, mod);
    return mod as T;
  }

  /**
   * Get inlined `__files` from a cached module (merged module pattern).
   */
  getModuleFiles(modulePath: string): FileContents | undefined {
    const cached = this.moduleCache.get(modulePath);
    if (!cached || typeof cached !== 'object') return undefined;
    const files = (cached as Record<string, unknown>).__files;
    if (!files || typeof files !== 'object') return undefined;
    return files as FileContents;
  }

  // ── File loading ───────────────────────────────────────────────────

  async loadFiles(
    files: { html?: string; md?: string; css?: string },
  ): Promise<FileContents> {
    const load = async (path: string): Promise<string | undefined> => {
      const abs = path.startsWith('/') ? path : '/' + path;
      const cached = this.fileCache.get(abs);
      if (cached !== undefined) return cached;
      try {
        const content = await this.runtime.query(abs, { as: 'text' });
        this.fileCache.set(abs, content);
        return content;
      } catch (e) {
        console.warn(
          `[Pipeline] Failed to load file ${path}:`,
          e instanceof Error ? e.message : e,
        );
        return undefined;
      }
    };

    const [html, md, css] = await Promise.all([
      files.html ? load(files.html) : undefined,
      files.md ? load(files.md) : undefined,
      files.css ? load(files.css) : undefined,
    ]);

    const result: FileContents = {};
    if (html != null) result.html = html;
    if (md != null) result.md = md;
    if (css != null) result.css = css;
    return result;
  }

  // ── Context building ───────────────────────────────────────────────

  toRouteInfo(matched: MatchedRoute, url: URL): RouteInfo {
    return { url, params: matched.params };
  }

  async buildContext(
    routeInfo: RouteInfo,
    route: RouteConfig,
    signal?: AbortSignal,
    isLeaf?: boolean,
  ): Promise<ComponentContext> {
    const rf = route.files;
    const modulePath = rf?.ts ?? rf?.js;

    // Try inlined __files from merged module first
    const inlined = modulePath ? this.getModuleFiles(modulePath) : undefined;

    let files: FileContents;
    if (inlined) {
      files = inlined;
    } else if (rf) {
      const filePaths: { html?: string; md?: string; css?: string } = {};
      if (rf.html) filePaths.html = rf.html;
      if (rf.md) filePaths.md = rf.md;
      if (rf.css) filePaths.css = rf.css;
      files = await this.loadFiles(filePaths);
    } else {
      files = {};
    }

    const base: ComponentContext = {
      ...routeInfo,
      pathname: routeInfo.url.pathname,
      searchParams: routeInfo.url.searchParams,
      files,
      ...(signal ? { signal } : {}),
      ...(isLeaf != null ? { isLeaf } : {}),
    };
    return this.contextProvider ? this.contextProvider(base) : base;
  }
}
