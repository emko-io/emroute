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
} from '../type/route.type.ts';
import type { ComponentContext } from '../type/component.type.ts';
import type { Logger } from '../type/logger.type.ts';
import defaultPageComponent, { type PageComponent } from '../component/page.component.ts';
import { DEFAULT_ROOT_ROUTE, type Pipeline } from '../pipeline/pipeline.ts';
import { assertSafeRedirect } from '../util/html.util.ts';
import type { WidgetRegistry } from '../widget/widget.registry.ts';

/** Options for SSR renderers. */
export interface SsrRendererOptions {
  widgets?: WidgetRegistry;
}

/**
 * Abstract SSR renderer with shared routing pipeline.
 */
export abstract class SsrRenderer {
  protected readonly pipeline: Pipeline;
  protected widgets: WidgetRegistry | null;
  protected abstract readonly label: string;

  protected readonly logger: Logger;

  constructor(pipeline: Pipeline, options: SsrRendererOptions = {}) {
    this.pipeline = pipeline;
    this.logger = pipeline.logger;
    this.widgets = options.widgets ?? null;
  }

  /**
   * Render a URL to a content string.
   */
  async render(
    url: URL,
    signal?: AbortSignal,
  ): Promise<{ content: string; status: number; title?: string; redirect?: string }> {
    const matched = await this.pipeline.match(url);

    if (!matched) {
      const statusPage = await this.pipeline.getStatusPage(404);
      if (statusPage) {
        try {
          const ri: RouteInfo = { url, params: {} };
          const result = await this.renderRouteContent(ri, statusPage, undefined, signal);
          return { content: this.stripSlots(result.content), status: 404, ...(result.title !== undefined ? { title: result.title } : {}) };
        } catch (e) {
          this.logger.error(
            `[${this.label}] Failed to render 404 status page for ${url.pathname}`,
            e instanceof Error ? e : undefined,
          );
        }
      }
      return { content: this.renderStatusPage(404, url), status: 404 };
    }

    // Handle redirect
    if (matched.route.type === 'redirect') {
      const module = await this.pipeline.loadModule<{ default: { to: string; status?: number } }>(
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

    const routeInfo = this.pipeline.toRouteInfo(matched, url);

    try {
      const { content, title } = await this.renderPage(routeInfo, matched, signal);
      return { content, status: 200, ...(title !== undefined ? { title } : {}) };
    } catch (error) {
      if (error instanceof Response) {
        const statusPage = await this.pipeline.getStatusPage(error.status);
        if (statusPage) {
          try {
            const ri: RouteInfo = { url, params: {} };
            const result = await this.renderRouteContent(ri, statusPage, undefined, signal);
            return {
              content: this.stripSlots(result.content),
              status: error.status,
              ...(result.title !== undefined ? { title: result.title } : {}),
            };
          } catch (e) {
            this.logger.error(
              `[${this.label}] Failed to render ${error.status} status page for ${url.pathname}`,
              e instanceof Error ? e : undefined,
            );
          }
        }
        return { content: this.renderStatusPage(error.status, url), status: error.status };
      }
      this.logger.error(
        `[${this.label}] Error rendering ${url.pathname}:`,
        error instanceof Error ? error : undefined,
      );

      const boundary = await this.pipeline.findErrorBoundary(url.pathname);
      if (boundary) {
        const result = await this.tryRenderErrorModule(boundary.modulePath, url, 'boundary');
        if (result) return result;
      }

      const errorHandler = await this.pipeline.getErrorHandler();
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
    const hierarchy = this.pipeline.buildRouteHierarchy(matched.route.pattern);

    const segments: { route: RouteConfig; isLeaf: boolean }[] = [];
    for (let i = 0; i < hierarchy.length; i++) {
      const routePattern = hierarchy[i]!;
      let route = await this.pipeline.findRoute(routePattern);

      if (!route && routePattern === '/') {
        route = DEFAULT_ROOT_ROUTE;
      }

      if (!route) continue;
      if (route === matched.route && routePattern !== matched.route.pattern) continue;

      segments.push({ route, isLeaf: i === hierarchy.length - 1 });
    }

    const results = await Promise.all(
      segments.map(({ route, isLeaf }) =>
        this.renderRouteContent(routeInfo, route, isLeaf, signal),
      ),
    );

    let result = '';
    let pageTitle: string | undefined;
    let lastRenderedPattern = '';

    for (let i = 0; i < segments.length; i++) {
      const { content, title } = results[i]!;

      if (title) {
        pageTitle = title;
      }

      if (result === '') {
        result = content;
      } else {
        const injected = this.injectSlot(result, content, lastRenderedPattern);
        if (injected === result) {
          this.logger.warn(
            `[${this.label}] Route "${lastRenderedPattern}" has no <router-slot> ` +
              `for child route "${hierarchy[i]}" to render into. ` +
              `Add <router-slot></router-slot> to the parent template.`,
          );
        }
        result = injected;
      }

      lastRenderedPattern = segments[i]!.route.pattern;
    }

    result = this.stripSlots(result);

    return { content: result, ...(pageTitle !== undefined ? { title: pageTitle } : {}) };
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

    const tsModule = files.ts ?? files.js;
    const loadedModule = tsModule
      ? await this.pipeline.loadModule<{ default: PageComponent }>(tsModule)
      : undefined;
    const component: PageComponent = loadedModule?.default ?? defaultPageComponent;

    const context = await this.pipeline.buildContext(routeInfo, route, signal, isLeaf, loadedModule);
    const data = await component.getData({ params: routeInfo.params, ...(signal ? { signal } : {}), context });
    const content = this.renderContent(component, { data, params: routeInfo.params, context });
    const title = component.getTitle({ data, params: routeInfo.params, context });

    return { content, ...(title !== undefined ? { title } : {}) };
  }

  protected abstract renderContent(
    component: PageComponent,
    args: PageComponent['RenderArgs'],
  ): string;

  protected renderComponent(
    component: PageComponent,
    data: unknown,
    context: ComponentContext,
  ): string {
    return this.renderContent(component, { data, params: {}, context });
  }

  private static readonly EMPTY_URL = new URL('http://error');

  private async tryRenderErrorModule(
    modulePath: string,
    url: URL,
    kind: 'boundary' | 'handler',
  ): Promise<{ content: string; status: number } | null> {
    try {
      const module = await this.pipeline.loadModule<{ default: PageComponent }>(modulePath);
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
      this.logger.error(
        `[${this.label}] Error ${kind} failed for ${url.pathname}`,
        e instanceof Error ? e : undefined,
      );
      return null;
    }
  }

  protected abstract renderRedirect(to: string): string;

  protected abstract renderStatusPage(status: number, url: URL): string;

  protected abstract renderErrorPage(error: unknown, url: URL): string;

  protected abstract injectSlot(parent: string, child: string, parentPattern: string): string;

  protected abstract stripSlots(result: string): string;
}
