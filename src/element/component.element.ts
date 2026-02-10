/**
 * Widget Element - Browser Custom Element
 *
 * Renders Widget instances in the browser as `widget-{name}` elements.
 * Handles:
 * - SSR hydration (data-ssr attribute)
 * - Client-side data fetching with AbortSignal
 * - Loading/error states
 */

import type { Component } from '../component/abstract.component.ts';
import { DATA_SSR_ATTR, HTMLElementBase } from '../util/html.util.ts';

const COMPONENT_STATES = ['idle', 'loading', 'ready', 'error'] as const;
type ComponentState = (typeof COMPONENT_STATES)[number];

/**
 * Custom element that renders a Component in the browser.
 */
export class ComponentElement<TParams, TData> extends HTMLElementBase {
  private component: Component<TParams, TData>;
  private params: TParams | null = null;
  private data: TData | null = null;
  private state: ComponentState = 'idle';
  private errorMessage = '';
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private abortController: AbortController | null = null;

  /** Promise that resolves with fetched data (available after loadData starts) */
  dataPromise: Promise<TData | null> | null = null;

  constructor(component: Component<TParams, TData>) {
    super();
    this.component = component;
  }

  /**
   * Register a widget as a custom element: `widget-{name}`.
   */
  static register<TP, TD>(component: Component<TP, TD>): void {
    const tagName = `widget-${component.name}`;

    if (!globalThis.customElements || customElements.get(tagName)) {
      return;
    }

    const BoundElement = class extends ComponentElement<TP, TD> {
      constructor() {
        super(component);
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
    if (!this.readyPromise) {
      this.readyPromise = new Promise((resolve) => {
        this.readyResolve = resolve;
      });
    }
    return this.readyPromise;
  }

  async connectedCallback(): Promise<void> {
    this.abortController = new AbortController();

    // Parse params from element attributes
    const params: Record<string, unknown> = {};
    for (const attr of this.attributes) {
      if (attr.name === DATA_SSR_ATTR) continue;
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

    // Hydrate from SSR: DOM is already correct, just restore state
    const ssrAttr = this.getAttribute(DATA_SSR_ATTR);
    if (ssrAttr) {
      try {
        this.data = JSON.parse(ssrAttr);
        this.state = 'ready';
        this.removeAttribute(DATA_SSR_ATTR);
        this.signalReady();
        return;
      } catch {
        // SSR data invalid - fall through to fetch
      }
    }

    await this.loadData();
  }

  disconnectedCallback(): void {
    this.component.destroy?.();
    this.abortController?.abort();
    this.abortController = null;
    this.state = 'idle';
    this.data = null;
    this.dataPromise = null;
    this.errorMessage = '';
    this.signalReady();
    this.readyPromise = null;
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

  private async loadData(): Promise<void> {
    if (this.params === null) return;

    const signal = this.abortController?.signal;

    this.state = 'loading';
    this.render();

    try {
      const promise = this.component.getData({ params: this.params, signal });
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
    if (this.readyResolve) {
      this.readyResolve();
      this.readyResolve = null;
    }
  }

  private render(): void {
    if (this.params === null) {
      this.innerHTML = '';
      return;
    }

    if (this.state === 'error') {
      this.innerHTML = this.component.renderError({
        error: new Error(this.errorMessage),
        params: this.params,
      });
      return;
    }

    this.innerHTML = this.component.renderHTML({
      data: this.state === 'ready' ? this.data : null,
      params: this.params,
    });
  }
}
