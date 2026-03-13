/**
 * Widget Component
 *
 * Embeddable unit within page content. Everything reusable that is not
 * a page is a Widget. Widgets render across all contexts (HTML, Markdown, SPA)
 * and are resolved by name via the widgets manifest.
 *
 * Default rendering fallback chains (parallel to PageComponent):
 * - renderHTML:     html file → md file in <mark-down> → base Component default
 * - renderMarkdown: md file → ''
 */

import { Component } from './abstract.component.ts';
import type { ComponentContext } from '../type/component.type.ts';
import { escapeHtml } from '../util/html.util.ts';

export abstract class WidgetComponent<
  TParams = unknown,
  TData = unknown,
  TContext extends ComponentContext = ComponentContext,
> extends Component<TParams, TData, TContext> {
  override renderHTML(
    args: this['RenderArgs'],
  ): string {
    const files = args.context.files;

    if (files?.html) {
      return files.html;
    }

    if (files?.md) {
      return `<mark-down>${escapeHtml(files.md)}</mark-down>`;
    }

    return super.renderHTML(args);
  }

  override renderMarkdown(
    args: this['RenderArgs'],
  ): string {
    const files = args.context.files;

    if (files?.md) {
      return files.md;
    }

    return '';
  }
}
