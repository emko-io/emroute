/**
 * Widget Element - Browser Custom Element
 *
 * Renders Widget instances in the browser as `widget-{name}` elements.
 * Handles:
 * - SSR hydration (data-ssr attribute)
 * - Client-side data fetching with AbortSignal
 * - Companion file loading (html, md, css) with caching
 * - Loading/error states
 */

import type {
  Component,
  ComponentContext,
  ContextProvider,
} from '../component/abstract.component.ts';
import { DATA_SSR_ATTR, HTMLElementBase, LAZY_ATTR } from '../util/html.util.ts';

const COMPONENT_STATES = ['idle', 'loading', 'ready', 'error'] as const;
type ComponentState = (typeof COMPONENT_STATES)[number];

type WidgetFiles = { html?: string; md?: string; css?: string };

/**
 * Custom element that renders a Component in the browser.
 */
export class ComponentElement<TParams, TData> extends HTMLElementBase {
  /** Shared file content cache — deduplicates fetches across all widget instances. */
  private static fileCache = new Map<string, Promise<string | undefined>>();

  /** App-level context provider set once during router initialization. */
  private static extendContext: ContextProvider | undefined;

  /** Register (or clear) the context provider that enriches every widget's ComponentContext. */
  static setContextProvider(provider: ContextProvider | undefined): void {
    ComponentElement.extendContext = provider;
  }

  private component: Component<TParams, TData>;
  private effectiveFiles?: WidgetFiles;
  private params: TParams | null = null;
  private data: TData | null = null;
  private context: ComponentContext | undefined;
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
    // Attach shadow root (real in browser, mock on server)
    this.attachShadow({ mode: 'open' });
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
    this.component.element = this;
    this.style.contentVisibility = 'auto';
    this.style.containerType = 'inline-size';
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Parse params from element attributes
    const params: Record<string, unknown> = {};
    for (const attr of this.attributes) {
      if (attr.name === DATA_SSR_ATTR || attr.name === LAZY_ATTR) continue;
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

    const base: ComponentContext = {
      pathname: globalThis.location?.pathname ?? '/',
      pattern: '',
      params: {},
      searchParams: new URLSearchParams(globalThis.location?.search ?? ''),
      files: (files.html || files.md || files.css) ? files : undefined,
    };
    this.context = ComponentElement.extendContext ? ComponentElement.extendContext(base) : base;

    // Hydrate from SSR: move Light DOM content into shadow root
    const ssrAttr = this.getAttribute(DATA_SSR_ATTR);
    if (ssrAttr) {
      try {
        this.data = JSON.parse(ssrAttr);
        this.state = 'ready';
        this.removeAttribute(DATA_SSR_ATTR);

        // Move SSR-rendered Light DOM content into shadow root
        this.shadowRoot!.append(...this.childNodes);

        // Call hydrate() hook to attach event listeners
        if (this.component.hydrate) {
          queueMicrotask(() => {
            this.component.hydrate!();
          });
        }

        this.signalReady();
        return;
      } catch {
        // SSR data invalid - fall through to fetch
      }
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
    this.context = undefined;
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

    return { html, md, css };
  }

  private async loadData(): Promise<void> {
    if (this.params === null) return;

    const signal = this.abortController?.signal;

    this.state = 'loading';
    this.render();

    try {
      const promise = this.component.getData({
        params: this.params,
        signal,
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
      this.shadowRoot!.innerHTML = '';
      return;
    }

    if (this.state === 'error') {
      this.shadowRoot!.innerHTML = this.component.renderError({
        error: new Error(this.errorMessage),
        params: this.params,
      });
      return;
    }

    this.shadowRoot!.innerHTML = this.component.renderHTML({
      data: this.state === 'ready' ? this.data : null,
      params: this.params,
      context: this.context,
    });

    // Call hydrate() after rendering to attach event listeners
    if (this.state === 'ready' && this.component.hydrate) {
      queueMicrotask(() => {
        this.component.hydrate!();
      });
    }
  }
}
