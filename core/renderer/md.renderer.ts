/**
 * SSR Markdown Renderer
 *
 * Server-side Markdown rendering.
 * Generates Markdown strings for LLM consumption, text clients, curl.
 */

import type { RouteConfig, RouteInfo } from '../type/route.type.ts';
import type { ComponentContext } from '../type/component.type.ts';
import type { PageComponent } from '../component/page.component.ts';
import type { Pipeline } from '../pipeline/pipeline.ts';
import { DEFAULT_ROOT_ROUTE } from '../pipeline/pipeline.ts';
import { STATUS_MESSAGES } from '../util/html.util.ts';
import { resolveRecursively } from '../util/widget-resolve.util.ts';
import { parseWidgetBlocks, replaceWidgetBlocks } from '../widget/widget.parser.ts';
import { SsrRenderer, type SsrRendererOptions } from './ssr.renderer.ts';

const BARE_SLOT_BLOCK = '```router-slot\n```';

function routerSlotBlock(pattern: string): string {
  return `\`\`\`router-slot\n{"pattern":"${pattern}"}\n\`\`\``;
}

export type SsrMdRendererOptions = SsrRendererOptions;

export class SsrMdRenderer extends SsrRenderer {
  protected override readonly label = 'SSR MD';

  constructor(pipeline: Pipeline, options: SsrMdRendererOptions = {}) {
    super(pipeline, options);
  }

  protected override injectSlot(parent: string, child: string, parentPattern: string): string {
    return parent.replace(routerSlotBlock(parentPattern), child);
  }

  protected override stripSlots(result: string): string {
    return result
      .replace(/```router-slot\n(?:\{[^}]*\}\n)?```/g, '')
      .trim();
  }

  protected override async renderRouteContent(
    routeInfo: RouteInfo,
    route: RouteConfig,
    isLeaf?: boolean,
    signal?: AbortSignal,
  ): Promise<{ content: string; title?: string }> {
    if (route.modulePath === DEFAULT_ROOT_ROUTE.modulePath) {
      return { content: routerSlotBlock(route.pattern) };
    }

    const { content: rawContent, title } = await this.loadRouteContent(routeInfo, route, isLeaf, signal);
    let content = rawContent;

    // Attribute bare router-slot blocks with this route's pattern
    content = content.replaceAll(BARE_SLOT_BLOCK, routerSlotBlock(route.pattern));

    // Resolve fenced widget blocks
    if (this.widgets) {
      content = await this.resolveWidgets(content, routeInfo);
    }

    return { content, ...(title !== undefined ? { title } : {}) };
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

  protected override renderStatusPage(status: number, url: URL): string {
    return `# ${STATUS_MESSAGES[status] ?? 'Error'}\n\nPath: \`${url.pathname}\``;
  }

  protected override renderErrorPage(_error: unknown, url: URL): string {
    return `# Internal Server Error\n\nPath: \`${url.pathname}\``;
  }

  private resolveWidgets(
    content: string,
    routeInfo: RouteInfo,
  ): Promise<string> {
    return resolveRecursively(
      content,
      parseWidgetBlocks,
      async (block) => {
        if (block.parseError || !block.params) {
          return `> **Error** (\`${block.widgetName}\`): ${block.parseError}`;
        }

        const widget = this.widgets!.get(block.widgetName);
        if (!widget) {
          return `> **Error**: Unknown widget \`${block.widgetName}\``;
        }

        try {
          let files: { html?: string; md?: string } | undefined;
          const filePaths = this.widgetFiles[block.widgetName] ?? widget.files;
          if (filePaths) {
            files = await this.pipeline.loadFiles(filePaths);
          }

          const baseContext: ComponentContext = {
            ...routeInfo,
            pathname: routeInfo.url.pathname,
            searchParams: routeInfo.url.searchParams,
            ...(files ? { files } : {}),
          };
          const context: ComponentContext = this.pipeline.contextProvider
            ? this.pipeline.contextProvider(baseContext)
            : baseContext;
          const data = await widget.getData({ params: block.params, context });
          return widget.renderMarkdown({ data, params: block.params, context });
        } catch (e) {
          return widget.renderMarkdownError(e);
        }
      },
      replaceWidgetBlocks,
      0,
      this.logger,
    );
  }
}
