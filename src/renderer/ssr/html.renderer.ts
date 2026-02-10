/**
 * SSR HTML Renderer
 *
 * Server-side HTML rendering.
 * Generates complete HTML strings without DOM manipulation.
 * Expands <mark-down> tags server-side when a markdown renderer is provided.
 */

import type {
  MatchedRoute,
  RouteConfig,
  RouteParams,
  RoutesManifest,
} from '../../type/route.type.ts';
import type { PageComponent } from '../../component/abstract.component.ts';
import type { MarkdownRenderer } from '../../type/markdown.type.ts';
import { default as defaultPageComponent } from '../../component/page.component.ts';
import {
  DEFAULT_ROOT_ROUTE,
  RouteCore,
  type RouteCoreOptions,
  stripSsrPrefix,
  toUrl,
} from '../../route/route.core.ts';
import { escapeHtml, STATUS_MESSAGES, unescapeHtml } from '../../util/html.util.ts';
import { processFencedSlots, processFencedWidgets } from '../../util/fenced-block.util.ts';
import { resolveWidgetTags } from '../../util/widget-resolve.util.ts';
import type { WidgetRegistry } from '../../widget/widget.registry.ts';

/** Options for SSR HTML Router */
export interface SsrHtmlRouterOptions extends RouteCoreOptions {
  /** Markdown renderer for server-side <mark-down> expansion */
  markdownRenderer?: MarkdownRenderer;
  /** Widget registry for server-side widget rendering */
  widgets?: WidgetRegistry;
}

/**
 * SSR HTML Router for server-side rendering.
 */
export class SsrHtmlRouter {
  private core: RouteCore;
  private markdownRenderer: MarkdownRenderer | null;
  private markdownReady: Promise<void> | null = null;
  private widgets: WidgetRegistry | null;

  constructor(manifest: RoutesManifest, options: SsrHtmlRouterOptions = {}) {
    this.core = new RouteCore(manifest, options);
    this.markdownRenderer = options.markdownRenderer ?? null;
    this.widgets = options.widgets ?? null;

    if (this.markdownRenderer?.init) {
      this.markdownReady = this.markdownRenderer.init();
    }
  }

  /**
   * Render a URL to HTML string.
   */
  async render(url: string): Promise<{ html: string; status: number; title?: string }> {
    const urlObj = toUrl(url);
    let pathname = urlObj.pathname;

    pathname = stripSsrPrefix(pathname);

    const matchUrl = toUrl(pathname + urlObj.search);
    const matched = this.core.match(matchUrl);

    if (!matched) {
      const statusPage = this.core.matcher.getStatusPage(404);
      if (statusPage) {
        try {
          const { html, title } = await this.renderRouteContent(statusPage, {}, pathname);
          return { html, status: 404, title };
        } catch { /* fall through to inline fallback */ }
      }
      return { html: this.renderStatusPage(404, pathname), status: 404 };
    }

    // Handle redirect
    if (matched.route.type === 'redirect') {
      const module = await this.core.loadModule<{ default: { to: string; status?: number } }>(
        matched.route.modulePath,
      );
      const redirectConfig = module.default;
      return {
        html: `<meta http-equiv="refresh" content="0;url=${escapeHtml(redirectConfig.to)}">`,
        status: redirectConfig.status ?? 301,
      };
    }

    try {
      const { html, title } = await this.renderPage(matched);
      return { html, status: 200, title };
    } catch (error) {
      if (error instanceof Response) {
        const statusPage = this.core.matcher.getStatusPage(error.status);
        if (statusPage) {
          try {
            const { html, title } = await this.renderRouteContent(statusPage, {}, pathname);
            return { html, status: error.status, title };
          } catch { /* fall through to inline fallback */ }
        }
        return { html: this.renderStatusPage(error.status, pathname), status: error.status };
      }
      return { html: this.renderErrorPage(error, pathname), status: 500 };
    }
  }

  /**
   * Render a matched page to HTML.
   */
  private async renderPage(matched: MatchedRoute): Promise<{ html: string; title?: string }> {
    const pathname = matched.route.pattern;
    const hierarchy = this.core.buildRouteHierarchy(pathname);

    let result = '';
    let pageTitle: string | undefined;

    for (const routePattern of hierarchy) {
      let route = this.core.matcher.findRoute(routePattern);

      if (!route && routePattern === '/') {
        route = DEFAULT_ROOT_ROUTE;
      }

      if (!route) continue;

      // Skip wildcard route appearing as its own parent (prevents double-render)
      if (route === matched.route && routePattern !== matched.route.pattern) continue;

      const { html, title } = await this.renderRouteContent(
        route,
        matched.params,
        pathname,
        matched.searchParams,
      );

      if (title) {
        pageTitle = title;
      }

      if (result === '') {
        result = html;
      } else {
        // Inject into slot
        result = result.replace(/<router-slot[^>]*><\/router-slot>/, html);
      }
    }

    return { html: result, title: pageTitle };
  }

  /**
   * Render a single route's content.
   */
  private async renderRouteContent(
    route: RouteConfig,
    params: RouteParams,
    leafPathname?: string,
    searchParams?: URLSearchParams,
  ): Promise<{ html: string; title?: string }> {
    if (route.modulePath === DEFAULT_ROOT_ROUTE.modulePath) {
      return { html: '<router-slot></router-slot>' };
    }

    const files = route.files ?? {};

    const tsModule = files.ts;
    const component: PageComponent = tsModule
      ? (await this.core.loadModule<{ default: PageComponent }>(tsModule)).default
      : defaultPageComponent;

    const context = await this.core.buildComponentContext(
      route.pattern,
      route,
      params,
      searchParams,
    );
    const data = await component.getData({ params, context });
    let html = component.renderHTML({ data, params, context });
    const title = component.getTitle({ data, params, context });

    // Expand <mark-down> tags server-side
    html = await this.expandMarkdown(html);

    // Resolve <widget-*> tags: call getData() + renderHTML(), inject data-ssr
    // Use the leaf pathname so widgets in parent layouts see the actual target route
    if (this.widgets) {
      html = await resolveWidgetTags(
        html,
        this.widgets,
        leafPathname ?? route.pattern,
        params,
        this.core.loadWidgetFiles.bind(this.core),
      );
    }

    return { html, title };
  }

  /**
   * Expand <mark-down> tags by rendering markdown to HTML server-side.
   * Leaves content unchanged if no markdown renderer is configured.
   */
  private async expandMarkdown(html: string): Promise<string> {
    if (!this.markdownRenderer) return html;
    if (!html.includes('<mark-down>')) return html;

    if (this.markdownReady) {
      await this.markdownReady;
    }

    const renderer = this.markdownRenderer;

    // Match <mark-down>escaped content</mark-down>
    const pattern = /<mark-down>([\s\S]*?)<\/mark-down>/g;

    return html.replace(pattern, (_match, escaped: string) => {
      const markdown = unescapeHtml(escaped);
      let rendered = renderer.render(markdown);
      rendered = processFencedSlots(rendered, unescapeHtml);
      rendered = processFencedWidgets(rendered, unescapeHtml);
      return rendered;
    });
  }

  /**
   * Render a status page.
   */
  private renderStatusPage(status: number, pathname: string): string {
    return `
      <h1>${STATUS_MESSAGES[status] ?? 'Error'}</h1>
      <p>Path: ${escapeHtml(pathname)}</p>
    `;
  }

  /**
   * Render an error page.
   */
  private renderErrorPage(error: unknown, pathname: string): string {
    const message = error instanceof Error ? error.message : String(error);
    return `
      <h1>Error</h1>
      <p>Path: ${escapeHtml(pathname)}</p>
      <p>${escapeHtml(message)}</p>
    `;
  }
}

/**
 * Create SSR HTML router.
 */
export function createSsrHtmlRouter(
  manifest: RoutesManifest,
  options?: SsrHtmlRouterOptions,
): SsrHtmlRouter {
  return new SsrHtmlRouter(manifest, options);
}
