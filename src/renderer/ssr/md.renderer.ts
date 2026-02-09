/**
 * SSR Markdown Renderer
 *
 * Server-side Markdown rendering.
 * Generates Markdown strings for LLM consumption, text clients, curl.
 */

import type {
  MatchedRoute,
  RouteConfig,
  RouteParams,
  RoutesManifest,
} from '../../type/route.type.ts';
import type { PageComponent } from '../../component/abstract.component.ts';
import { default as defaultPageComponent } from '../../component/page.component.ts';
import {
  DEFAULT_ROOT_ROUTE,
  RouteCore,
  type RouteCoreOptions,
  SSR_MD_PREFIX,
  toUrl,
} from '../../route/route.core.ts';
import { STATUS_MESSAGES } from '../../util/html.util.ts';
import { parseWidgetBlocks, replaceWidgetBlocks } from '../../widget/widget.parser.ts';
import type { WidgetRegistry } from '../../widget/widget.registry.ts';

/** Options for SSR Markdown Router */
export interface SsrMdRouterOptions extends RouteCoreOptions {
  /** Widget registry for server-side widget rendering */
  widgets?: WidgetRegistry;
}

/**
 * SSR Markdown Router for server-side markdown rendering.
 */
export class SsrMdRouter {
  private core: RouteCore;
  private widgets: WidgetRegistry | null;

  constructor(manifest: RoutesManifest, options: SsrMdRouterOptions = {}) {
    this.core = new RouteCore(manifest, options);
    this.widgets = options.widgets ?? null;
  }

  /**
   * Render a URL to Markdown string.
   */
  async render(url: string): Promise<{ markdown: string; status: number }> {
    const urlObj = toUrl(url);
    let pathname = urlObj.pathname;

    if (pathname.startsWith(SSR_MD_PREFIX)) {
      pathname = '/' + pathname.slice(SSR_MD_PREFIX.length);
    }

    const matchUrl = toUrl(pathname);
    const matched = this.core.match(matchUrl);

    if (!matched) {
      return {
        markdown: this.renderStatusPage(404, pathname),
        status: 404,
      };
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

    try {
      const markdown = await this.renderPage(matched);
      return { markdown, status: 200 };
    } catch (error) {
      if (error instanceof Response) {
        return {
          markdown: this.renderStatusPage(error.status, pathname),
          status: error.status,
        };
      }
      return {
        markdown: this.renderErrorPage(error, pathname),
        status: 500,
      };
    }
  }

  /**
   * Render a matched page to Markdown.
   */
  private async renderPage(matched: MatchedRoute): Promise<string> {
    const pathname = matched.route.pattern;
    const hierarchy = this.core.buildRouteHierarchy(pathname);

    const parts: string[] = [];

    for (const routePattern of hierarchy) {
      let route = this.core.matcher.findRoute(routePattern);

      if (!route && routePattern === '/') {
        route = DEFAULT_ROOT_ROUTE;
      }

      if (!route) continue;

      // Skip wildcard route appearing as its own parent (prevents double-render)
      if (route === matched.route && routePattern !== matched.route.pattern) continue;

      const markdown = await this.renderRouteContent(route, matched.params);
      if (markdown) {
        parts.push(markdown);
      }
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Render a single route's content to Markdown.
   */
  private async renderRouteContent(route: RouteConfig, params: RouteParams): Promise<string> {
    if (route.modulePath === DEFAULT_ROOT_ROUTE.modulePath) {
      return '';
    }

    const files = route.files ?? {};

    const component: PageComponent = files.ts
      ? (await this.core.loadModule<{ default: PageComponent }>(files.ts)).default
      : defaultPageComponent;

    const context = await this.core.buildComponentContext(route.pattern, route, params);
    const data = await component.getData({ params, context });
    let markdown = component.renderMarkdown({ data, params, context });

    // Resolve fenced widget blocks: call getData() + renderMarkdown()
    if (this.widgets) {
      markdown = await this.resolveWidgets(markdown, route.pattern, params);
    }

    return markdown;
  }

  /**
   * Resolve fenced widget blocks in markdown content.
   * Replaces ```widget:name blocks with rendered markdown output.
   */
  private async resolveWidgets(
    markdown: string,
    pathname: string,
    routeParams: RouteParams,
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
        // Load widget files if declared
        let files: { html?: string; md?: string } | undefined;
        if (widget.files) {
          files = await this.core.loadWidgetFiles(widget.files);
        }

        const context = { pathname, params: routeParams, files };
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
  private renderErrorPage(error: unknown, pathname: string): string {
    const message = error instanceof Error ? error.message : String(error);
    return `# Error\n\nPath: \`${pathname}\`\n\n${message}`;
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
