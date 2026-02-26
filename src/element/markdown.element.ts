/**
 * Markdown Element — <mark-down> custom element.
 *
 * Renders markdown content with pluggable renderer.
 * Supports:
 * - Inline content: <mark-down># Title</mark-down>
 * - Source attribute: <mark-down src="/path/to.md"></mark-down>
 */

import { escapeHtml, HTMLElementBase } from '../util/html.util.ts';
import type { MarkdownRenderer } from '../type/markdown.type.ts';

export class MarkdownElement extends HTMLElementBase {
  private static renderer: MarkdownRenderer | null = null;
  private static rendererInitPromise: Promise<void> | null = null;
  private abortController: AbortController | null = null;

  /**
   * Set the markdown renderer.
   * Must be called before any <mark-down> elements are connected.
   *
   * @example
   * ```ts
   * import { createEmkoRenderer } from './emko.renderer.ts';
   * MarkdownElement.setRenderer(await createEmkoRenderer());
   * ```
   */
  static setRenderer(renderer: MarkdownRenderer): void {
    MarkdownElement.renderer = renderer;
    MarkdownElement.rendererInitPromise = renderer.init ? renderer.init() : null;
  }

  /** Get the current renderer (if set). Used by bootEmrouteApp to pass through to createEmrouteServer. */
  static getConfiguredRenderer(): MarkdownRenderer | null {
    return MarkdownElement.renderer;
  }

  /**
   * Get the current renderer, waiting for init if needed.
   */
  private static async getRenderer(): Promise<MarkdownRenderer> {
    const renderer = MarkdownElement.renderer;
    if (!renderer) {
      throw new Error(
        'No markdown renderer configured. Call MarkdownElement.setRenderer() before using <mark-down> elements.',
      );
    }

    if (MarkdownElement.rendererInitPromise) {
      await MarkdownElement.rendererInitPromise;
    }

    return renderer;
  }

  async connectedCallback(): Promise<void> {
    this.abortController = new AbortController();
    await this.loadContent();
  }

  disconnectedCallback(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  private async loadContent(): Promise<void> {
    const src = this.getAttribute('src');
    const inlineContent = this.textContent?.trim();

    if (src) {
      await this.loadFromSrc(src);
    } else if (inlineContent) {
      await this.renderContent(inlineContent);
    } else {
      this.innerHTML = '';
    }
  }

  private async loadFromSrc(src: string): Promise<void> {
    const signal = this.abortController?.signal;

    try {
      const response = await fetch(src, { signal });

      if (!response.ok) {
        throw new Error(`Failed to fetch ${src}: ${response.status}`);
      }

      const markdown = await response.text();
      await this.renderContent(markdown);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      this.showError(error);
    }
  }

  private async renderContent(markdown: string): Promise<void> {
    try {
      const renderer = await MarkdownElement.getRenderer();
      this.innerHTML = renderer.render(markdown);
    } catch (error) {
      this.showError(error);
    }
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.innerHTML = `<div>Markdown Error: ${escapeHtml(message)}</div>`;
  }
}
