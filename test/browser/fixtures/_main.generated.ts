/** Auto-generated entry point — do not edit. */
import { ComponentElement } from '@emkodev/emroute/spa';
import { routesManifest } from './routes.manifest.g.ts';
import { widgetsManifest } from './widgets.manifest.g.ts';

for (const entry of widgetsManifest.widgets) {
  const mod = await widgetsManifest.moduleLoaders![entry.modulePath]() as Record<string, unknown>;
  for (const exp of Object.values(mod)) {
    if (exp && typeof exp === 'object' && 'getData' in exp) {
      ComponentElement.register(exp as any, entry.files);
      break;
    }
    if (typeof exp === 'function' && exp.prototype?.getData) {
      ComponentElement.registerClass(exp as new () => any, entry.name, entry.files);
      break;
    }
  }
}
