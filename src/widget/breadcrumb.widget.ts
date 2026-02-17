/**
 * Built-in Breadcrumb Widget
 *
 * Renders breadcrumb navigation from the current URL path.
 * Uses /html/ prefix for links (content-first routing convention).
 *
 * Usage in .page.html:
 *   <widget-breadcrumb></widget-breadcrumb>
 *   <widget-breadcrumb separator=" / " class="my-breadcrumbs"></widget-breadcrumb>
 *
 * Usage in .page.md:
 *   ```widget:breadcrumb
 *   {}
 *   ```
 */

import { WidgetComponent } from '../component/widget.component.ts';
import { escapeHtml } from '../util/html.util.ts';
import type { ComponentContext } from '../component/abstract.component.ts';
import { DEFAULT_BASE_PATH } from '../route/route.core.ts';

const DEFAULT_HTML_SEPARATOR = ' \u203A ';
const DEFAULT_MD_SEPARATOR = ' > ';

interface BreadcrumbParams {
  separator?: string;
  class?: string;
}

interface BreadcrumbSegment {
  label: string;
  href: string;
}

interface BreadcrumbData {
  segments: BreadcrumbSegment[];
}

export class BreadcrumbWidget extends WidgetComponent<BreadcrumbParams, BreadcrumbData> {
  override readonly name = 'breadcrumb';

  override getData(
    args: { params: BreadcrumbParams; signal?: AbortSignal; context?: ComponentContext },
  ): Promise<BreadcrumbData | null> {
    const htmlBase = args.context?.basePath ?? DEFAULT_BASE_PATH.html;
    const pathname = args.context?.pathname ?? this.resolvePathname(htmlBase);

    // Skip basePath segments for display — only show route segments
    const barePathname = htmlBase && pathname.startsWith(htmlBase)
      ? pathname.slice(htmlBase.length) || '/'
      : pathname;
    const parts = barePathname.split('/').filter(Boolean);

    const segments: BreadcrumbSegment[] = [
      { label: 'Home', href: htmlBase + '/' },
    ];

    let accumulated = htmlBase;
    for (const part of parts) {
      accumulated += '/' + part;
      segments.push({
        label: part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' '),
        href: accumulated,
      });
    }

    return Promise.resolve({ segments });
  }

  private resolvePathname(htmlBase: string): string {
    if (typeof globalThis.location === 'undefined') return htmlBase + '/';
    return location.pathname;
  }

  override renderHTML(
    args: { data: BreadcrumbData | null; params: BreadcrumbParams; context?: ComponentContext },
  ): string {
    if (!args.data || args.data.segments.length === 0) return '';

    const sep = args.params.separator ?? DEFAULT_HTML_SEPARATOR;
    const segments = args.data.segments;

    const items = segments.map((seg, i) => {
      const escaped = escapeHtml(seg.label);
      if (i === segments.length - 1) {
        return `<span aria-current="page">${escaped}</span>`;
      }
      return `<a href="${escapeHtml(seg.href)}">${escaped}</a>`;
    });

    return `<nav aria-label="Breadcrumb">${items.join(escapeHtml(sep))}</nav>`;
  }

  override renderMarkdown(
    args: { data: BreadcrumbData | null; params: BreadcrumbParams; context?: ComponentContext },
  ): string {
    if (!args.data || args.data.segments.length === 0) return '';

    const sep = args.params.separator ?? DEFAULT_MD_SEPARATOR;
    return args.data.segments
      .map((seg, i, arr) =>
        i === arr.length - 1 ? `**${seg.label}**` : `[${seg.label}](${seg.href})`
      )
      .join(sep);
  }
}
