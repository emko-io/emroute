/**
 * Fenced Block Utilities
 *
 * Post-processes markdown renderer output to convert fenced code blocks
 * into custom elements (router-slot and widget tags).
 */

type UnescapeHtml = (text: string) => string;

/**
 * Convert fenced router-slot code blocks to <router-slot> elements.
 */
export function processFencedSlots(html: string, unescape: UnescapeHtml): string {
  const pattern =
    /<pre><code (?:data-language|class)="(?:language-)?router-slot">(.*?)<\/code><\/pre>/gis;

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
    /<pre><code (?:data-language|class)="(?:language-)?widget:([a-z][a-z0-9-]*)">(.*?)<\/code><\/pre>/gis;

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
