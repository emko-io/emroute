/**
 * Widget Resolve Utilities
 *
 * Server-side resolution of <widget-*> tags in HTML.
 * Calls getData() + renderHTML() on widgets and injects SSR hydration data.
 */

import type { Component } from '../component/abstract.component.ts';
import type { RouteInfo } from '../type/route.type.ts';
import { DATA_SSR_ATTR } from './html.util.ts';

/**
 * Resolve <widget-*> tags in HTML by calling getData() + renderHTML()
 * via the widget registry. Injects rendered content and data-ssr attribute.
 *
 * Before: <widget-crypto-price coin="bitcoin"></widget-crypto-price>
 * After:  <widget-crypto-price coin="bitcoin" data-ssr='{"price":42000}'><span>$42,000</span></widget-crypto-price>
 */
export async function resolveWidgetTags(
  html: string,
  registry: { get(name: string): Component | undefined },
  routeInfo: RouteInfo,
  loadFiles?: (
    widgetName: string,
    declaredFiles?: { html?: string; md?: string; css?: string },
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
      if (loadFiles) {
        files = await loadFiles(widgetName, widget.files);
      }

      const context = { ...routeInfo, files };

      const data = await widget.getData({ params, context });
      const rendered = widget.renderHTML({ data, params, context });
      const ssrData = escapeAttr(JSON.stringify(data));
      const tagName = `widget-${widgetName}`;
      const attrs = attrsString ? ` ${attrsString}` : '';
      return `<${tagName}${attrs} ${DATA_SSR_ATTR}="${ssrData}">${rendered}</${tagName}>`;
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
    if (attrName === DATA_SSR_ATTR) continue;
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
