/**
 * Widget Resolve Utilities
 *
 * Server-side resolution of <widget-*> tags in HTML.
 * Calls getData() + renderHTML() on widgets and injects SSR hydration data.
 */

import type { Component, ContextProvider } from '../component/abstract.component.ts';
import { logger } from '../type/logger.type.ts';
import type { RouteInfo } from '../type/route.type.ts';
import { DATA_SSR_ATTR, LAZY_ATTR } from './html.util.ts';

/** Maximum nesting depth for widgets to prevent infinite loops */
const MAX_WIDGET_DEPTH = 10;

/**
 * Resolve <widget-*> tags in HTML by calling getData() + renderHTML()
 * via the widget registry. Injects rendered content and data-ssr attribute.
 *
 * Supports nested widgets: if a widget's renderHTML() returns HTML containing
 * other <widget-*> tags, those will be resolved recursively up to MAX_WIDGET_DEPTH.
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
  contextProvider?: ContextProvider,
  depth = 0,
): Promise<string> {
  // Safety check for recursion depth
  if (depth >= MAX_WIDGET_DEPTH) {
    logger.warn(
      `[SSR HTML] Widget nesting depth limit reached (${MAX_WIDGET_DEPTH}). ` +
        'Possible circular dependency or excessive nesting.',
    );
    return html;
  }

  const pattern =
    /<widget-(?<name>[a-z][a-z0-9-]*)(?<attrs>\s[^>]*)?>(?<content>.*?)<\/widget-\k<name>>/gis;

  const matches = html.matchAll(pattern).toArray();

  // Filter out widgets that have already been processed (have data-ssr attribute)
  const unprocessed = matches.filter((match) => {
    const attrsString = match.groups!.attrs || '';
    return !attrsString.includes(DATA_SSR_ATTR);
  });

  if (unprocessed.length === 0) return html;

  // Process each widget: resolve nested widgets in content first, then process the widget itself
  const replacements = await Promise.all(
    unprocessed.map(async (match) => {
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

        const baseContext = { ...routeInfo, files };
        const context = contextProvider ? contextProvider(baseContext) : baseContext;

        const data = await widget.getData({ params, context });
        let rendered = widget.renderHTML({ data, params, context });

        // Recursively resolve any nested widgets in the rendered output
        rendered = await resolveWidgetTags(
          rendered,
          registry,
          routeInfo,
          loadFiles,
          contextProvider,
          depth + 1,
        );

        const ssrData = escapeAttr(JSON.stringify(data));
        const tagName = `widget-${widgetName}`;
        const attrs = attrsString ? ` ${attrsString}` : '';
        return `<${tagName}${attrs} ${DATA_SSR_ATTR}='${ssrData}'>${rendered}</${tagName}>`;
      } catch (e) {
        logger.error(
          `[SSR HTML] Widget "${widgetName}" render failed`,
          e instanceof Error ? e : undefined,
        );
        return match[0]; // render failed — leave as-is
      }
    }),
  );

  // Replace from end to preserve indices
  let result = html;
  for (let i = unprocessed.length - 1; i >= 0; i--) {
    const match = unprocessed[i];
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
    if (attrName === DATA_SSR_ATTR || attrName === LAZY_ATTR) continue;
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

/** Escape a value for use in a single-quoted HTML attribute. */
function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll("'", '&#39;');
}
