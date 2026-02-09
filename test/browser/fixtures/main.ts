import { ComponentElement, createSpaHtmlRouter, WidgetRegistry } from '@emkodev/emroute/spa';
import { routesManifest } from './routes.manifest.ts';
import failingWidget from './widgets/failing/failing.widget.ts';
import { greetingWidget } from './widgets/greeting/greeting.widget.ts';
import { infoCardWidget } from './widgets/info-card/info-card.widget.ts';
import { counterHtmWidget } from './widgets/counter-htm/counter-htm.widget.ts';
import { counterVanillaWidget } from './widgets/counter-vanilla/counter-vanilla.widget.ts';

// Set up emko-md markdown renderer (side-effect import)
import './emko.renderer.ts';

// Create widget registry and register all widgets
const widgets = new WidgetRegistry();
widgets.add(failingWidget);
widgets.add(greetingWidget);
widgets.add(infoCardWidget);
widgets.add(counterHtmWidget);
widgets.add(counterVanillaWidget);

for (const widget of widgets) {
  ComponentElement.register(widget);
}

const router = await createSpaHtmlRouter(routesManifest);

(globalThis as Record<string, unknown>).__testRouter = router;
