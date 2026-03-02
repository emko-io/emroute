/**
 * Component Base Class
 *
 * Everything is a Component: pages and widgets.
 * Components render differently based on context:
 * - /md/* → Markdown (LLMs, text clients)
 * - /html/* → Pre-rendered HTML (SSR)
 * - SPA → Hydrated custom elements
 */

import type { ComponentContext } from '../type/component.type.ts';
import { escapeHtml } from '../util/html.util.ts';

export abstract class Component<
  TParams = unknown,
  TData = unknown,
  TContext extends ComponentContext = ComponentContext,
> {
  declare readonly DataArgs: {
    params: TParams;
    signal?: AbortSignal;
    context: TContext;
  };

  declare readonly RenderArgs: {
    data: TData | null;
    params: TParams;
    context: TContext;
  };

  abstract readonly name: string;

  /** Host element reference, set by ComponentElement in the browser. */
  element?: HTMLElement | undefined;

  /** Associated file paths for pre-loaded content (html, md, css). */
  readonly files?: { html?: string; md?: string; css?: string };

  /**
   * When true, SSR serializes the getData() result into the element's
   * light DOM so the client can access it immediately in hydrate()
   * without re-fetching.
   */
  readonly exposeSsrData?: boolean;

  abstract getData(args: this['DataArgs']): Promise<TData | null>;
  abstract renderMarkdown(args: this['RenderArgs']): string;

  renderHTML(args: this['RenderArgs']): string {
    if (args.data === null) {
      return `<div data-component="${this.name}">Loading...</div>`;
    }
    const markdown = this.renderMarkdown({
      data: args.data,
      params: args.params,
      context: args.context,
    });
    return `<div data-component="${this.name}" data-markdown>${escapeHtml(markdown)}</div>`;
  }

  hydrate?(args: this['RenderArgs']): void;
  destroy?(): void;
  validateParams?(params: TParams): string | undefined;

  renderError(args: { error: unknown; params: TParams }): string {
    const msg = args.error instanceof Error ? args.error.message : String(args.error);
    return `<div data-component="${this.name}">Error: ${escapeHtml(msg)}</div>`;
  }

  renderMarkdownError(error: unknown): string {
    const msg = error instanceof Error ? error.message : String(error);
    return `> **Error** (\`${this.name}\`): ${msg}`;
  }
}
