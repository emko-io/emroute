/**
 * Page Component
 *
 * Params come from URL, context carries file content.
 *
 * Default implementations follow the fallback table:
 * - renderHTML: html file → md via <mark-down> → <router-slot /> (non-leaf only)
 * - renderMarkdown: md file → ```router-slot\n``` (non-leaf only)
 * - getData: no-op (returns null)
 */

import { Component } from './abstract.component.ts';
import type { ComponentContext } from '../type/component.type.ts';
import { escapeHtml } from '../util/html.util.ts';

export class PageComponent<
  TParams extends Record<string, string> = Record<string, string>,
  TData = unknown,
  TContext extends ComponentContext = ComponentContext,
> extends Component<TParams, TData, TContext> {
  override readonly name: string = 'page';
  readonly pattern?: string;

  override getData(
    _args: this['DataArgs'],
  ): Promise<TData | null> {
    return Promise.resolve(null);
  }

  override renderHTML(
    args: this['RenderArgs'],
  ): string {
    const files = args.context.files;
    const style = files?.css ? `<style>${files.css}</style>\n` : '';

    if (files?.html) {
      let html = style + files.html;
      if (files.md && html.includes('<mark-down></mark-down>')) {
        html = html.replace(
          '<mark-down></mark-down>',
          `<mark-down>${escapeHtml(files.md)}</mark-down>`,
        );
      }
      return html;
    }

    if (files?.md) {
      const hasSlot = files.md.includes('```router-slot');
      const slot = args.context.isLeaf || hasSlot ? '' : '\n<router-slot></router-slot>';
      return `${style}<mark-down>${escapeHtml(files.md)}</mark-down>${slot}`;
    }

    return args.context.isLeaf ? '' : '<router-slot></router-slot>';
  }

  override renderMarkdown(
    args: this['RenderArgs'],
  ): string {
    const files = args.context.files;

    if (files?.md) {
      return files.md;
    }

    return args.context.isLeaf ? '' : '```router-slot\n```';
  }

  getTitle(
    _args: this['RenderArgs'],
  ): string | undefined {
    return undefined;
  }
}

/** Shared default instance used by renderers when no custom .page.ts exists. */
export default new PageComponent();
