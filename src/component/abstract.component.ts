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

import type { RouteInfo } from '../type/route.type.ts';
import { escapeHtml } from '../util/html.util.ts';

/**
 * Context passed to components during rendering.
 * Extends RouteInfo (pathname, pattern, params, searchParams)
 * with pre-loaded file content and an abort signal.
 *
 * Consumers can extend this interface via module augmentation
 * to add app-level services (RPC clients, auth, feature flags, etc.).
 */
/** Shape of companion file contents (html, md, css). Used by generated `.page.files.g.ts` modules. */
export type FileContents = { html?: string; md?: string; css?: string };

export interface ComponentContext extends RouteInfo {
  readonly files?: Readonly<FileContents>;
  readonly signal?: AbortSignal;
  /** True when this component is the leaf (matched) route, false when rendered as a layout parent. */
  readonly isLeaf?: boolean;
  /** Base path for SSR HTML links (e.g. '/html'). */
  readonly basePath?: string;
}

/**
 * Callback that enriches the base ComponentContext with app-level services.
 * Registered once at router creation; called for every context construction.
 *
 * **1. Register** — always spread `base` to preserve routing/file/signal data:
 * ```ts
 * createSpaHtmlRouter(manifest, {
 *   extendContext: (base) => ({ ...base, rpc: myRpcClient }),
 * });
 * ```
 *
 * **2. Access** — expose custom properties to components via module augmentation:
 * ```ts
 * declare module '@emkodev/emroute' {
 *   interface ComponentContext { rpc: RpcClient; }
 * }
 * ```
 * or per-component via the third generic:
 * ```ts
 * class MyPage extends PageComponent<Params, Data, AppContext> {}
 * ```
 */
export type ContextProvider = (base: ComponentContext) => ComponentContext;

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
 *
 * @typeParam TContext — custom context shape; defaults to ComponentContext.
 *   Use with `extendContext` on the router to inject app-level services.
 *   See {@link ContextProvider} for details.
 */
export abstract class Component<
  TParams = unknown,
  TData = unknown,
  TContext extends ComponentContext = ComponentContext,
> {
  /** Type carrier for getData args — use as `this['DataArgs']` in overrides. */
  declare readonly DataArgs: {
    params: TParams;
    signal?: AbortSignal;
    context: TContext;
  };

  /** Type carrier for render args — use as `this['RenderArgs']` in overrides. */
  declare readonly RenderArgs: {
    data: TData | null;
    params: TParams;
    context: TContext;
  };

  /** Unique name in kebab-case. Used for custom element: `<widget-{name}>` */
  abstract readonly name: string;

  /** Host element reference, set by ComponentElement in the browser. */
  element?: HTMLElement;

  /** Associated file paths for pre-loaded content (html, md, css). */
  readonly files?: { html?: string; md?: string; css?: string };

  /**
   * When true, SSR serializes the getData() result into the element's
   * light DOM so the client can access it immediately in hydrate()
   * without re-fetching.
   *
   * Default is false — hydrate() receives `data: null`. Most widgets
   * don't need this because the rendered Shadow DOM already contains
   * the visual representation of the data.
   *
   * If you find yourself parsing the shadow DOM in hydrate() trying to
   * reconstruct the original data object, set this to true instead.
   * The server-fetched data will be available as `args.data` in hydrate().
   */
  readonly exposeSsrData?: boolean;

  /**
   * Fetch or compute data based on params.
   * Called server-side for SSR, client-side for SPA.
   *
   * @example
   * ```ts
   * override async getData({ params, signal }: this['DataArgs']) {
   *   const res = await fetch(`/api/${params.id}`, { signal });
   *   return res.json();
   * }
   * ```
   */
  abstract getData(args: this['DataArgs']): Promise<TData | null>;

  /**
   * Render as markdown.
   * This is the canonical content representation.
   *
   * @example
   * ```ts
   * override renderMarkdown({ data }: this['RenderArgs']) {
   *   return `# ${data?.title}`;
   * }
   * ```
   */
  abstract renderMarkdown(args: this['RenderArgs']): string;

  /**
   * Render as HTML for browser context.
   *
   * Default implementation converts renderMarkdown() output to HTML.
   * Override for custom HTML rendering with rich styling/interactivity.
   */
  renderHTML(args: this['RenderArgs']): string {
    if (args.data === null) {
      return `<div data-component="${this.name}">Loading...</div>`;
    }
    // Default: wrap markdown in a container
    // The actual markdown→HTML conversion happens at render time
    const markdown = this.renderMarkdown({
      data: args.data,
      params: args.params,
      context: args.context,
    });
    return `<div data-component="${this.name}" data-markdown>${escapeHtml(markdown)}</div>`;
  }

  /**
   * Hydration hook called after SSR content is adopted or after SPA rendering.
   * Use to attach event listeners to existing DOM without re-rendering.
   *
   * @example
   * ```ts
   * override hydrate({ data, params, context }: this['RenderArgs']) {
   *   const button = this.element?.querySelector('button');
   *   button?.addEventListener('click', () => this.deleteItem(data.id));
   * }
   * ```
   */
  hydrate?(args: this['RenderArgs']): void;

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
    return `<div data-component="${this.name}">Error: ${escapeHtml(msg)}</div>`;
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
