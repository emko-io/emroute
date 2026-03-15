/**
 * Pure HTML utilities. No DOM, no browser APIs.
 */

/** HTML attribute name marking a widget as server-rendered. */
export const SSR_ATTR = 'ssr';

/** HTML attribute name for lazy-loading widgets. */
export const LAZY_ATTR = 'lazy';

/** Attribute names to skip when parsing widget params (not user-supplied data). */
export const RESERVED_ATTRS = new Set([SSR_ATTR, LAZY_ATTR, 'style', 'class', 'id', 'slot', 'part']);

const BLOCKED_PROTOCOLS = /^(javascript|data|vbscript):/i;

/** Throw if a redirect URL uses a dangerous protocol. */
export function assertSafeRedirect(url: string): void {
  if (BLOCKED_PROTOCOLS.test(url.trim())) {
    throw new Error(`Unsafe redirect URL blocked: ${url}`);
  }
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('`', '&#96;');
}

export function unescapeHtml(text: string): string {
  return text
    .replaceAll('&#96;', '`')
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

export function scopeWidgetCss(css: string, _widgetName: string): string {
  return `@layer emroute {\n${css}\n}`;
}

/** Status code to message mapping. */
export const STATUS_MESSAGES: Record<number, string> = {
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  500: 'Internal Server Error',
};
