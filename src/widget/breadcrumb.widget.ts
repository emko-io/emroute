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
import { SSR_HTML_PREFIX, SSR_MD_PREFIX } from '../route/route.core.ts';

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

class BreadcrumbWidget extends WidgetComponent<BreadcrumbParams, BreadcrumbData> {
  override readonly name = 'breadcrumb';

  override getData(
    args: { params: BreadcrumbParams; signal?: AbortSignal; context?: ComponentContext },
  ): Promise<BreadcrumbData | null> {
    const pathname = args.context?.pathname ?? this.resolvePathname();

    const parts = pathname.split('/').filter(Boolean);
    const segments: BreadcrumbSegment[] = [
      { label: 'Home', href: SSR_HTML_PREFIX },
    ];

    let accumulated = '';
    for (const part of parts) {
      accumulated += '/' + part;
      segments.push({
        label: part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' '),
        href: `${SSR_HTML_PREFIX}${accumulated}`,
      });
    }

    return Promise.resolve({ segments });
  }

  private resolvePathname(): string {
    if (typeof globalThis.location === 'undefined') return '/';

    let pathname = location.pathname;
    if (pathname.startsWith(SSR_HTML_PREFIX)) {
      pathname = '/' + pathname.slice(SSR_HTML_PREFIX.length);
    } else if (pathname.startsWith(SSR_MD_PREFIX)) {
      pathname = '/' + pathname.slice(SSR_MD_PREFIX.length);
    }
    return pathname;
  }

  override renderHTML(
    args: { data: BreadcrumbData | null; params: BreadcrumbParams },
  ): string {
    if (!args.data || args.data.segments.length === 0) return '';

    const sep = args.params.separator ?? ' \u203A ';
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
    args: { data: BreadcrumbData | null; params: BreadcrumbParams },
  ): string {
    if (!args.data || args.data.segments.length === 0) return '';

    const sep = args.params.separator ?? ' > ';
    return args.data.segments
      .map((seg, i, arr) =>
        i === arr.length - 1 ? `**${seg.label}**` : `[${seg.label}](${seg.href})`
      )
      .join(sep);
  }
}

export const breadcrumbWidget = new BreadcrumbWidget();
