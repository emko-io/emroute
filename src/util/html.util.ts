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
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Unescape HTML entities back to plain text (server-side, no DOM).
 */
export function unescapeHtml(text: string): string {
  return text
    .replace(/&#39;/g, "'")
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
 * Resolve <widget-*> tags in HTML by calling getData() + renderHTML()
 * via the widget registry. Injects rendered content and data-ssr attribute.
 *
 * Before: <widget-crypto-price coin="bitcoin"></widget-crypto-price>
 * After:  <widget-crypto-price coin="bitcoin" data-ssr='{"price":42000}'><span>$42,000</span></widget-crypto-price>
 */
export async function resolveWidgetTags(
  html: string,
  registry: { get(name: string): WidgetLike | undefined },
  pathname?: string,
  routeParams?: Record<string, string>,
  loadFiles?: (
    files: { html?: string; md?: string; css?: string },
  ) => Promise<{ html?: string; md?: string; css?: string }>,
): Promise<string> {
  const pattern = /<widget-([a-z][a-z0-9-]*)(\s[^>]*)?>([^]*?)<\/widget-\1>/gi;
  const matches = [...html.matchAll(pattern)];

  if (matches.length === 0) return html;

  // Resolve all widgets concurrently
  const replacements = await Promise.all(matches.map(async (match) => {
    const widgetName = match[1];
    const attrsString = match[2]?.trim() ?? '';
    const widget = registry.get(widgetName);

    if (!widget) return match[0]; // no widget found — leave as-is

    const params = parseAttrsToParams(attrsString);

    try {
      // Build context with optional file loading
      let files: { html?: string; md?: string; css?: string } | undefined;
      if (widget.files && loadFiles) {
        files = await loadFiles(widget.files);
      }

      const context: WidgetRouteContext | undefined = pathname
        ? { pathname, params: routeParams ?? {}, files }
        : files
        ? { pathname: '', params: {}, files }
        : undefined;

      const data = await widget.getData({ params, context });
      const rendered = widget.renderHTML({ data, params, context });
      const ssrData = escapeAttr(JSON.stringify(data));
      const tagName = `widget-${widgetName}`;
      const attrs = attrsString ? ` ${attrsString}` : '';
      return `<${tagName}${attrs} data-ssr="${ssrData}">${rendered}</${tagName}>`;
    } catch {
      return match[0]; // render failed — leave as-is
    }
  }));

  // Replace from end to preserve indices
  let result = html;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const start = match.index!;
    const end = start + match[0].length;
    result = result.slice(0, start) + replacements[i] + result.slice(end);
  }

  return result;
}

/** Parse HTML attribute string into params object (kebab→camelCase, JSON.parse with string fallback). */
export function parseAttrsToParams(attrsString: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (!attrsString) return params;

  const attrPattern = /([a-z][a-z0-9-]*)(?:="([^"]*)"|='([^']*)'|=([^\s>]+))?/gi;
  for (const match of attrsString.matchAll(attrPattern)) {
    const attrName = match[1];
    if (attrName === 'data-ssr') continue;
    const key = attrName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const rawValue = match[2] ?? match[3] ?? match[4];
    if (rawValue === undefined) {
      params[key] = '';
      continue;
    }
    const raw = rawValue.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    try {
      params[key] = JSON.parse(raw);
    } catch {
      params[key] = raw;
    }
  }

  return params;
}

/** Escape a value for use in an HTML attribute. */
function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** Route context passed to widgets during SSR resolution. */
export interface WidgetRouteContext {
  pathname: string;
  params: Record<string, string>;
  files?: { html?: string; md?: string; css?: string };
}

/** Minimal widget interface for resolveWidgetTags (avoids circular imports). */
interface WidgetLike {
  files?: { html?: string; md?: string; css?: string };
  getData(args: { params: unknown; context?: WidgetRouteContext }): Promise<unknown>;
  renderHTML(args: { data: unknown; params: unknown; context?: WidgetRouteContext }): string;
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
