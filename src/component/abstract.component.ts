/**
 * Unified Component Architecture
 *
 * Everything is a Component: pages and widgets.
 * Components render differently based on context:
 * - /md/* → Markdown (LLMs, text clients)
 * - /html/* → Pre-rendered HTML (SSR)
 * - SPA → Hydrated custom elements
 *
 * Precedence (like .ts/.html/.md):
 * - renderHTML() if defined → full HTML control
 * - renderMarkdown() → converted to HTML via markdown renderer
 */

import { escapeHtml } from '../util/html.util.ts';

const CSS_LOADING = 'c-loading';
const CSS_MARKDOWN = 'c-markdown';
export const CSS_ERROR = 'c-error';

/**
 * Context passed to components during rendering.
 * Contains route pathname, URL params, pre-loaded file content, and abort signal.
 */
export interface ComponentContext {
  pathname: string;
  params: Record<string, string>;
  searchParams?: URLSearchParams;
  files?: { html?: string; md?: string; css?: string };
  signal?: AbortSignal;
}

/**
 * Render context determines how components are rendered.
 */
export type RenderContext = 'markdown' | 'html' | 'spa';

/**
 * Abstract base class for all components.
 *
 * Subclasses must implement:
 * - name: unique identifier for custom element tag
 * - getData(): fetch/compute data
 * - renderMarkdown(): render as markdown
 *
 * Optional override:
 * - renderHTML(): custom HTML rendering (defaults to markdown→HTML conversion)
 * - validateParams(): params validation
 */
export abstract class Component<TParams = unknown, TData = unknown> {
  /** Unique name in kebab-case. Used for custom element: `<widget-{name}>` */
  abstract readonly name: string;

  /** Associated file paths for pre-loaded content (html, md, css). */
  readonly files?: { html?: string; md?: string; css?: string };

  /**
   * Fetch or compute data based on params.
   * Called server-side for SSR, client-side for SPA.
   */
  abstract getData(
    args: { params: TParams; signal?: AbortSignal; context?: ComponentContext },
  ): Promise<TData | null>;

  /**
   * Render as markdown.
   * This is the canonical content representation.
   */
  abstract renderMarkdown(
    args: { data: TData | null; params: TParams; context?: ComponentContext },
  ): string;

  /**
   * Render as HTML for browser context.
   *
   * Default implementation converts renderMarkdown() output to HTML.
   * Override for custom HTML rendering with rich styling/interactivity.
   */
  renderHTML(args: { data: TData | null; params: TParams; context?: ComponentContext }): string {
    if (args.data === null) {
      return `<div class="${CSS_LOADING}" data-component="${this.name}">Loading...</div>`;
    }
    // Default: wrap markdown in a container
    // The actual markdown→HTML conversion happens at render time
    const markdown = this.renderMarkdown({
      data: args.data,
      params: args.params,
      context: args.context,
    });
    return `<div class="${CSS_MARKDOWN}" data-component="${this.name}" data-markdown>${
      escapeHtml(markdown)
    }</div>`;
  }

  /**
   * Cleanup hook called when the component is removed from the DOM.
   * Use for clearing timers, removing event listeners, unmounting
   * third-party renderers, closing connections, etc.
   *
   * Intentionally synchronous (called from disconnectedCallback). You can
   * fire async cleanup here, but it will not be awaited.
   */
  destroy?(): void;

  /**
   * Validate params.
   * @returns Error message if invalid, undefined if valid.
   */
  validateParams?(params: TParams): string | undefined;

  /**
   * Render error state.
   */
  renderError(args: { error: unknown; params: TParams }): string {
    const msg = args.error instanceof Error ? args.error.message : String(args.error);
    return `<div class="${CSS_ERROR}" data-component="${this.name}">Error: ${
      escapeHtml(msg)
    }</div>`;
  }

  /**
   * Render error as markdown.
   */
  renderMarkdownError(error: unknown): string {
    const msg = error instanceof Error ? error.message : String(error);
    return `> **Error** (\`${this.name}\`): ${msg}`;
  }
}

/**
 * Component manifest entry for code generation.
 */
export interface ComponentManifestEntry {
  name: string;
  modulePath: string;
  tagName: string;
  type: 'page' | 'widget';
  pattern?: string;
}
