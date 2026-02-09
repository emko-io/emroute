/**
 * Shared utilities for emroute
 */

/** Server-safe base class: HTMLElement in browser, inert class on server. */
export const HTMLElementBase = globalThis.HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

/**
 * Escape HTML entities for safe display.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Unescape HTML entities back to plain text (server-side, no DOM).
 */
export function unescapeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

type UnescapeHtml = (text: string) => string;

/**
 * Convert fenced router-slot code blocks to <router-slot> elements.
 */
export function processFencedSlots(html: string, unescape: UnescapeHtml): string {
  const pattern =
    /<pre><code (?:data-language|class)="(?:language-)?router-slot">([\s\S]*?)<\/code><\/pre>/gi;

  return html.replace(pattern, (_match, content) => {
    return `<router-slot>${unescape(content.trim())}</router-slot>`;
  });
}

/**
 * Convert fenced widget code blocks to custom elements.
 */
export function processFencedWidgets(
  html: string,
  unescape: UnescapeHtml,
): string {
  const pattern =
    /<pre><code (?:data-language|class)="(?:language-)?widget:([a-z][a-z0-9-]*)">([\s\S]*?)<\/code><\/pre>/gi;

  return html.replace(pattern, (_match, widgetName, paramsJson) => {
    const decoded = unescape(paramsJson.trim());
    const tagName = `widget-${widgetName}`;

    if (!decoded) {
      return `<${tagName}></${tagName}>`;
    }

    let params: Record<string, unknown>;
    try {
      params = JSON.parse(decoded);
    } catch {
      return `<${tagName}></${tagName}>`;
    }

    const attrs = Object.entries(params)
      .map(([key, value]) => {
        const attrName = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        const attrValue = typeof value === 'string' ? value : JSON.stringify(value);
        return `${attrName}="${attrValue.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
      })
      .join(' ');

    return `<${tagName} ${attrs}></${tagName}>`;
  });
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
