/**
 * SSR Renderer Base
 *
 * Abstract base class for server-side renderers.
 * Provides the shared render() pipeline; subclasses supply format-specific rendering.
 */

import type {
  MatchedRoute,
  RouteConfig,
  RouteInfo,
  RoutesManifest,
} from '../../type/route.type.ts';
import { logger } from '../../type/logger.type.ts';
import type { ComponentContext } from '../../component/abstract.component.ts';
import defaultPageComponent, { type PageComponent } from '../../component/page.component.ts';
import {
  assertSafeRedirect,
  DEFAULT_ROOT_ROUTE,
  RouteCore,
  type RouteCoreOptions,
} from '../../route/route.core.ts';
import { toUrl } from '../../route/route.matcher.ts';
import type { WidgetRegistry } from '../../widget/widget.registry.ts';

/** Base options for SSR renderers */
export interface SsrRendererOptions extends RouteCoreOptions {
  /** Widget registry for server-side widget rendering */
  widgets?: WidgetRegistry;
  /** Widget companion file paths, keyed by widget name */
  widgetFiles?: Record<string, { html?: string; md?: string; css?: string }>;
}

/**
 * Abstract SSR renderer with shared routing pipeline.
 */
export abstract class SsrRenderer {
  protected core: RouteCore;
  protected widgets: WidgetRegistry | null;
  protected widgetFiles: Record<string, { html?: string; md?: string; css?: string }>;
  protected abstract readonly label: string;

  constructor(manifest: RoutesManifest, options: SsrRendererOptions = {}) {
    this.core = new RouteCore(manifest, options);
    this.widgets = options.widgets ?? null;
    this.widgetFiles = options.widgetFiles ?? {};
  }

  /**
   * Render a URL to a content string.
   */
  async render(
    url: string,
  ): Promise<{ content: string; status: number; title?: string; redirect?: string }> {
    const urlObj = toUrl(url);
    const pathname = urlObj.pathname;

    // Redirect trailing-slash URLs to canonical form (301)
    const normalized = this.core.normalizeUrl(pathname);
    if (normalized !== pathname) {
      const query = urlObj.search || '';
      return { content: '', status: 301, redirect: normalized + query };
    }

    const matched = this.core.match(urlObj);

    const searchParams = urlObj.searchParams ?? new URLSearchParams();

    if (!matched) {
      const statusPage = this.core.matcher.getStatusPage(404);
      if (statusPage) {
        try {
          const ri: RouteInfo = { pathname, pattern: statusPage.pattern, params: {}, searchParams };
          const result = await this.renderRouteContent(ri, statusPage);
          return { content: this.stripSlots(result.content), status: 404, title: result.title };
        } catch (e) {
          logger.error(
            `[${this.label}] Failed to render 404 status page for ${pathname}`,
            e instanceof Error ? e : undefined,
          );
        }
      }
      return { content: this.renderStatusPage(404, pathname), status: 404 };
    }

    // Handle redirect
    if (matched.route.type === 'redirect') {
      const module = await this.core.loadModule<{ default: { to: string; status?: number } }>(
        matched.route.modulePath,
      );
      const redirectConfig = module.default;
      assertSafeRedirect(redirectConfig.to);
      return {
        content: this.renderRedirect(redirectConfig.to),
        status: redirectConfig.status ?? 301,
      };
    }

    const routeInfo = this.core.toRouteInfo(matched, pathname);

    try {
      const { content, title } = await this.renderPage(routeInfo, matched);
      return { content, status: 200, title };
    } catch (error) {
      if (error instanceof Response) {
        const statusPage = this.core.matcher.getStatusPage(error.status);
        if (statusPage) {
          try {
            const ri: RouteInfo = {
              pathname,
              pattern: statusPage.pattern,
              params: {},
              searchParams,
            };
            const result = await this.renderRouteContent(ri, statusPage);
            return {
              content: this.stripSlots(result.content),
              status: error.status,
              title: result.title,
            };
          } catch (e) {
            logger.error(
              `[${this.label}] Failed to render ${error.status} status page for ${pathname}`,
              e instanceof Error ? e : undefined,
            );
          }
        }
        return { content: this.renderStatusPage(error.status, pathname), status: error.status };
      }
      logger.error(
        `[${this.label}] Error rendering ${pathname}:`,
        error instanceof Error ? error : undefined,
      );

      const boundary = this.core.matcher.findErrorBoundary(pathname);
      if (boundary) {
        const result = await this.tryRenderErrorModule(boundary.modulePath, pathname, 'boundary');
        if (result) return result;
      }

      const errorHandler = this.core.matcher.getErrorHandler();
      if (errorHandler) {
        const result = await this.tryRenderErrorModule(errorHandler.modulePath, pathname, 'handler');
        if (result) return result;
      }

      return { content: this.renderErrorPage(error, pathname), status: 500 };
    }
  }

  /**
   * Render a matched page by composing the route hierarchy.
   */
  protected async renderPage(
    routeInfo: RouteInfo,
    matched: MatchedRoute,
  ): Promise<{ content: string; title?: string }> {
    const hierarchy = this.core.buildRouteHierarchy(routeInfo.pattern);

    let result = '';
    let pageTitle: string | undefined;
    let lastRenderedPattern = '';

    for (let i = 0; i < hierarchy.length; i++) {
      const routePattern = hierarchy[i];
      let route = this.core.matcher.findRoute(routePattern);

      if (!route && routePattern === this.core.root) {
        route = { ...DEFAULT_ROOT_ROUTE, pattern: this.core.root };
      }

      if (!route) continue;

      // Skip wildcard route appearing as its own parent (prevents double-render)
      if (route === matched.route && routePattern !== matched.route.pattern) continue;

      const isLeaf = i === hierarchy.length - 1;
      const { content, title } = await this.renderRouteContent(routeInfo, route, isLeaf);

      if (title) {
        pageTitle = title;
      }

      if (result === '') {
        result = content;
      } else {
        const injected = this.injectSlot(result, content, lastRenderedPattern);
        if (injected === result) {
          logger.warn(
            `[${this.label}] Route "${lastRenderedPattern}" has no <router-slot> ` +
              `for child route "${routePattern}" to render into. ` +
              `Add <router-slot></router-slot> to the parent template.`,
          );
        }
        result = injected;
      }

      lastRenderedPattern = route.pattern;
    }

    result = this.stripSlots(result);

    return { content: result, title: pageTitle };
  }

  protected abstract renderRouteContent(
    routeInfo: RouteInfo,
    route: RouteConfig,
    isLeaf?: boolean,
  ): Promise<{ content: string; title?: string }>;

  /** Load component, build context, get data, render content, get title. */
  protected async loadRouteContent(
    routeInfo: RouteInfo,
    route: RouteConfig,
    isLeaf?: boolean,
  ): Promise<{ content: string; title?: string }> {
    const files = route.files ?? {};

    const tsModule = files.ts;
    const component: PageComponent = tsModule
      ? (await this.core.loadModule<{ default: PageComponent }>(tsModule)).default
      : defaultPageComponent;

    const context = await this.core.buildComponentContext(routeInfo, route, undefined, isLeaf);
    const data = await component.getData({ params: routeInfo.params, context });
    const content = this.renderContent(component, { data, params: routeInfo.params, context });
    const title = component.getTitle({ data, params: routeInfo.params, context });

    return { content, title };
  }

  /** Render a component to the output format (HTML or Markdown). */
  protected abstract renderContent(
    component: PageComponent,
    args: PageComponent['RenderArgs'],
  ): string;

  /** Render a component for error boundary/handler with minimal context. */
  protected renderComponent(
    component: PageComponent,
    data: unknown,
    context: ComponentContext,
  ): string {
    return this.renderContent(component, { data, params: {}, context });
  }

  /** Try to load and render an error boundary or handler module. Returns null on failure. */
  private async tryRenderErrorModule(
    modulePath: string,
    pathname: string,
    kind: 'boundary' | 'handler',
  ): Promise<{ content: string; status: number } | null> {
    try {
      const module = await this.core.loadModule<{ default: PageComponent }>(modulePath);
      const component = module.default;
      const minCtx: ComponentContext = {
        pathname: '',
        pattern: '',
        params: {},
        searchParams: new URLSearchParams(),
      };
      const data = await component.getData({ params: {}, context: minCtx });
      const content = this.renderComponent(component, data, minCtx);
      return { content, status: 500 };
    } catch (e) {
      logger.error(
        `[${this.label}] Error ${kind} failed for ${pathname}`,
        e instanceof Error ? e : undefined,
      );
      return null;
    }
  }

  protected abstract renderRedirect(to: string): string;

  protected abstract renderStatusPage(status: number, pathname: string): string;

  protected abstract renderErrorPage(error: unknown, pathname: string): string;

  /** Inject child content into the slot owned by parentPattern. */
  protected abstract injectSlot(parent: string, child: string, parentPattern: string): string;

  /** Strip all unconsumed slot placeholders from the final result. */
  protected abstract stripSlots(result: string): string;
}
