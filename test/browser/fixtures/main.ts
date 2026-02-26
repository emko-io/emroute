import { ComponentElement, createEmrouteApp, MarkdownElement, WidgetRegistry } from '@emkodev/emroute/spa';
import { renderMarkdown } from '@emkodev/emkoma/render';
import { createEmrouteServer } from '@emkodev/emroute/server';
import { FetchRuntime } from '@emkodev/emroute/runtime/fetch';
import { routeTree, moduleLoaders } from 'emroute:routes';
import { widgetsManifest } from 'emroute:widgets';

MarkdownElement.setRenderer({ render: renderMarkdown });

// Pre-load widgets from the bundled manifest (already compiled into app.js)
const widgets = new WidgetRegistry();

for (const entry of widgetsManifest.widgets) {
  const mod = await widgetsManifest.moduleLoaders![entry.modulePath]() as Record<string, unknown>;
  for (const exp of Object.values(mod)) {
    if (exp && typeof exp === 'object' && 'getData' in exp) {
      const widget = exp as Parameters<typeof widgets.add>[0];
      widgets.add(widget);
      const widgetFiles = (exp as { files?: Record<string, string> }).files;
      const files = widgetFiles ? { ...entry.files, ...widgetFiles } : entry.files;
      ComponentElement.register(widget, files);
      break;
    }
  }
}

// Merge route + widget module loaders into a single map
const allLoaders = { ...moduleLoaders, ...widgetsManifest.moduleLoaders };

const runtime = new FetchRuntime(location.origin);
const markdownRenderer = { render: renderMarkdown };
const server = await createEmrouteServer({ routeTree, widgets, moduleLoaders: allLoaders, markdownRenderer }, runtime);
await createEmrouteApp(server);
