/**
 * External Widget — lives outside widgets/ directory.
 * Registered manually via WidgetRegistry to test mixing
 * auto-discovered and manually-registered widgets.
 */

import { WidgetComponent } from '@emkodev/emroute';

interface ExternalData {
  source: string;
}

class ExternalWidget extends WidgetComponent<
  Record<string, unknown>,
  ExternalData
> {
  override readonly name = 'external';

  override getData(_args: this['DataArgs']): Promise<ExternalData> {
    return Promise.resolve({ source: 'manual-registry' });
  }

  override renderHTML({ data }: this['RenderArgs']) {
    if (!data) return '<p>Loading...</p>';
    return `<div class="external-widget">External widget from ${data.source}</div>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']) {
    if (!data) return '';
    return `External widget from ${data.source}`;
  }
}

export const externalWidget = new ExternalWidget();
