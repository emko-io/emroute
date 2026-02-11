/**
 * WidgetComponent — embeddable unit within page content.
 *
 * Everything reusable that is not a page is a Widget.
 * Widgets render across all contexts (HTML, Markdown, SPA) and are
 * resolved by name via WidgetRegistry.
 *
 * Pages live in the routes manifest. Widgets live in the registry.
 *
 * Default rendering fallback chains (parallel to PageComponent):
 * - renderHTML:     html file → md file in <mark-down> → base Component default
 * - renderMarkdown: md file → ''
 */

import { Component, type ComponentContext } from './abstract.component.ts';
import { escapeHtml } from '../util/html.util.ts';

export abstract class WidgetComponent<
  TParams = unknown,
  TData = unknown,
  TContext extends ComponentContext = ComponentContext,
> extends Component<TParams, TData, TContext> {
  /**
   * Render widget as HTML.
   *
   * Fallback chain:
   * 1. html file content from context
   * 2. md file content wrapped in `<mark-down>`
   * 3. base Component default (markdown→HTML conversion)
   *
   * @example
   * ```ts
   * override renderHTML({ data, params }: this['RenderArgs']) {
   *   return `<span>${params.coin}: $${data?.price}</span>`;
   * }
   * ```
   */
  override renderHTML(
    args: this['RenderArgs'],
  ): string {
    const files = args.context?.files;
    const style = files?.css ? `<style>${files.css}</style>\n` : '';

    if (files?.html) {
      return style + files.html;
    }

    if (files?.md) {
      return `${style}<mark-down>${escapeHtml(files.md)}</mark-down>`;
    }

    if (style) {
      return style + super.renderHTML(args);
    }

    return super.renderHTML(args);
  }

  /**
   * Render widget as Markdown.
   *
   * Fallback chain:
   * 1. md file content from context
   * 2. empty string
   *
   * @example
   * ```ts
   * override renderMarkdown({ data, params }: this['RenderArgs']) {
   *   return `**${params.coin}**: $${data?.price}`;
   * }
   * ```
   */
  override renderMarkdown(
    args: this['RenderArgs'],
  ): string {
    const files = args.context?.files;

    if (files?.md) {
      return files.md;
    }

    return '';
  }
}
