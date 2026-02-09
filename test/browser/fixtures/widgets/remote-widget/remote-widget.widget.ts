/**
 * Remote Widget — Test Fixture
 *
 * A widget that declares its HTML file as an absolute URL.
 * Tests that the loadWidgetFiles infrastructure handles absolute
 * http/https URLs correctly (e.g., CDN-hosted widget templates).
 *
 * The URL points back to the same dev server, but uses an absolute URL
 * to exercise the "remote file" code path in RouteCore.loadWidgetFiles.
 */

import { WidgetComponent } from '@emkodev/emroute';

interface RemoteWidgetData {
  source: string;
}

class RemoteWidget extends WidgetComponent<Record<string, unknown>, RemoteWidgetData> {
  override readonly name = 'remote-widget';
  override readonly files = {
    html: 'http://localhost:4100/widgets/remote-widget/remote-widget.widget.html',
    css: 'http://localhost:4100/widgets/remote-widget/remote-widget.widget.css',
  };

  override getData(): Promise<RemoteWidgetData> {
    return Promise.resolve({ source: 'remote' });
  }
}

export const remoteWidget = new RemoteWidget();
