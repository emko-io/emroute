/**
 * Markdown Element — <mark-down> custom element.
 *
 * Renders markdown content with pluggable renderer.
 * Supports:
 * - Inline content: <mark-down># Title</mark-down>
 * - Source attribute: <mark-down src="/path/to.md"></mark-down>
 * - Auto-resolve: <mark-down></mark-down> resolves to sibling .md based on route
 * - Fenced router-slot: ```router-slot\n``` becomes `<router-slot>`
 * - Fenced widgets: ```widget:name\n{params}``` becomes <widget-name>
 */

import { escapeHtml, HTMLElementBase } from '../util/html.util.ts';
import { processFencedSlots, processFencedWidgets } from '../util/fenced-block.util.ts';
import { CSS_ERROR } from '../component/abstract.component.ts';
import type { MarkdownRenderer } from '../type/markdown.type.ts';
import { stripSsrPrefix } from '../route/route.core.ts';

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
      // Explicit src attribute
      await this.loadFromSrc(src);
    } else if (inlineContent) {
      // Inline markdown content
      await this.renderContent(inlineContent);
    } else {
      // Auto-resolve: derive .md path from current route
      const autoSrc = this.deriveMarkdownPath();
      if (autoSrc) {
        await this.loadFromSrc(autoSrc);
      } else {
        // No content available
        this.innerHTML = '';
      }
    }
  }

  /**
   * Derive .md file path from current route.
   *
   * Maps current pathname to expected .md location:
   * - /about → /routes/about.page.md
   * - /projects → /routes/projects/index.page.md
   * - / → /routes/index.page.md
   */
  private deriveMarkdownPath(): string | null {
    const pathname = stripSsrPrefix(location.pathname);

    if (pathname === '/') {
      return '/routes/index.page.md';
    }

    // Try both flat file and folder/index patterns
    // The router will have loaded the correct route, so check what files exist
    // For simplicity, try flat file first then folder/index
    const basePath = pathname.slice(1); // Remove leading slash

    // Return the most likely path - the router should have set up the right route
    // We'll try the flat file path first
    return `/routes/${basePath}.page.md`;
  }

  private async loadFromSrc(src: string): Promise<void> {
    const signal = this.abortController?.signal;

    try {
      const response = await fetch(src, { signal });

      if (!response.ok) {
        // If primary path fails, try alternative (flat vs folder/index)
        const altSrc = this.getAlternativePath(src);
        if (altSrc) {
          const altResponse = await fetch(altSrc, { signal });
          if (altResponse.ok) {
            const markdown = await altResponse.text();
            await this.renderContent(markdown);
            return;
          }
        }
        throw new Error(`Failed to fetch ${src}: ${response.status}`);
      }

      const markdown = await response.text();
      await this.renderContent(markdown);
    } catch (error) {
      // Don't show error for aborted requests (element was disconnected)
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      this.showError(error);
    }
  }

  /**
   * Get alternative .md path (flat ↔ folder/index).
   */
  private getAlternativePath(src: string): string | null {
    if (src.endsWith('/index.page.md')) {
      // Try flat file: /routes/about/index.page.md → /routes/about.page.md
      return src.replace(/\/index\.page\.md$/, '.page.md');
    } else if (src.match(/\/[^/]+\.page\.md$/)) {
      // Try folder/index: /routes/about.page.md → /routes/about/index.page.md
      return src.replace(/\.page\.md$/, '/index.page.md');
    }
    return null;
  }

  private async renderContent(markdown: string): Promise<void> {
    try {
      const renderer = await MarkdownElement.getRenderer();
      let html = renderer.render(markdown);

      // Process fenced router-slot blocks
      html = processFencedSlots(html, (t) => this.decodeHtmlEntities(t));

      // Process fenced widget blocks
      html = processFencedWidgets(html, (t) => this.decodeHtmlEntities(t));

      this.innerHTML = html;
    } catch (error) {
      this.showError(error);
    }
  }

  /**
   * Decode HTML entities back to plain text.
   */
  private decodeHtmlEntities(text: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.innerHTML = `<div class="${CSS_ERROR}">Markdown Error: ${escapeHtml(message)}</div>`;
  }
}

if (globalThis.customElements) {
  customElements.define('mark-down', MarkdownElement);
}
