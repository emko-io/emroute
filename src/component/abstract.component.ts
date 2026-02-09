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

/**
 * Context passed to components during rendering.
 * Contains route pathname, URL params, pre-loaded file content, and abort signal.
 */
export interface ComponentContext {
  pathname: string;
  params: Record<string, string>;
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
      return `<div class="c-loading" data-component="${this.name}">Loading...</div>`;
    }
    // Default: wrap markdown in a container
    // The actual markdown→HTML conversion happens at render time
    const markdown = this.renderMarkdown({ data: args.data, params: args.params });
    return `<div class="c-markdown" data-component="${this.name}" data-markdown>${
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
    return `<div class="c-error" data-component="${this.name}">Error: ${escapeHtml(msg)}</div>`;
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
 * Page component — params come from URL, context carries file content.
 *
 * Default implementations follow the fallback table:
 * - renderHTML: html file → md via <mark-down> → <router-slot />
 * - renderMarkdown: md file → ```router-slot```
 * - getData: no-op (returns null)
 */
export class PageComponent<
  TParams extends Record<string, string> = Record<string, string>,
  TData = unknown,
> extends Component<TParams, TData> {
  override readonly name: string = 'page';

  /** Route pattern this page handles (optional — set by subclasses) */
  readonly pattern?: string;

  /**
   * Fetch or compute page data. Override in subclasses.
   * Default: returns null (no data needed).
   *
   * @example
   * ```ts
   * override getData({ params, context }: Parameters<PageComponent['getData']>[0]) {
   *   return fetch(`/api/${params.id}`, { signal: context?.signal });
   * }
   * ```
   */
  override getData(
    _args: { params: TParams; signal?: AbortSignal; context?: ComponentContext },
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
   * override renderHTML({ data, params, context }: Parameters<PageComponent['renderHTML']>[0]) {
   *   return `<h1>${params.id}</h1><p>${context?.files?.html ?? ''}</p>`;
   * }
   * ```
   */
  override renderHTML(
    args: { data: TData | null; params: TParams; context?: ComponentContext },
  ): string {
    const files = args.context?.files;
    const style = files?.css ? `<style>${files.css}</style>\n` : '';

    if (files?.html) {
      return style + files.html;
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
   * 2. `` ```router-slot``` `` (slot placeholder in markdown)
   *
   * @example
   * ```ts
   * override renderMarkdown({ data, params, context }: Parameters<PageComponent['renderMarkdown']>[0]) {
   *   return `# ${params.id}\n\n${context?.files?.md ?? ''}`;
   * }
   * ```
   */
  override renderMarkdown(
    args: { data: TData | null; params: TParams; context?: ComponentContext },
  ): string {
    const files = args.context?.files;

    if (files?.md) {
      return files.md;
    }

    return '```\nrouter-slot\n```';
  }

  /**
   * Page title. Override in subclasses.
   * Default: undefined (no title).
   *
   * @example
   * ```ts
   * override getTitle({ data, params }: Parameters<PageComponent['getTitle']>[0]) {
   *   return `Project ${params.id}`;
   * }
   * ```
   */
  getTitle(
    _args: { data: TData | null; params: TParams; context?: ComponentContext },
  ): string | undefined {
    return undefined;
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
