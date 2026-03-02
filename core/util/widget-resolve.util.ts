/**
 * Widget Resolve Utilities
 *
 * Server-side resolution of <widget-*> tags in HTML.
 * Calls getData() + renderHTML() on widgets and injects SSR hydration data.
 */

import type { Component } from '../component/abstract.component.ts';
import type { ComponentContext, ContextProvider } from '../type/component.type.ts';
import { logger } from '../type/logger.type.ts';
import type { RouteInfo } from '../type/route.type.ts';
import { LAZY_ATTR, SSR_ATTR } from './html.util.ts';

/** Maximum nesting depth for widgets to prevent infinite loops */
export const MAX_WIDGET_DEPTH = 10;

/**
 * Recursively resolve widgets in content with depth limit.
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
      rendered = await resolveRecursively(rendered, parse, resolve, replace, depth + 1);
      replacements.set(widget, rendered);
    }),
  );

  return replace(content, replacements);
}

/**
 * Resolve <widget-*> tags in HTML by calling getData() + renderHTML().
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

  const wrappers = new Map<RegExpExecArray, { tagName: string; attrs: string; ssrData: string }>();
  const ssrAttrPattern = new RegExp(`\\s${SSR_ATTR}(?:\\s|=|$)`);

  const parse = (content: string) => {
    const matches = content.matchAll(tagPattern).toArray();
    return matches.filter((match) => {
      const attrsString = match.groups!.attrs || '';
      return !ssrAttrPattern.test(attrsString);
    });
  };

  const resolve = async (match: RegExpExecArray): Promise<string> => {
    const widgetName = match.groups!.name;
    const attrsString = match.groups!.attrs?.trim() ?? '';
    const widget = registry.get(widgetName);

    if (!widget) return match[0];

    const params = parseAttrsToParams(attrsString);

    try {
      let files: { html?: string; md?: string; css?: string } | undefined;
      if (loadFiles) {
        files = await loadFiles(widgetName, widget.files);
      }

      const baseContext: ComponentContext = {
        ...routeInfo,
        pathname: routeInfo.url.pathname,
        searchParams: routeInfo.url.searchParams,
        ...(files ? { files } : {}),
      };
      const context: ComponentContext = contextProvider ? contextProvider(baseContext) : baseContext;

      const data = await widget.getData({ params, context });
      const rendered = widget.renderHTML({ data, params, context });

      wrappers.set(match, {
        tagName: `widget-${widgetName}`,
        attrs: attrsString ? ` ${attrsString}` : '',
        ssrData: widget.exposeSsrData ? escapeAttr(JSON.stringify(data)) : '',
      });

      return rendered;
    } catch (e) {
      logger.error(
        `[SSR HTML] Widget "${widgetName}" render failed`,
        e instanceof Error ? e : undefined,
      );
      return match[0];
    }
  };

  const replace = (content: string, replacements: Map<RegExpExecArray, string>) => {
    let result = content;
    const entries = [...replacements.entries()].sort((a, b) => b[0].index! - a[0].index!);
    for (const [match, innerHtml] of entries) {
      const start = match.index!;
      const end = start + match[0].length;
      const wrap = wrappers.get(match);
      const lightDomData = wrap?.ssrData ? wrap.ssrData : '';
      const replacement = wrap
        ? `<${wrap.tagName}${wrap.attrs} ${SSR_ATTR}><template shadowrootmode="open">${innerHtml}</template>${lightDomData}</${wrap.tagName}>`
        : innerHtml;
      result = result.slice(0, start) + replacement + result.slice(end);
    }
    return result;
  };

  return resolveRecursively(html, parse, resolve, replace);
}

/** Parse HTML attribute string into params object. */
export function parseAttrsToParams(attrsString: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (!attrsString) return params;

  const attrPattern =
    /(?<attr>[a-z][a-z0-9-]*)(?:="(?<dq>[^"]*)"|='(?<sq>[^']*)'|=(?<uq>[^\s>]+))?/gi;
  for (const match of attrsString.matchAll(attrPattern)) {
    const { attr: attrName, dq, sq, uq } = match.groups!;
    if (attrName === SSR_ATTR || attrName === LAZY_ATTR) continue;
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

function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll("'", '&#39;');
}
