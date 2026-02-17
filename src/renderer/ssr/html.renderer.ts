/**
 * SSR HTML Renderer
 *
 * Server-side HTML rendering.
 * Generates complete HTML strings without DOM manipulation.
 * Expands <mark-down> tags server-side when a markdown renderer is provided.
 */

import type { RouteConfig, RouteInfo, RoutesManifest } from '../../type/route.type.ts';
import type { MarkdownRenderer } from '../../type/markdown.type.ts';
import type { PageComponent } from '../../component/page.component.ts';
import { DEFAULT_ROOT_ROUTE } from '../../route/route.core.ts';
import { escapeHtml, STATUS_MESSAGES, unescapeHtml } from '../../util/html.util.ts';
import { resolveWidgetTags } from '../../util/widget-resolve.util.ts';
import { SsrRenderer, type SsrRendererOptions } from './ssr.renderer.ts';

/** Options for SSR HTML Router */
export interface SsrHtmlRouterOptions extends SsrRendererOptions {
  /** Markdown renderer for server-side <mark-down> expansion */
  markdownRenderer?: MarkdownRenderer;
}

/**
 * SSR HTML Router for server-side rendering.
 */
export class SsrHtmlRouter extends SsrRenderer {
  protected override readonly label = 'SSR HTML';
  private markdownRenderer: MarkdownRenderer | null;
  private markdownReady: Promise<void> | null = null;

  constructor(manifest: RoutesManifest, options: SsrHtmlRouterOptions = {}) {
    super(manifest, options);
    this.markdownRenderer = options.markdownRenderer ?? null;

    if (this.markdownRenderer?.init) {
      this.markdownReady = this.markdownRenderer.init();
    }
  }

  protected override injectSlot(parent: string, child: string, parentPattern: string): string {
    const escaped = parentPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return parent.replace(
      new RegExp(`<router-slot\\b[^>]*\\bpattern="${escaped}"[^>]*></router-slot>`),
      child,
    );
  }

  protected override stripSlots(result: string): string {
    return result.replace(/<router-slot[^>]*><\/router-slot>/g, '');
  }

  /**
   * Render a single route's content.
   */
  protected override async renderRouteContent(
    routeInfo: RouteInfo,
    route: RouteConfig,
    isLeaf?: boolean,
  ): Promise<{ content: string; title?: string }> {
    if (route.modulePath === DEFAULT_ROOT_ROUTE.modulePath) {
      return { content: `<router-slot pattern="${route.pattern}"></router-slot>` };
    }

    let { content, title } = await this.loadRouteContent(routeInfo, route, isLeaf);

    // Expand <mark-down> tags server-side
    content = await this.expandMarkdown(content);

    // Attribute bare <router-slot> tags with this route's pattern (before widget
    // resolution so widget-internal slots inside <template> are not affected)
    content = this.attributeSlots(content, route.pattern);

    // Resolve <widget-*> tags: call getData() + renderHTML(), inject data-ssr
    if (this.widgets) {
      content = await resolveWidgetTags(
        content,
        this.widgets,
        routeInfo,
        (name, declared) => {
          const files = this.widgetFiles[name] ?? declared;
          return files ? this.core.loadWidgetFiles(files) : Promise.resolve({});
        },
        this.core.contextProvider,
      );
    }

    return { content, title };
  }

  protected override renderContent(
    component: PageComponent,
    args: PageComponent['RenderArgs'],
  ): string {
    return component.renderHTML(args);
  }

  protected override renderRedirect(to: string): string {
    return `<meta http-equiv="refresh" content="0;url=${escapeHtml(to)}">`;
  }

  protected override renderStatusPage(status: number, pathname: string): string {
    return `
      <h1>${STATUS_MESSAGES[status] ?? 'Error'}</h1>
      <p>Path: ${escapeHtml(pathname)}</p>
    `;
  }

  protected override renderErrorPage(error: unknown, pathname: string): string {
    const message = error instanceof Error ? error.message : String(error);
    return `
      <h1>Error</h1>
      <p>Path: ${escapeHtml(pathname)}</p>
      <p>${escapeHtml(message)}</p>
    `;
  }

  /** Add pattern attribute to bare <router-slot> tags. */
  private attributeSlots(content: string, routePattern: string): string {
    return content.replace(
      /<router-slot(?![^>]*\bpattern=)([^>]*)><\/router-slot>/g,
      `<router-slot pattern="${routePattern}"$1></router-slot>`,
    );
  }

  /**
   * Expand <mark-down> tags by rendering markdown to HTML server-side.
   * Leaves content unchanged if no markdown renderer is configured.
   */
  private async expandMarkdown(content: string): Promise<string> {
    if (!this.markdownRenderer) return content;
    if (!content.includes('<mark-down>')) return content;

    if (this.markdownReady) {
      await this.markdownReady;
    }

    const renderer = this.markdownRenderer;

    // Match <mark-down>escaped content</mark-down>
    const pattern = /<mark-down>([\s\S]*?)<\/mark-down>/g;

    return content.replace(pattern, (_match, escaped: string) => {
      const markdown = unescapeHtml(escaped);
      const rendered = renderer.render(markdown);
      return rendered;
    });
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
