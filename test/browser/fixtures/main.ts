import { ComponentElement, createSpaHtmlRouter } from '@emkodev/emroute/spa';
import { createOverlayService } from '@emkodev/emroute/overlay';
import { routesManifest } from './routes.manifest.ts';
import { widgetsManifest } from './widgets.manifest.ts';

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

const router = await createSpaHtmlRouter(routesManifest, {
  extendContext: (base) => ({ ...base, overlay }),
});

router.addEventListener((e) => {
  if (e.type === 'navigate') overlay.dismissAll();
});

// Expose for console testing: __overlay.toast({ render(el) { el.textContent = 'hi' } })
(globalThis as Record<string, unknown>).__overlay = overlay;
