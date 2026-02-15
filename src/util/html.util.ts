/**
 * Core HTML utilities for emroute
 */

/** HTML attribute name used for SSR hydration data on widgets. */
export const DATA_SSR_ATTR = 'data-ssr';

/** HTML attribute name for lazy-loading widgets via IntersectionObserver. */
export const LAZY_ATTR = 'lazy';

/**
 * SSR-compatible ShadowRoot mock.
 * Mimics browser ShadowRoot API for server-side rendering.
 */
class SsrShadowRoot {
  private _innerHTML = '';
  private _children: Node[] = [];

  constructor(public readonly host: SsrHTMLElement) {}

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(value: string) {
    this._innerHTML = value;
  }

  querySelector(_selector: string): Element | null {
    // Mock implementation - could parse innerHTML if needed
    return null;
  }

  querySelectorAll(_selector: string): NodeListOf<Element> {
    return [] as unknown as NodeListOf<Element>;
  }

  appendChild(node: Node): Node {
    this._children.push(node);
    return node;
  }

  get firstChild(): Node | null {
    return this._children[0] ?? null;
  }
}

/**
 * SSR-compatible HTMLElement mock.
 * Mimics browser HTMLElement API for server-side rendering.
 */
class SsrHTMLElement {
  private _innerHTML = '';
  private _shadowRoot: SsrShadowRoot | null = null;
  private _attributes = new Map<string, string>();
  private _style: Partial<CSSStyleDeclaration> = {};

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(value: string) {
    this._innerHTML = value;
  }

  get shadowRoot(): ShadowRoot | null {
    return this._shadowRoot as unknown as ShadowRoot;
  }

  get style(): CSSStyleDeclaration {
    return this._style as CSSStyleDeclaration;
  }

  get attributes(): NamedNodeMap {
    const attrs: Attr[] = [];
    for (const [name, value] of this._attributes) {
      attrs.push({ name, value } as Attr);
    }
    return attrs as unknown as NamedNodeMap;
  }

  get firstChild(): Node | null {
    return null;
  }

  attachShadow(_init: ShadowRootInit): ShadowRoot {
    this._shadowRoot = new SsrShadowRoot(this);
    return this._shadowRoot as unknown as ShadowRoot;
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

  querySelectorAll(_selector: string): NodeListOf<Element> {
    return [] as unknown as NodeListOf<Element>;
  }

  appendChild(node: Node): Node {
    return node;
  }
}

/** Server-safe base class: HTMLElement in browser, SSR mock on server. */
export const HTMLElementBase = globalThis.HTMLElement ??
  (SsrHTMLElement as unknown as typeof HTMLElement);

/**
 * Escape HTML entities for safe display.
 */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('`', '&#96;');
}

/**
 * Unescape HTML entities back to plain text (server-side, no DOM).
 */
export function unescapeHtml(text: string): string {
  return text
    .replaceAll('&#96;', '`')
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

/**
 * Wrap CSS in a `@scope` rule scoped to the widget's custom element tag.
 * Used by `WidgetComponent.renderHTML()` for companion CSS files.
 */
export function scopeWidgetCss(css: string, widgetName: string): string {
  return `@scope (widget-${widgetName}) {\n${css}\n}`;
}

/**
 * Status code to message mapping.
 */
export const STATUS_MESSAGES: Record<number, string> = {
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  500: 'Internal Server Error',
};
