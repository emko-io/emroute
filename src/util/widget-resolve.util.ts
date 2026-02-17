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
export const MAX_WIDGET_DEPTH = 10;

/**
 * Recursively resolve widgets in content with depth limit.
 *
 * Generic utility used by both HTML and Markdown widget resolution.
 * Each depth level processes all widgets concurrently, then recurses
 * into each rendered result to resolve nested widgets.
 *
 * @param content - Content containing widgets
 * @param parse - Find widgets in content
 * @param resolve - Resolve a single widget to rendered output
 * @param replace - Replace widgets with resolved content
 * @param depth - Current recursion depth (internal)
 * @returns Content with all widgets recursively resolved
 */
export async function resolveRecursively<T>(
  content: string,
  parse: (content: string) => T[],
  resolve: (widget: T) => Promise<string>,
  replace: (content: string, replacements: Map<T, string>) => string,
  depth = 0,
): Promise<string> {
  if (depth >= MAX_WIDGET_DEPTH) {
    logger.warn(
      `Widget nesting depth limit reached (${MAX_WIDGET_DEPTH}). ` +
        'Possible circular dependency or excessive nesting.',
    );
    return content;
  }

  const widgets = parse(content);
  if (widgets.length === 0) return content;

  const replacements = new Map<T, string>();
  await Promise.all(
    widgets.map(async (widget) => {
      let rendered = await resolve(widget);

      // Recursively resolve any nested widgets in the rendered output
      rendered = await resolveRecursively(rendered, parse, resolve, replace, depth + 1);

      replacements.set(widget, rendered);
    }),
  );

  return replace(content, replacements);
}

/**
 * Resolve <widget-*> tags in HTML by calling getData() + renderHTML()
 * via the widget registry. Injects rendered content and data-ssr attribute.
 *
 * Supports nested widgets: if a widget's renderHTML() returns HTML containing
 * other <widget-*> tags, those will be resolved recursively up to MAX_WIDGET_DEPTH.
 *
 * Before: <widget-crypto-price coin="bitcoin"></widget-crypto-price>
 * After:  <widget-crypto-price coin="bitcoin" data-ssr='{"price":42000}'><template shadowrootmode="open"><span>$42,000</span></template></widget-crypto-price>
 */
export function resolveWidgetTags(
  html: string,
  registry: { get(name: string): Component | undefined },
  routeInfo: RouteInfo,
  loadFiles?: (
    widgetName: string,
    declaredFiles?: { html?: string; md?: string; css?: string },
  ) => Promise<{ html?: string; md?: string; css?: string }>,
  contextProvider?: ContextProvider,
): Promise<string> {
  const tagPattern =
    /<widget-(?<name>[a-z][a-z0-9-]*)(?<attrs>\s[^>]*)?>(?<content>.*?)<\/widget-\k<name>>/gis;

  // Wrapping info stored per-match so replace() can apply it after recursion
  const wrappers = new Map<RegExpExecArray, { tagName: string; attrs: string; ssrData: string }>();

  // Parse: find unprocessed widget tags
  const parse = (content: string) => {
    const matches = content.matchAll(tagPattern).toArray();
    return matches.filter((match) => {
      const attrsString = match.groups!.attrs || '';
      return !attrsString.includes(DATA_SSR_ATTR);
    });
  };

  // Resolve: render a single widget's inner content (no outer tag wrapping — that's in replace)
  const resolve = async (match: RegExpExecArray): Promise<string> => {
    const widgetName = match.groups!.name;
    const attrsString = match.groups!.attrs?.trim() ?? '';
    const widget = registry.get(widgetName);

    if (!widget) return match[0]; // no widget found — leave original tag as-is

    const params = parseAttrsToParams(attrsString);

    try {
      let files: { html?: string; md?: string; css?: string } | undefined;
      if (loadFiles) {
        files = await loadFiles(widgetName, widget.files);
      }

      const baseContext = { ...routeInfo, files };
      const context = contextProvider ? contextProvider(baseContext) : baseContext;

      const data = await widget.getData({ params, context });
      const rendered = widget.renderHTML({ data, params, context });

      // Store wrapping info — applied in replace() after recursion resolves nested widgets
      wrappers.set(match, {
        tagName: `widget-${widgetName}`,
        attrs: attrsString ? ` ${attrsString}` : '',
        ssrData: escapeAttr(JSON.stringify(data)),
      });

      return rendered;
    } catch (e) {
      logger.error(
        `[SSR HTML] Widget "${widgetName}" render failed`,
        e instanceof Error ? e : undefined,
      );
      return match[0]; // render failed — leave original tag as-is
    }
  };

  // Replace: wrap resolved content in outer tag + DSD template, then substitute by index
  const replace = (content: string, replacements: Map<RegExpExecArray, string>) => {
    let result = content;
    const entries = [...replacements.entries()].sort((a, b) => b[0].index! - a[0].index!);
    for (const [match, innerHtml] of entries) {
      const start = match.index!;
      const end = start + match[0].length;
      const wrap = wrappers.get(match);
      const replacement = wrap
        ? `<${wrap.tagName}${wrap.attrs} ${DATA_SSR_ATTR}='${wrap.ssrData}'><template shadowrootmode="open">${innerHtml}</template></${wrap.tagName}>`
        : innerHtml; // no wrapper = unresolved widget, innerHtml is the original tag
      result = result.slice(0, start) + replacement + result.slice(end);
    }
    return result;
  };

  return resolveRecursively(html, parse, resolve, replace);
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
    const raw = rawValue.replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll(
      '&quot;',
      '"',
    );
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
