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
import defaultPageComponent, { type PageComponent } from '../../component/page.component.ts';
import {
  assertSafeRedirect,
  DEFAULT_ROOT_ROUTE,
  RouteCore,
  type RouteCoreOptions,
  stripSsrPrefix,
} from '../../route/route.core.ts';
import { toUrl } from '../../route/route.matcher.ts';
import type { WidgetRegistry } from '../../widget/widget.registry.ts';

/** Base options for SSR renderers */
export interface SsrRendererOptions extends RouteCoreOptions {
  /** Widget registry for server-side widget rendering */
  widgets?: WidgetRegistry;
  /** Discovered widget file paths (from discoverWidgetFiles), keyed by widget name */
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
  async render(url: string): Promise<{ content: string; status: number; title?: string }> {
    const urlObj = toUrl(url);
    let pathname = urlObj.pathname;

    pathname = stripSsrPrefix(pathname);

    const matchUrl = toUrl(pathname + urlObj.search);
    const matched = this.core.match(matchUrl);

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
        try {
          const module = await this.core.loadModule<{ default: PageComponent }>(
            boundary.modulePath,
          );
          const component = module.default;
          const data = await component.getData({ params: {} });
          const content = this.renderComponent(component, data);
          return { content, status: 500 };
        } catch (e) {
          logger.error(
            `[${this.label}] Error boundary failed for ${pathname}`,
            e instanceof Error ? e : undefined,
          );
        }
      }

      const errorHandler = this.core.matcher.getErrorHandler();
      if (errorHandler) {
        try {
          const module = await this.core.loadModule<{ default: PageComponent }>(
            errorHandler.modulePath,
          );
          const component = module.default;
          const data = await component.getData({ params: {} });
          const content = this.renderComponent(component, data);
          return { content, status: 500 };
        } catch (e) {
          logger.error(
            `[${this.label}] Error handler failed for ${pathname}`,
            e instanceof Error ? e : undefined,
          );
        }
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

    for (let i = 0; i < hierarchy.length; i++) {
      const routePattern = hierarchy[i];
      let route = this.core.matcher.findRoute(routePattern);

      if (!route && routePattern === '/') {
        route = DEFAULT_ROOT_ROUTE;
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
        result = this.injectSlot(result, content);
      }
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

  /** Render a component for error boundary/handler (no params or context). */
  protected renderComponent(component: PageComponent, data: unknown): string {
    return this.renderContent(component, { data, params: {} });
  }

  /**
   * Recursively resolve widgets in content with depth limit.
   *
   * Generic helper for both HTML and Markdown widget resolution.
   * Supports nested widgets by recursively processing rendered output.
   *
   * @param content - Content containing widgets
   * @param routeInfo - Route information for context
   * @param parseWidgets - Function to find widgets in content
   * @param resolveWidget - Function to resolve a single widget
   * @param replaceWidgets - Function to replace widgets with resolved content
   * @param depth - Current recursion depth (internal)
   * @returns Content with all widgets recursively resolved
   */
  protected async resolveWidgetsRecursively<TWidget>(
    content: string,
    routeInfo: RouteInfo,
    parseWidgets: (content: string) => TWidget[],
    resolveWidget: (
      widget: TWidget,
      routeInfo: RouteInfo,
    ) => Promise<string>,
    replaceWidgets: (content: string, replacements: Map<TWidget, string>) => string,
    depth = 0,
  ): Promise<string> {
    const MAX_WIDGET_DEPTH = 10;

    // Safety check for recursion depth
    if (depth >= MAX_WIDGET_DEPTH) {
      logger.warn(
        `[${this.label}] Widget nesting depth limit reached (${MAX_WIDGET_DEPTH}). ` +
          'Possible circular dependency or excessive nesting.',
      );
      return content;
    }

    const widgets = parseWidgets(content);
    if (widgets.length === 0) return content;

    // Resolve all widgets at this depth concurrently
    const replacements = new Map<TWidget, string>();
    await Promise.all(
      widgets.map(async (widget) => {
        let rendered = await resolveWidget(widget, routeInfo);

        // Recursively resolve any nested widgets in the rendered output
        rendered = await this.resolveWidgetsRecursively(
          rendered,
          routeInfo,
          parseWidgets,
          resolveWidget,
          replaceWidgets,
          depth + 1,
        );

        replacements.set(widget, rendered);
      }),
    );

    return replaceWidgets(content, replacements);
  }

  protected abstract renderRedirect(to: string): string;

  protected abstract renderStatusPage(status: number, pathname: string): string;

  protected abstract renderErrorPage(error: unknown, pathname: string): string;

  /** Inject child content into the first slot of a parent string. */
  protected abstract injectSlot(parent: string, child: string): string;

  /** Strip all unconsumed slot placeholders from the final result. */
  protected abstract stripSlots(result: string): string;
}
