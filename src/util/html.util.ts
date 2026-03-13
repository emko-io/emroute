/**
 * HTML Utilities (Browser Layer)
 *
 * Re-exports pure functions from core/ and provides browser-specific
 * SSR-compatible HTMLElement mock.
 */

// Re-export everything from core
export {
  SSR_ATTR,
  LAZY_ATTR,
  assertSafeRedirect,
  escapeHtml,
  unescapeHtml,
  scopeWidgetCss,
  STATUS_MESSAGES,
} from '../../core/util/html.util.ts';

/**
 * SSR-compatible ShadowRoot mock.
 */
class SsrShadowRoot {
  private _innerHTML = '';

  constructor(public readonly host: SsrHTMLElement) {}

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(value: string) {
    this._innerHTML = value;
  }

  setHTMLUnsafe(html: string, _options?: Record<string, unknown>): void {
    this._innerHTML = html;
  }

  append(..._nodes: (Node | string)[]): void {}

  querySelector(_selector: string): Element | null {
    return null;
  }

  querySelectorAll(_selector: string): Element[] {
    return [];
  }

  get childNodes(): Node[] {
    return [];
  }

  get firstChild(): Node | null {
    return null;
  }
}

/**
 * SSR-compatible ElementInternals mock.
 */
class SsrElementInternals {
  readonly states = new Set<string>();
}

/**
 * SSR-compatible HTMLElement mock.
 */
class SsrHTMLElement {
  private _innerHTML = '';
  private _shadowRoot: SsrShadowRoot | null = null;
  private _attributes = new Map<string, string>();
  readonly style = new Proxy({} as CSSStyleDeclaration, {
    set(_target, _prop, _value) {
      return true;
    },
    get(_target, prop) {
      if (typeof prop === 'string') return '';
      return undefined;
    },
  });

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(value: string) {
    this._innerHTML = value;
  }

  get shadowRoot(): ShadowRoot | null {
    return this._shadowRoot as unknown as ShadowRoot;
  }

  get childNodes(): Node[] {
    return [];
  }

  get firstChild(): Node | null {
    return null;
  }

  get attributes(): NamedNodeMap {
    const attrs: Attr[] = [];
    for (const [name, value] of this._attributes) {
      attrs.push({ name, value } as Attr);
    }
    return attrs as unknown as NamedNodeMap;
  }

  attachShadow(_init: ShadowRootInit): ShadowRoot {
    this._shadowRoot = new SsrShadowRoot(this);
    return this._shadowRoot as unknown as ShadowRoot;
  }

  attachInternals(): ElementInternals {
    return new SsrElementInternals() as unknown as ElementInternals;
  }

  getAttribute(name: string): string | null {
    return this._attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this._attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this._attributes.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this._attributes.has(name);
  }

  querySelector(_selector: string): Element | null {
    return null;
  }

  querySelectorAll(_selector: string): Element[] {
    return [];
  }

  append(..._nodes: (Node | string)[]): void {}

  appendChild(node: Node): Node {
    return node;
  }
}

/** Server-safe base class: HTMLElement in browser, SSR mock on server. */
export const HTMLElementBase = globalThis.HTMLElement ??
  (SsrHTMLElement as unknown as typeof HTMLElement);
