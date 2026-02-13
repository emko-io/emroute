/**
 * Page Component
 *
 * Page component — params come from URL, context carries file content.
 *
 * Default implementations follow the fallback table:
 * - renderHTML: html file → md via <mark-down> → <router-slot />
 * - renderMarkdown: md file → ```router-slot\n```
 * - getData: no-op (returns null)
 */

import { Component, type ComponentContext } from './abstract.component.ts';
import { escapeHtml } from '../util/html.util.ts';

export class PageComponent<
  TParams extends Record<string, string> = Record<string, string>,
  TData = unknown,
  TContext extends ComponentContext = ComponentContext,
> extends Component<TParams, TData, TContext> {
  override readonly name: string = 'page';

  /** Route pattern this page handles (optional — set by subclasses) */
  readonly pattern?: string;

  /**
   * Fetch or compute page data. Override in subclasses.
   * Default: returns null (no data needed).
   *
   * @example
   * ```ts
   * override getData({ params, context }: this['DataArgs']) {
   *   return fetch(`/api/${params.id}`, { signal: context?.signal });
   * }
   * ```
   */
  override getData(
    _args: this['DataArgs'],
  ): Promise<TData | null> {
    return Promise.resolve(null);
  }

  /**
   * Render page as HTML.
   *
   * Fallback chain:
   * 1. html file content from context
   * 2. md file content wrapped in `<mark-down>`
   * 3. `<router-slot />` (bare slot for child routes)
   *
   * @example
   * ```ts
   * override renderHTML({ data, params, context }: this['RenderArgs']) {
   *   return `<h1>${params.id}</h1><p>${context?.files?.html ?? ''}</p>`;
   * }
   * ```
   */
  override renderHTML(
    args: this['RenderArgs'],
  ): string {
    const files = args.context?.files;
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
      return `${style}<mark-down>${escapeHtml(files.md)}</mark-down>\n<router-slot></router-slot>`;
    }

    return '<router-slot></router-slot>';
  }

  /**
   * Render page as Markdown.
   *
   * Fallback chain:
   * 1. md file content from context
   * 2. `` ```router-slot\n``` `` (slot placeholder in markdown — newline required)
   *
   * @example
   * ```ts
   * override renderMarkdown({ data, params, context }: this['RenderArgs']) {
   *   return `# ${params.id}\n\n${context?.files?.md ?? ''}`;
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

    return '```router-slot\n```';
  }

  /**
   * Page title. Override in subclasses.
   * Default: undefined (no title).
   *
   * @example
   * ```ts
   * override getTitle({ data, params }: this['RenderArgs']) {
   *   return `Project ${params.id}`;
   * }
   * ```
   */
  getTitle(
    _args: this['RenderArgs'],
  ): string | undefined {
    return undefined;
  }
}

/** Shared default instance used by renderers when no custom .page.ts exists. */
export default new PageComponent();
