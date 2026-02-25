import { ComponentElement, createSpaHtmlRouter } from '@emkodev/emroute/spa';
import { RouteTrie } from '@emkodev/emroute';
import { createOverlayService } from '@emkodev/emroute/overlay';
import { routeTree, moduleLoaders } from 'emroute:routes';
import { widgetsManifest } from 'emroute:widgets';

// Set up emko-md markdown renderer (side-effect import)
import './emko.renderer.ts';

// Register discovered widgets from manifest
for (const entry of widgetsManifest.widgets) {
  const mod = await widgetsManifest.moduleLoaders![entry.modulePath]() as Record<string, unknown>;
  for (const exp of Object.values(mod)) {
    if (exp && typeof exp === 'object' && 'getData' in exp) {
      // Merge: discovered companion files as base, widget's own files override
      const widgetFiles = (exp as { files?: Record<string, string> }).files;
      const files = widgetFiles ? { ...entry.files, ...widgetFiles } : entry.files;
      ComponentElement.register(exp as Parameters<typeof ComponentElement.register>[0], files);
      break;
    }
  }
}

const overlay = createOverlayService();
const resolver = new RouteTrie(routeTree);

const router = await createSpaHtmlRouter(resolver, {
  extendContext: (base) => ({ ...base, overlay }),
  moduleLoaders,
});

router.addEventListener((e) => {
  if (e.type === 'navigate') overlay.dismissAll();
});

// Expose for console testing: __overlay.toast({ render(el) { el.textContent = 'hi' } })
(globalThis as Record<string, unknown>).__overlay = overlay;
