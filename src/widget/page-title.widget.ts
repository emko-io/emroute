/**
 * Built-in Page Title Widget
 *
 * Sets document.title from .page.html and .page.md files without needing
 * a .page.ts component. Renders no visible output.
 *
 * Usage in .page.html:
 *   <widget-page-title title="About Us"></widget-page-title>
 */

import { WidgetComponent } from '../component/widget.component.ts';

interface PageTitleParams {
  title: string;
}

interface PageTitleData {
  title: string;
}

export class PageTitleWidget extends WidgetComponent<PageTitleParams, PageTitleData> {
  override readonly name = 'page-title';

  override getData(
    args: { params: PageTitleParams; signal?: AbortSignal },
  ): Promise<PageTitleData | null> {
    return Promise.resolve({ title: args.params.title });
  }

  override renderHTML(
    args: { data: PageTitleData | null; params: PageTitleParams },
  ): string {
    const title = args.data?.title ?? args.params.title;
    if (title && typeof document !== 'undefined') {
      document.title = title;
    }
    return '';
  }

  override renderMarkdown(
    _args: { data: PageTitleData | null; params: PageTitleParams },
  ): string {
    return '';
  }

  override validateParams(params: PageTitleParams): string | undefined {
    if (!params.title || typeof params.title !== 'string') {
      return 'page-title widget requires a "title" string param';
    }
    return undefined;
  }
}
