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
import type { RouteResolver } from '../../route/route.resolver.ts';
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

  constructor(resolver: RouteResolver, options: SsrRendererOptions = {}) {
    this.core = new RouteCore(resolver, options);
    this.widgets = options.widgets ?? null;
    this.widgetFiles = options.widgetFiles ?? {};
  }

  /**
   * Render a URL to a content string.
   */
  async render(
    url: URL,
    signal?: AbortSignal,
  ): Promise<{ content: string; status: number; title?: string; redirect?: string }> {
    const matched = this.core.match(url);

    if (!matched) {
      const statusPage = this.core.getStatusPage(404);
      if (statusPage) {
        try {
          const ri: RouteInfo = { url, params: {} };
          const result = await this.renderRouteContent(ri, statusPage, undefined, signal);
          return { content: this.stripSlots(result.content), status: 404, title: result.title };
        } catch (e) {
          logger.error(
            `[${this.label}] Failed to render 404 status page for ${url.pathname}`,
            e instanceof Error ? e : undefined,
          );
        }
      }
      return { content: this.renderStatusPage(404, url), status: 404 };
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
        redirect: redirectConfig.to,
      };
    }

    const routeInfo = this.core.toRouteInfo(matched, url);

    try {
      const { content, title } = await this.renderPage(routeInfo, matched, signal);
      return { content, status: 200, title };
    } catch (error) {
      if (error instanceof Response) {
        const statusPage = this.core.getStatusPage(error.status);
        if (statusPage) {
          try {
            const ri: RouteInfo = { url, params: {} };
            const result = await this.renderRouteContent(ri, statusPage, undefined, signal);
            return {
              content: this.stripSlots(result.content),
              status: error.status,
              title: result.title,
            };
          } catch (e) {
            logger.error(
              `[${this.label}] Failed to render ${error.status} status page for ${url.pathname}`,
              e instanceof Error ? e : undefined,
            );
          }
        }
        return { content: this.renderStatusPage(error.status, url), status: error.status };
      }
      logger.error(
        `[${this.label}] Error rendering ${url.pathname}:`,
        error instanceof Error ? error : undefined,
      );

      const boundary = this.core.findErrorBoundary(url.pathname);
      if (boundary) {
        const result = await this.tryRenderErrorModule(boundary.modulePath, url, 'boundary');
        if (result) return result;
      }

      const errorHandler = this.core.getErrorHandler();
      if (errorHandler) {
        const result = await this.tryRenderErrorModule(errorHandler.modulePath, url, 'handler');
        if (result) return result;
      }

      return { content: this.renderErrorPage(error, url), status: 500 };
    }
  }

  /**
   * Render a matched page by composing the route hierarchy.
   */
  protected async renderPage(
    routeInfo: RouteInfo,
    matched: MatchedRoute,
    signal?: AbortSignal,
  ): Promise<{ content: string; title?: string }> {
    const hierarchy = this.core.buildRouteHierarchy(matched.route.pattern);

    // Resolve routes for each hierarchy segment (skip missing / duplicate wildcard)
    const segments: { route: RouteConfig; isLeaf: boolean }[] = [];
    for (let i = 0; i < hierarchy.length; i++) {
      const routePattern = hierarchy[i];
      let route = this.core.findRoute(routePattern);

      if (!route && routePattern === '/') {
        route = DEFAULT_ROOT_ROUTE;
      }

      if (!route) continue;
      if (route === matched.route && routePattern !== matched.route.pattern) continue;

      segments.push({ route, isLeaf: i === hierarchy.length - 1 });
    }

    // Fire all renderRouteContent calls in parallel
    const results = await Promise.all(
      segments.map(({ route, isLeaf }) =>
        this.renderRouteContent(routeInfo, route, isLeaf, signal),
      ),
    );

    // Sequential slot injection
    let result = '';
    let pageTitle: string | undefined;
    let lastRenderedPattern = '';

    for (let i = 0; i < segments.length; i++) {
      const { content, title } = results[i];

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
              `for child route "${hierarchy[i]}" to render into. ` +
              `Add <router-slot></router-slot> to the parent template.`,
          );
        }
        result = injected;
      }

      lastRenderedPattern = segments[i].route.pattern;
    }

    result = this.stripSlots(result);

    return { content: result, title: pageTitle };
  }

  protected abstract renderRouteContent(
    routeInfo: RouteInfo,
    route: RouteConfig,
    isLeaf?: boolean,
    signal?: AbortSignal,
  ): Promise<{ content: string; title?: string }>;

  /** Load component, build context, get data, render content, get title. */
  protected async loadRouteContent(
    routeInfo: RouteInfo,
    route: RouteConfig,
    isLeaf?: boolean,
    signal?: AbortSignal,
  ): Promise<{ content: string; title?: string }> {
    const files = route.files ?? {};

    const tsModule = files.ts;
    const component: PageComponent = tsModule
      ? (await this.core.loadModule<{ default: PageComponent }>(tsModule)).default
      : defaultPageComponent;

    const context = await this.core.buildComponentContext(routeInfo, route, signal, isLeaf);
    const data = await component.getData({ params: routeInfo.params, signal, context });
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

  private static readonly EMPTY_URL = new URL('http://error');

  /** Try to load and render an error boundary or handler module. Returns null on failure. */
  private async tryRenderErrorModule(
    modulePath: string,
    url: URL,
    kind: 'boundary' | 'handler',
  ): Promise<{ content: string; status: number } | null> {
    try {
      const module = await this.core.loadModule<{ default: PageComponent }>(modulePath);
      const component = module.default;
      const minCtx: ComponentContext = {
        url: SsrRenderer.EMPTY_URL,
        params: {},
        pathname: '',
        searchParams: new URLSearchParams(),
      };
      const data = await component.getData({ params: {}, context: minCtx });
      const content = this.renderComponent(component, data, minCtx);
      return { content, status: 500 };
    } catch (e) {
      logger.error(
        `[${this.label}] Error ${kind} failed for ${url.pathname}`,
        e instanceof Error ? e : undefined,
      );
      return null;
    }
  }

  protected abstract renderRedirect(to: string): string;

  protected abstract renderStatusPage(status: number, url: URL): string;

  protected abstract renderErrorPage(error: unknown, url: URL): string;

  /** Inject child content into the slot owned by parentPattern. */
  protected abstract injectSlot(parent: string, child: string, parentPattern: string): string;

  /** Strip all unconsumed slot placeholders from the final result. */
  protected abstract stripSlots(result: string): string;
}
