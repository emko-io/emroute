/**
 * SSR Markdown Renderer
 *
 * Server-side Markdown rendering.
 * Generates Markdown strings for LLM consumption, text clients, curl.
 */

import { logger } from '../../type/logger.type.ts';
import type {
  MatchedRoute,
  RouteConfig,
  RouteInfo,
  RoutesManifest,
} from '../../type/route.type.ts';
import defaultPageComponent, { type PageComponent } from '../../component/page.component.ts';
import {
  DEFAULT_ROOT_ROUTE,
  RouteCore,
  type RouteCoreOptions,
  stripSsrPrefix,
} from '../../route/route.core.ts';
import { toUrl } from '../../route/route.matcher.ts';
import { STATUS_MESSAGES } from '../../util/html.util.ts';
import { parseWidgetBlocks, replaceWidgetBlocks } from '../../widget/widget.parser.ts';
import type { WidgetRegistry } from '../../widget/widget.registry.ts';

const ROUTER_SLOT_BLOCK = '```\nrouter-slot\n```';

/** Options for SSR Markdown Router */
export interface SsrMdRouterOptions extends RouteCoreOptions {
  /** Widget registry for server-side widget rendering */
  widgets?: WidgetRegistry;
  /** Discovered widget file paths (from discoverWidgetFiles), keyed by widget name */
  widgetFiles?: Record<string, { html?: string; md?: string; css?: string }>;
}

/**
 * SSR Markdown Router for server-side markdown rendering.
 */
export class SsrMdRouter {
  private core: RouteCore;
  private widgets: WidgetRegistry | null;
  private widgetFiles: Record<string, { html?: string; md?: string; css?: string }>;

  constructor(manifest: RoutesManifest, options: SsrMdRouterOptions = {}) {
    this.core = new RouteCore(manifest, options);
    this.widgets = options.widgets ?? null;
    this.widgetFiles = options.widgetFiles ?? {};
  }

  /**
   * Render a URL to Markdown string.
   */
  async render(url: string): Promise<{ markdown: string; status: number }> {
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
          const markdown = await this.renderRouteContent(ri, statusPage);
          return { markdown, status: 404 };
        } catch (e) {
          logger.error(
            `[SSR MD] Failed to render 404 status page for ${pathname}`,
            e instanceof Error ? e : undefined,
          );
        }
      }
      return { markdown: this.renderStatusPage(404, pathname), status: 404 };
    }

    // Handle redirect
    if (matched.route.type === 'redirect') {
      const module = await this.core.loadModule<{ default: { to: string; status?: number } }>(
        matched.route.modulePath,
      );
      const redirectConfig = module.default;
      return {
        markdown: `Redirect to: ${redirectConfig.to}`,
        status: redirectConfig.status ?? 301,
      };
    }

    const routeInfo = this.core.toRouteInfo(matched, pathname);

    try {
      const markdown = await this.renderPage(routeInfo, matched);
      return { markdown, status: 200 };
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
            const markdown = await this.renderRouteContent(ri, statusPage);
            return { markdown, status: error.status };
          } catch (e) {
            logger.error(
              `[SSR MD] Failed to render ${error.status} status page for ${pathname}`,
              e instanceof Error ? e : undefined,
            );
          }
        }
        return { markdown: this.renderStatusPage(error.status, pathname), status: error.status };
      }
      logger.error(
        `[SSR MD] Error rendering ${pathname}:`,
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
          const markdown = component.renderMarkdown({ data, params: {} });
          return { markdown, status: 500 };
        } catch (e) {
          logger.error(
            `[SSR MD] Error boundary failed for ${pathname}`,
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
          const markdown = component.renderMarkdown({ data, params: {} });
          return { markdown, status: 500 };
        } catch (e) {
          logger.error(
            `[SSR MD] Error handler failed for ${pathname}`,
            e instanceof Error ? e : undefined,
          );
        }
      }

      return { markdown: this.renderErrorPage(error, pathname), status: 500 };
    }
  }

  /**
   * Render a matched page to Markdown.
   */
  private async renderPage(routeInfo: RouteInfo, matched: MatchedRoute): Promise<string> {
    const hierarchy = this.core.buildRouteHierarchy(routeInfo.pattern);

    const parts: string[] = [];

    for (const routePattern of hierarchy) {
      let route = this.core.matcher.findRoute(routePattern);

      if (!route && routePattern === '/') {
        route = DEFAULT_ROOT_ROUTE;
      }

      if (!route) continue;

      // Skip wildcard route appearing as its own parent (prevents double-render)
      if (route === matched.route && routePattern !== matched.route.pattern) continue;

      const markdown = await this.renderRouteContent(routeInfo, route);
      if (markdown) {
        parts.push(markdown);
      }
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Render a single route's content to Markdown.
   */
  private async renderRouteContent(
    routeInfo: RouteInfo,
    route: RouteConfig,
  ): Promise<string> {
    if (route.modulePath === DEFAULT_ROOT_ROUTE.modulePath) {
      return '';
    }

    const files = route.files ?? {};

    const component: PageComponent = files.ts
      ? (await this.core.loadModule<{ default: PageComponent }>(files.ts)).default
      : defaultPageComponent;

    const context = await this.core.buildComponentContext(routeInfo, route);
    const data = await component.getData({ params: routeInfo.params, context });
    let markdown = component.renderMarkdown({ data, params: routeInfo.params, context });

    // Resolve fenced widget blocks: call getData() + renderMarkdown()
    if (this.widgets) {
      markdown = await this.resolveWidgets(markdown, routeInfo);
    }

    if (markdown === ROUTER_SLOT_BLOCK) return '';

    return markdown;
  }

  /**
   * Resolve fenced widget blocks in markdown content.
   * Replaces ```widget:name blocks with rendered markdown output.
   */
  private async resolveWidgets(
    markdown: string,
    routeInfo: RouteInfo,
  ): Promise<string> {
    const blocks = parseWidgetBlocks(markdown);
    if (blocks.length === 0) return markdown;

    const replacements = new Map<(typeof blocks)[0], string>();

    await Promise.all(blocks.map(async (block) => {
      if (block.parseError || !block.params) {
        replacements.set(block, `> **Error** (\`${block.widgetName}\`): ${block.parseError}`);
        return;
      }

      const widget = this.widgets!.get(block.widgetName);
      if (!widget) {
        replacements.set(block, `> **Error**: Unknown widget \`${block.widgetName}\``);
        return;
      }

      try {
        // Load widget files: discovered (merged) first, then declared fallback
        let files: { html?: string; md?: string } | undefined;
        const filePaths = this.widgetFiles[block.widgetName] ?? widget.files;
        if (filePaths) {
          files = await this.core.loadWidgetFiles(filePaths);
        }

        const baseContext = { ...routeInfo, files };
        const context = this.core.contextProvider
          ? this.core.contextProvider(baseContext)
          : baseContext;
        const data = await widget.getData({ params: block.params, context });
        const rendered = widget.renderMarkdown({ data, params: block.params, context });
        replacements.set(block, rendered);
      } catch (e) {
        replacements.set(block, widget.renderMarkdownError(e));
      }
    }));

    return replaceWidgetBlocks(markdown, replacements);
  }

  /**
   * Render a status page as Markdown.
   */
  private renderStatusPage(status: number, pathname: string): string {
    return `# ${STATUS_MESSAGES[status] ?? 'Error'}\n\nPath: \`${pathname}\``;
  }

  /**
   * Render an error page as Markdown.
   */
  private renderErrorPage(_error: unknown, pathname: string): string {
    return `# Internal Server Error\n\nPath: \`${pathname}\``;
  }
}

/**
 * Create SSR Markdown router.
 */
export function createSsrMdRouter(
  manifest: RoutesManifest,
  options?: SsrMdRouterOptions,
): SsrMdRouter {
  return new SsrMdRouter(manifest, options);
}
