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

  getData(_args: this['DataArgs']): Promise<TData | null> { return Promise.resolve(null); }
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

  /**
   * @experimental
   *
   * Parse a template and return a reusable fill function.
   * Call once, apply many times with different slot values.
   *
   * **String signatures** (SSR + SPA `renderHTML`/`renderMarkdown`):
   * - `experimentalUseTemplate(html, id)` — Extracts `<template id>`, fills `<slot name>`.
   * - `experimentalUseTemplate(md, id)` — Extracts `` ```template:id ``, fills `slot:name`.
   *
   * **DOM signature** (browser `hydrate()`):
   * - `experimentalUseTemplate(id)` — Finds `<template>` in shadow DOM,
   *   returns a function that clones and fills slots as `DocumentFragment`.
   *
   * Markdown templates work in both `renderMarkdown()` and `renderHTML()`.
   * For HTML output from a markdown-only companion, wrap the result in `<mark-down>`:
   * ```typescript
   * override renderHTML({ data, context }: this['RenderArgs']): string {
   *   const card = this.experimentalUseTemplate(context.files!.md!, 'card');
   *   return `<mark-down>${escapeHtml(data.items.map(card).join('\n'))}</mark-down>`;
   * }
   * ```
   *
   * Throws if the template id is not found in the source.
   */
  experimentalUseTemplate(source: string, id: string): (slots?: Record<string, string>) => string;
  experimentalUseTemplate(id: string): (slots?: Record<string, string>) => DocumentFragment;
  experimentalUseTemplate(sourceOrId: string, id?: string): (slots?: Record<string, string>) => string | DocumentFragment {
    // DOM path: single arg = template id, find in shadow DOM
    if (id === undefined) {
      const templateId = sourceOrId;
      const shadowRoot = (this.element as HTMLElement | undefined)?.shadowRoot;
      const template = shadowRoot?.querySelector<HTMLTemplateElement>(`template#${templateId}`);
      if (!template) {
        throw new Error(
          `[${this.name}] Template "#${templateId}" not found in shadow DOM. ` +
          'Ensure the <template> element exists in the companion HTML.',
        );
      }

      return (slots) => {
        const clone = template.content.cloneNode(true) as DocumentFragment;
        if (!slots) return clone;

        for (const [name, content] of Object.entries(slots)) {
          const selector = name === 'default' ? 'slot:not([name])' : `slot[name="${name}"]`;
          const slot = clone.querySelector(selector);
          if (!slot) continue;
          const temp = document.createElement('template');
          temp.innerHTML = content;
          slot.replaceWith(temp.content);
        }

        return clone;
      };
    }

    const source = sourceOrId;

    // Markdown path: ```template:id ... ```
    const mdPattern = new RegExp(
      '```template:' + id + '\\n([\\s\\S]*?)```',
    );
    const mdMatch = source.match(mdPattern);
    if (mdMatch) {
      const skeleton = mdMatch[1]!;

      return (slots) => {
        if (!slots) return skeleton;
        let result = skeleton;
        for (const [name, content] of Object.entries(slots)) {
          result = result.replaceAll(`slot:${name}`, content);
        }
        return result;
      };
    }

    // HTML path: <template id="...">...</template>
    const htmlPattern = new RegExp(
      `<template\\s+id=["']${id}["'][^>]*>([\\s\\S]*?)</template>`,
    );
    const htmlMatch = source.match(htmlPattern);
    if (!htmlMatch) {
      throw new Error(
        `[${this.name}] Template "${id}" not found in source. ` +
        'Expected <template id="' + id + '"> in HTML or ```template:' + id + ' in markdown.',
      );
    }

    const skeleton = htmlMatch[1]!;

    return (slots) => {
      if (!slots) return skeleton;

      let result = skeleton;

      for (const [name, content] of Object.entries(slots)) {
        if (name === 'default') continue;
        result = result.replaceAll(
          new RegExp(`<slot\\s+name=["']${name}["'][^>]*>[\\s\\S]*?</slot>`, 'g'),
          content,
        );
      }

      if ('default' in slots) {
        result = result.replaceAll(/<slot\s*>[\s\S]*?<\/slot>/g, slots['default']!);
      }

      return result;
    };
  }

  renderError(args: { error: unknown; params: TParams }): string {
    const msg = args.error instanceof Error ? args.error.message : String(args.error);
    return `<div data-component="${this.name}">Error: ${escapeHtml(msg)}</div>`;
  }

  renderMarkdownError(error: unknown): string {
    const msg = error instanceof Error ? error.message : String(error);
    return `> **Error** (\`${this.name}\`): ${msg}`;
  }
}
