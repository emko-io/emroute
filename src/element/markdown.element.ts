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

import {
  escapeHtml,
  HTMLElementBase,
  processFencedSlots,
  processFencedWidgets,
} from '../util/html.util.ts';
import type { MarkdownRenderer } from '../type/markdown.type.ts';
import { SSR_HTML_PREFIX, SSR_MD_PREFIX } from '../route/route.core.ts';

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
    MarkdownElement.rendererInitPromise = null;
  }

  /**
   * Get the current renderer, initializing if needed.
   */
  private static async getRenderer(): Promise<MarkdownRenderer> {
    if (!MarkdownElement.renderer) {
      throw new Error(
        'No markdown renderer configured. Call MarkdownElement.setRenderer() before using <mark-down> elements.',
      );
    }

    if (MarkdownElement.renderer.init && !MarkdownElement.rendererInitPromise) {
      MarkdownElement.rendererInitPromise = MarkdownElement.renderer.init();
    }

    if (MarkdownElement.rendererInitPromise) {
      await MarkdownElement.rendererInitPromise;
    }

    return MarkdownElement.renderer;
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
    const dataSrc = this.getAttribute('data-src');
    const inlineContent = this.textContent?.trim();

    if (dataSrc) {
      // Base64-encoded markdown with possible custom elements (SSR mode)
      try {
        const binary = atob(dataSrc);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const markdown = new TextDecoder().decode(bytes);
        await this.renderContentWithElements(markdown);
      } catch (e) {
        this.showError(new Error(`Failed to decode data-src: ${e}`));
      }
    } else if (src) {
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
    const pathname = location.pathname
      .replace(new RegExp(`^${SSR_MD_PREFIX}`), '/')
      .replace(new RegExp(`^${SSR_HTML_PREFIX}`), '/');

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
   * Render markdown that may contain pre-composed custom elements.
   * Preserves custom element tags (like <widget-*>) during markdown rendering.
   */
  private async renderContentWithElements(markdown: string): Promise<void> {
    try {
      // Extract custom elements and replace with placeholders
      // Use a pattern that won't be interpreted as markdown
      const elements: string[] = [];
      const placeholder = (i: number) => `XELEMENT${i}X`;

      // Match custom elements: <tag-name ...>...</tag-name> or self-closing
      const elementPattern =
        /<(widget-[a-z][a-z0-9-]*|router-slot)([^>]*)>([\s\S]*?)<\/\1>|<(widget-[a-z][a-z0-9-]*)([^>]*)\/>/gi;

      const markdownWithPlaceholders = markdown.replace(elementPattern, (match) => {
        const index = elements.length;
        elements.push(match);
        return placeholder(index);
      });

      // Render markdown
      const renderer = await MarkdownElement.getRenderer();
      let html = renderer.render(markdownWithPlaceholders);

      // Process any fenced blocks
      html = processFencedSlots(html, (t) => this.decodeHtmlEntities(t));
      html = processFencedWidgets(html, (t) => this.decodeHtmlEntities(t));

      // Restore custom elements (they may be wrapped in <p> tags)
      for (let i = 0; i < elements.length; i++) {
        // Replace placeholder, handling possible <p> wrapper
        html = html.replace(
          new RegExp(`<p>${placeholder(i)}</p>|${placeholder(i)}`, 'g'),
          elements[i],
        );
      }

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
    this.innerHTML = `
      <div style="padding: 1rem; background: #fee; border: 1px solid #fcc; border-radius: 4px; color: #c00;">
        <strong>Markdown Error:</strong> ${escapeHtml(message)}
      </div>
    `;
  }
}

if (globalThis.customElements) {
  customElements.define('mark-down', MarkdownElement);
}
