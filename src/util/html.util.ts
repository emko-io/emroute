/**
 * Core HTML utilities for emroute
 */

/** HTML attribute name used for SSR hydration data on widgets. */
export const DATA_SSR_ATTR = 'data-ssr';

/** HTML attribute name for lazy-loading widgets via IntersectionObserver. */
export const LAZY_ATTR = 'lazy';

/** Server-safe base class: HTMLElement in browser, inert class on server. */
export const HTMLElementBase = globalThis.HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

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
