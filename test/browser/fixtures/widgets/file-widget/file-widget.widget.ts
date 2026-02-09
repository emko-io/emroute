/**
 * File Widget — Test Fixture
 *
 * A widget that declares associated .html and .md files.
 * The SSR infrastructure loads these files and passes them through
 * context.files, so the default WidgetComponent fallback chain
 * renders them automatically.
 *
 * - renderHTML: html file from context → serves widgets/file-widget/file-widget.widget.html
 * - renderMarkdown: md file from context → serves widgets/file-widget/file-widget.widget.md
 *
 * No custom renderHTML/renderMarkdown overrides needed — the base
 * WidgetComponent defaults handle everything.
 */

import { WidgetComponent } from '@emkodev/emroute';

interface FileWidgetData {
  loaded: boolean;
}

class FileWidget extends WidgetComponent<Record<string, unknown>, FileWidgetData> {
  override readonly name = 'file-widget';
  override readonly files = {
    html: 'widgets/file-widget/file-widget.widget.html',
    md: 'widgets/file-widget/file-widget.widget.md',
  };

  override getData(): Promise<FileWidgetData> {
    return Promise.resolve({ loaded: true });
  }
}

export const fileWidget = new FileWidget();
