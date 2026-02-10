/**
 * Widget Resolve Utilities
 *
 * Server-side resolution of <widget-*> tags in HTML.
 * Calls getData() + renderHTML() on widgets and injects SSR hydration data.
 */

import type { Component } from '../component/abstract.component.ts';
import { logger } from '../type/logger.type.ts';
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
  const pattern =
    /<widget-(?<name>[a-z][a-z0-9-]*)(?<attrs>\s[^>]*)?>(?<content>.*?)<\/widget-\k<name>>/gis;
  const matches = html.matchAll(pattern).toArray();

  if (matches.length === 0) return html;

  // Resolve all widgets concurrently
  const replacements = await Promise.all(matches.map(async (match) => {
    const widgetName = match.groups!.name;
    const attrsString = match.groups!.attrs?.trim() ?? '';
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
    } catch (e) {
      logger.error(
        `[SSR HTML] Widget "${widgetName}" render failed`,
        e instanceof Error ? e : undefined,
      );
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

  const attrPattern =
    /(?<attr>[a-z][a-z0-9-]*)(?:="(?<dq>[^"]*)"|='(?<sq>[^']*)'|=(?<uq>[^\s>]+))?/gi;
  for (const match of attrsString.matchAll(attrPattern)) {
    const { attr: attrName, dq, sq, uq } = match.groups!;
    if (attrName === DATA_SSR_ATTR) continue;
    const key = attrName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const rawValue = dq ?? sq ?? uq;
    if (rawValue === undefined) {
      params[key] = '';
      continue;
    }
    const raw = rawValue.replaceAll('&amp;', '&').replaceAll('&quot;', '"');
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
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
