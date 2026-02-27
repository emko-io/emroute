/**
 * Widget Element - Browser Custom Element
 *
 * Renders Widget instances in the browser as `widget-{name}` elements.
 * Handles:
 * - SSR hydration (ssr attribute)
 * - Client-side data fetching with AbortSignal
 * - Companion file loading (html, md, css) with caching
 * - Loading/error states
 */

import type {
  Component,
  ComponentContext,
  ContextProvider,
} from '../component/abstract.component.ts';
import { HTMLElementBase, LAZY_ATTR, SSR_ATTR } from '../util/html.util.ts';

type ComponentState = 'idle' | 'loading' | 'ready' | 'error';

/** Strip keys with undefined values — returns the filtered object, or undefined if all values are undefined. */
function filterUndefined<T extends Record<string, unknown>>(obj: T): { [K in keyof T as T[K] extends undefined ? never : K]: NonNullable<T[K]> } | undefined {
  const result: Record<string, unknown> = {};
  let hasValue = false;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) { result[k] = v; hasValue = true; }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return hasValue ? result as any : undefined;
}

type WidgetFiles = { html?: string; md?: string; css?: string };

/**
 * Custom element that renders a Component in the browser.
 */
export class ComponentElement<TParams, TData> extends HTMLElementBase {
  /** Shared file content cache — deduplicates fetches across all widget instances. */
  private static fileCache = new Map<string, Promise<string | undefined>>();

  /** Lazy module loaders keyed by tag name — set by registerLazy(). */
  private static lazyLoaders = new Map<string, () => Promise<unknown>>();

  /** Cached module promises for lazy-loaded widgets — avoids re-fetching. */
  private static lazyModules = new Map<string, Promise<unknown>>();

  /** App-level context provider set once during router initialization. */
  private static extendContext: ContextProvider | undefined;

  /** Register (or clear) the context provider that enriches every widget's ComponentContext. */
  static setContextProvider(provider: ContextProvider | undefined): void {
    ComponentElement.extendContext = provider;
  }

  private component: Component<TParams, TData>;
  private effectiveFiles?: WidgetFiles | undefined;
  private params: TParams | null = null;
  private data: TData | null = null;
  private context!: ComponentContext;
  private state: ComponentState = 'idle';
  private errorMessage = '';
  private deferred: PromiseWithResolvers<void> | null = null;
  private abortController: AbortController | null = null;
  private intersectionObserver: IntersectionObserver | null = null;

  /** Promise that resolves with fetched data (available after loadData starts) */
  dataPromise: Promise<TData | null> | null = null;

  constructor(component: Component<TParams, TData>, files?: WidgetFiles) {
    super();
    this.component = component;
    this.effectiveFiles = files;
    // Attach shadow root if not already present (Declarative Shadow DOM creates it from <template shadowrootmode="open">)
    // This enables progressive enhancement: SSR with DSD works without JS, then hydrates when JS loads
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
  }

  /**
   * Register a widget as a custom element: `widget-{name}`.
   * Creates a fresh widget instance per DOM element (per-element state).
   * Optional `files` parameter provides discovered file paths without mutating
   * the component instance.
   */
  static register<TP, TD>(
    component: Component<TP, TD>,
    files?: WidgetFiles,
  ): void {
    const tagName = `widget-${component.name}`;

    if (!globalThis.customElements || customElements.get(tagName)) {
      return;
    }

    const WidgetClass = component.constructor as new () => Component<TP, TD>;

    const BoundElement = class extends ComponentElement<TP, TD> {
      constructor() {
        super(new WidgetClass(), files);
      }
    };

    customElements.define(tagName, BoundElement);
  }

  /**
   * Register a widget class (not instance) as a custom element: `widget-{name}`.
   * Used for manifest-based registration where classes are loaded dynamically.
   */
  static registerClass<TP, TD>(
    WidgetClass: new () => Component<TP, TD>,
    name: string,
    files?: WidgetFiles,
  ): void {
    const tagName = `widget-${name}`;

    if (!globalThis.customElements || customElements.get(tagName)) {
      return;
    }

    const BoundElement = class extends ComponentElement<TP, TD> {
      constructor() {
        super(new WidgetClass(), files);
      }
    };

    customElements.define(tagName, BoundElement);
  }

  /**
   * Register a widget lazily: define the custom element immediately (so SSR
   * content via Declarative Shadow DOM is adopted), but defer loading the
   * module until connectedCallback fires. Once loaded, the real component
   * replaces the placeholder and hydration proceeds normally.
   */
  static registerLazy(
    name: string,
    files: WidgetFiles | undefined,
    loader: () => Promise<unknown>,
  ): void {
    const tagName = `widget-${name}`;
    if (!globalThis.customElements || customElements.get(tagName)) return;

    ComponentElement.lazyLoaders.set(tagName, loader);

    // Placeholder component — replaced by the real one once the module loads.
    // Cast needed because Component is abstract; the real module replaces this.
    const placeholder = {
      name,
      getData: () => Promise.resolve(null),
      renderHTML: () => '',
      renderMarkdown: () => '',
      renderError: () => '',
      renderMarkdownError: () => '',
    } as unknown as Component<unknown, unknown>;

    const BoundElement = class extends ComponentElement<unknown, unknown> {
      constructor() {
        super(placeholder, files);
      }
    };

    customElements.define(tagName, BoundElement);
  }

  /**
   * Promise that resolves when component is ready (data loaded and rendered).
   * Used by router to wait for async components.
   */
  get ready(): Promise<void> {
    if (this.state === 'ready') {
      return Promise.resolve();
    }
    this.deferred ??= Promise.withResolvers<void>();
    return this.deferred.promise;
  }

  async connectedCallback(): Promise<void> {
    // Lazy module loading — resolve actual component before proceeding
    const tagName = this.tagName.toLowerCase();
    const lazyLoader = ComponentElement.lazyLoaders.get(tagName);
    if (lazyLoader) {
      try {
        let modulePromise = ComponentElement.lazyModules.get(tagName);
        if (!modulePromise) {
          modulePromise = lazyLoader();
          ComponentElement.lazyModules.set(tagName, modulePromise);
        }
        const mod = await modulePromise as Record<string, unknown>;
        for (const exp of Object.values(mod)) {
          if (exp && typeof exp === 'object' && 'getData' in exp) {
            const WidgetClass = exp.constructor as new () => Component<TParams, TData>;
            this.component = new WidgetClass();
            break;
          }
          if (typeof exp === 'function' && (exp as { prototype?: { getData?: unknown } }).prototype?.getData) {
            this.component = new (exp as new () => Component<TParams, TData>)();
            break;
          }
        }
      } catch {
        // Module failed to load (e.g. raw .ts served without transpilation).
        // SSR content is already visible — skip hydration gracefully.
        if (this.hasAttribute(SSR_ATTR)) {
          this.removeAttribute(SSR_ATTR);
          this.signalReady();
          return;
        }
      }
    }

    this.component.element = this;
    this.style.contentVisibility = 'auto';
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Parse params from element attributes
    const params: Record<string, unknown> = {};
    for (const attr of this.attributes) {
      if (attr.name === SSR_ATTR || attr.name === LAZY_ATTR) continue;
      const key = attr.name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      try {
        params[key] = JSON.parse(attr.value);
      } catch {
        params[key] = attr.value;
      }
    }
    this.params = params as TParams;

    // Validate params
    if (this.component.validateParams && this.params !== null) {
      const error = this.component.validateParams(this.params);
      if (error) {
        this.setError(error);
        return;
      }
    }

    // Load companion files (html, md, css) if declared
    const files = await this.loadFiles();
    if (signal.aborted) return;

    const currentUrl = globalThis.location ? new URL(location.href) : new URL('http://localhost/');
    const filteredFiles = filterUndefined(files);
    const base: ComponentContext = {
      url: currentUrl,
      pathname: currentUrl.pathname,
      searchParams: currentUrl.searchParams,
      params: this.params ?? {},
      ...(filteredFiles ? { files: filteredFiles } : {}),
    };
    this.context = ComponentElement.extendContext ? ComponentElement.extendContext(base) : base;

    // Hydrate from SSR: adopt content from Declarative Shadow DOM
    if (this.hasAttribute(SSR_ATTR)) {
      this.removeAttribute(SSR_ATTR);

      // Read SSR data from light DOM (JSON text placed alongside shadow root)
      const lightText = this.textContent?.trim();
      if (lightText) {
        try {
          this.data = JSON.parse(lightText);
        } catch {
          // Not valid JSON — proceed with data: null
        }
      }
      // Clear light DOM content (JSON text)
      this.textContent = '';

      this.state = 'ready';

      // Call hydrate() hook to attach event listeners
      if (this.component.hydrate) {
        const args = { data: this.data, params: this.params!, context: this.context };
        queueMicrotask(() => {
          this.component.hydrate!(args);
        });
      }

      this.signalReady();
      return;
    }

    // Lazy: defer loadData until element is visible
    if (this.hasAttribute(LAZY_ATTR)) {
      this.intersectionObserver = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          this.intersectionObserver?.disconnect();
          this.intersectionObserver = null;
          this.loadData();
        }
      });
      this.intersectionObserver.observe(this);
      return;
    }

    await this.loadData();
  }

  disconnectedCallback(): void {
    this.component.destroy?.();
    this.component.element = undefined;
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    this.abortController?.abort();
    this.abortController = null;
    this.state = 'idle';
    this.data = null;
    this.context = undefined!;
    this.dataPromise = null;
    this.errorMessage = '';
    this.signalReady();
    this.deferred = null;
  }

  /**
   * Reload component data. Aborts any in-flight request first.
   */
  async reload(): Promise<void> {
    if (this.params === null) return;

    // Abort previous and create fresh controller
    this.abortController?.abort();
    this.abortController = new AbortController();

    await this.loadData();
  }

  /**
   * Fetch a single file by path, with caching.
   * Absolute URLs (http/https) pass through; relative paths get '/' prefix.
   */
  private static loadFile(path: string): Promise<string | undefined> {
    const cached = ComponentElement.fileCache.get(path);
    if (cached) return cached;

    const url = path.startsWith('http://') || path.startsWith('https://')
      ? path
      : (path.startsWith('/') ? path : '/' + path);

    const promise = fetch(url).then(
      (res) => res.ok ? res.text() : undefined,
      () => undefined,
    );

    ComponentElement.fileCache.set(path, promise);
    return promise;
  }

  /**
   * Load all companion files for this widget instance.
   * Uses effectiveFiles (from registration) falling back to component.files.
   */
  private async loadFiles(): Promise<{ html?: string; md?: string; css?: string }> {
    const filePaths = this.effectiveFiles ?? this.component.files;
    if (!filePaths) return {};

    const [html, md, css] = await Promise.all([
      filePaths.html ? ComponentElement.loadFile(filePaths.html) : undefined,
      filePaths.md ? ComponentElement.loadFile(filePaths.md) : undefined,
      filePaths.css ? ComponentElement.loadFile(filePaths.css) : undefined,
    ]);

    return filterUndefined({ html, md, css }) ?? {};
  }

  private async loadData(): Promise<void> {
    if (this.params === null) return;

    const signal = this.abortController?.signal;

    this.state = 'loading';
    this.render();

    try {
      const promise = this.component.getData({
        params: this.params,
        ...(signal ? { signal } : {}),
        context: this.context,
      });
      this.dataPromise = promise;
      this.data = await promise;

      // Check abort after await — don't touch DOM if disconnected
      if (signal?.aborted) return;

      this.state = 'ready';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (signal?.aborted) return;

      this.setError(e instanceof Error ? e.message : String(e));
      return;
    }

    this.render();
    this.signalReady();
  }

  private setError(message: string): void {
    this.state = 'error';
    this.errorMessage = message;
    this.render();
    this.signalReady(); // Ready even on error (completed loading)
  }

  private signalReady(): void {
    this.deferred?.resolve();
    this.deferred = null;
  }

  private render(): void {
    if (this.params === null) {
      this.shadowRoot!.setHTMLUnsafe('');
      return;
    }

    if (this.state === 'error') {
      this.shadowRoot!.setHTMLUnsafe(this.component.renderError({
        error: new Error(this.errorMessage),
        params: this.params,
      }));
      return;
    }

    this.shadowRoot!.setHTMLUnsafe(this.component.renderHTML({
      data: this.state === 'ready' ? this.data : null,
      params: this.params,
      context: this.context,
    }));

    // Call hydrate() after rendering to attach event listeners
    if (this.state === 'ready' && this.component.hydrate) {
      const args = { data: this.data, params: this.params!, context: this.context };
      queueMicrotask(() => {
        this.component.hydrate!(args);
      });
    }
  }
}
