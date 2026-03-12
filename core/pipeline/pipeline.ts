/**
 * Pipeline
 *
 * Orchestration layer between Router, Runtime, and Component.
 *
 * Owns:
 * - Route matching (reads manifest from Runtime, walks RouteNode tree)
 * - Module loading (delegates to Runtime)
 * - Companion file reading (delegates to Runtime)
 * - ComponentContext building
 * - Route hierarchy construction
 *
 * Does NOT own:
 * - Rendering (that's Renderer)
 * - HTTP routing / base paths (that's Server)
 * - Storage I/O (that's Runtime)
 * - Navigation events (that's the browser adapter)
 */

import { RouteTrie } from '../router/route.trie.ts';
import type { RouteNode } from '../type/route-tree.type.ts';
import type { RouteConfig, MatchedRoute, RouteInfo } from '../type/route.type.ts';
import type { ComponentContext, ContextProvider, FileContents } from '../type/component.type.ts';
import type { Runtime } from '../runtime/abstract.runtime.ts';
import { ROUTES_MANIFEST_PATH, WIDGETS_MANIFEST_PATH } from '../runtime/abstract.runtime.ts';
import type { WidgetManifestEntry } from '../type/widget.type.ts';
import type { WidgetComponent } from '../component/widget.component.ts';
import { type Logger, defaultLogger } from '../type/logger.type.ts';

/** Default root route — renders a slot for child routes. */
export const DEFAULT_ROOT_ROUTE: RouteConfig = {
  pattern: '/',
  type: 'page',
  modulePath: '__default_root__',
};

/** Synthesize a RouteConfig from matched route data. */
function toRouteConfig(node: RouteNode, pattern: string): RouteConfig {
  return {
    pattern,
    type: node.redirect ? 'redirect' : 'page',
    modulePath: node.redirect ?? node.files?.ts ?? node.files?.js ?? node.files?.html ?? node.files?.md ?? '',
    ...(node.files ? { files: node.files } : {}),
  };
}

/** Pipeline configuration. */
export interface PipelineOptions {
  runtime: Runtime;
  contextProvider?: ContextProvider;
  /** Pre-bundled module loaders (browser boot passes these). */
  moduleLoaders?: Record<string, () => Promise<unknown>>;
  logger?: Logger;
}

export class Pipeline {
  private readonly runtime: Runtime;
  readonly contextProvider: ContextProvider | undefined;
  readonly logger: Logger;
  private readonly moduleLoaders: Record<string, () => Promise<unknown>>;

  constructor(options: PipelineOptions) {
    this.runtime = options.runtime;
    this.contextProvider = options.contextProvider;
    this.logger = options.logger ?? defaultLogger;
    this.moduleLoaders = options.moduleLoaders ?? {};
  }

  // ── Route resolver (from Runtime) ───────────────────────────────────

  private async getResolver(): Promise<RouteTrie> {
    const response = await this.runtime.query(ROUTES_MANIFEST_PATH);
    const tree: RouteNode = response.status === 404 ? {} : await response.json();
    return new RouteTrie(tree);
  }

  // ── Matching ────────────────────────────────────────────────────────

  async match(url: URL): Promise<MatchedRoute | undefined> {
    const resolver = await this.getResolver();
    const resolved = resolver.match(url.pathname);
    if (resolved) {
      return { route: toRouteConfig(resolved.node, resolved.pattern), params: resolved.params };
    }
    if (url.pathname === '/' || url.pathname === '') {
      return { route: DEFAULT_ROOT_ROUTE, params: {} };
    }
    return undefined;
  }

  async findRoute(pattern: string): Promise<RouteConfig | undefined> {
    const resolver = await this.getResolver();
    const node = resolver.findRoute(pattern);
    if (!node) return undefined;
    return toRouteConfig(node, pattern);
  }

  async findErrorBoundary(pathname: string): Promise<{ pattern: string; modulePath: string } | undefined> {
    const resolver = await this.getResolver();
    const modulePath = resolver.findErrorBoundary(pathname);
    if (!modulePath) return undefined;
    return { pattern: pathname, modulePath };
  }

  async getStatusPage(status: number): Promise<RouteConfig | undefined> {
    const resolver = await this.getResolver();
    const node = resolver.findRoute(`/${status}`);
    if (!node) return undefined;
    return toRouteConfig(node, `/${status}`);
  }

  async getErrorHandler(): Promise<RouteConfig | undefined> {
    const resolver = await this.getResolver();
    const modulePath = resolver.findErrorBoundary('/');
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

  // ── Widget manifest lookup ─────────────────────────────────────────

  async findWidgetModulePath(name: string): Promise<string | undefined> {
    const response = await this.runtime.query(WIDGETS_MANIFEST_PATH);
    if (response.status === 404) return undefined;
    const entries: WidgetManifestEntry[] = await response.json();
    return entries.find((e) => e.name === name)?.modulePath;
  }

  /** Load a widget module by name — single load yields both component and files. */
  async loadWidgetModule(name: string): Promise<{ component: WidgetComponent; files: FileContents } | undefined> {
    const path = await this.findWidgetModulePath(name);
    if (!path) return undefined;
    const mod = await this.loadModule<Record<string, unknown>>(path);
    const component = this.extractWidgetComponent(mod);
    if (!component) return undefined;
    return { component, files: this.getModuleFiles(mod) ?? {} };
  }

  /** Load a widget by name — shorthand when only the component is needed. */
  async loadWidget(name: string): Promise<WidgetComponent | undefined> {
    return (await this.loadWidgetModule(name))?.component;
  }

  /** Extract a WidgetComponent from a loaded module's exports. */
  private extractWidgetComponent(mod: Record<string, unknown>): WidgetComponent | undefined {
    for (const value of Object.values(mod)) {
      if (!value) continue;
      if (typeof value === 'object' && 'getData' in value) {
        return value as WidgetComponent;
      }
      if (typeof value === 'function' && value.prototype?.getData) {
        return new (value as new () => WidgetComponent)();
      }
    }
    return undefined;
  }

  // ── Module loading ─────────────────────────────────────────────────

  async loadModule<T>(modulePath: string): Promise<T> {
    const loader = this.moduleLoaders[modulePath];
    if (loader) {
      return await loader() as T;
    }
    const abs = modulePath.startsWith('/') ? modulePath : '/' + modulePath;
    return await this.runtime.loadModule(abs) as T;
  }

  /**
   * Get inlined `__files` from a loaded module (merged module pattern).
   */
  getModuleFiles(mod: unknown): FileContents | undefined {
    if (!mod || typeof mod !== 'object') return undefined;
    const files = (mod as Record<string, unknown>).__files;
    if (!files || typeof files !== 'object') return undefined;
    return files as FileContents;
  }

  // ── File loading ───────────────────────────────────────────────────

  async loadFiles(
    files: { html?: string; md?: string; css?: string },
  ): Promise<FileContents> {
    const load = async (path: string): Promise<string | undefined> => {
      const abs = path.startsWith('/') ? path : '/' + path;
      try {
        return await this.runtime.query(abs, { as: 'text' });
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
    if (html !== undefined) result.html = html;
    if (md !== undefined) result.md = md;
    if (css !== undefined) result.css = css;
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
    loadedModule?: unknown,
  ): Promise<ComponentContext> {
    const rf = route.files;

    // Try inlined __files from merged module first
    const inlined = loadedModule ? this.getModuleFiles(loadedModule) : undefined;

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
      ...(isLeaf !== undefined ? { isLeaf } : {}),
    };
    return this.contextProvider ? this.contextProvider(base) : base;
  }
}
