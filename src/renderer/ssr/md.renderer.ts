/**
 * SSR Markdown Renderer
 *
 * Server-side Markdown rendering.
 * Generates Markdown strings for LLM consumption, text clients, curl.
 */

import type { RouteConfig, RouteInfo, RoutesManifest } from '../../type/route.type.ts';
import type { PageComponent } from '../../component/page.component.ts';
import { DEFAULT_ROOT_ROUTE } from '../../route/route.core.ts';
import { STATUS_MESSAGES } from '../../util/html.util.ts';
import { parseWidgetBlocks, replaceWidgetBlocks } from '../../widget/widget.parser.ts';
import { SsrRenderer, type SsrRendererOptions } from './ssr.renderer.ts';

const ROUTER_SLOT_BLOCK = '```router-slot\n```';

/** Options for SSR Markdown Router */
export type SsrMdRouterOptions = SsrRendererOptions;

/**
 * SSR Markdown Router for server-side markdown rendering.
 */
export class SsrMdRouter extends SsrRenderer {
  protected override readonly label = 'SSR MD';

  constructor(manifest: RoutesManifest, options: SsrMdRouterOptions = {}) {
    super(manifest, options);
  }

  protected override injectSlot(parent: string, child: string): string {
    return parent.replace(ROUTER_SLOT_BLOCK, child);
  }

  protected override stripSlots(result: string): string {
    return result.replaceAll(ROUTER_SLOT_BLOCK, '').trim();
  }

  /**
   * Render a single route's content to Markdown.
   */
  protected override async renderRouteContent(
    routeInfo: RouteInfo,
    route: RouteConfig,
  ): Promise<{ content: string; title?: string }> {
    if (route.modulePath === DEFAULT_ROOT_ROUTE.modulePath) {
      return { content: ROUTER_SLOT_BLOCK };
    }

    let { content, title } = await this.loadRouteContent(routeInfo, route);

    // Resolve fenced widget blocks: call getData() + renderMarkdown()
    if (this.widgets) {
      content = await this.resolveWidgets(content, routeInfo);
    }

    return { content, title };
  }

  protected override renderContent(
    component: PageComponent,
    args: PageComponent['RenderArgs'],
  ): string {
    return component.renderMarkdown(args);
  }

  protected override renderRedirect(to: string): string {
    return `Redirect to: ${to}`;
  }

  protected override renderStatusPage(status: number, pathname: string): string {
    return `# ${STATUS_MESSAGES[status] ?? 'Error'}\n\nPath: \`${pathname}\``;
  }

  protected override renderErrorPage(_error: unknown, pathname: string): string {
    return `# Internal Server Error\n\nPath: \`${pathname}\``;
  }

  /**
   * Resolve fenced widget blocks in markdown content.
   * Replaces ```widget:name blocks with rendered markdown output.
   */
  private resolveWidgets(
    content: string,
    routeInfo: RouteInfo,
  ): Promise<string> {
    return this.resolveWidgetsRecursively(
      content,
      routeInfo,
      // Parse function: find widget blocks in content
      (content) => parseWidgetBlocks(content),
      // Resolve function: resolve a single widget block
      async (block, routeInfo) => {
        if (block.parseError || !block.params) {
          return `> **Error** (\`${block.widgetName}\`): ${block.parseError}`;
        }

        const widget = this.widgets!.get(block.widgetName);
        if (!widget) {
          return `> **Error**: Unknown widget \`${block.widgetName}\``;
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
          return widget.renderMarkdown({ data, params: block.params, context });
        } catch (e) {
          return widget.renderMarkdownError(e);
        }
      },
      // Replace function: replace widget blocks with resolved content
      (content, replacements) => replaceWidgetBlocks(content, replacements),
    );
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
