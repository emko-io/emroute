/**
 * Code Generation Utilities
 *
 * Generates a default main.ts entry point for SPA bootstrapping.
 * Manifest data is resolved at bundle time via the esbuild virtual
 * manifest plugin (`emroute:routes`, `emroute:widgets`).
 */

import type { BasePath } from '../src/route/route.core.ts';
import type { SpaMode } from '../src/type/widget.type.ts';

/**
 * Generate a main.ts entry point for SPA bootstrapping.
 *
 * For `root`/`only` modes: creates an EmrouteServer with FetchRuntime
 * in the browser and wires it to Navigation API via `createEmrouteApp`.
 *
 * Imports route tree and widget manifests from virtual `emroute:` specifiers
 * that the esbuild manifest plugin resolves at bundle time.
 */
export function generateMainTs(
  spa: SpaMode,
  hasRoutes: boolean,
  hasWidgets: boolean,
  importPath: string,
  basePath?: BasePath,
): string {
  const imports: string[] = [];
  const body: string[] = [];

  const spaImport = `${importPath}/spa`;

  if (hasWidgets) {
    imports.push(`import { ComponentElement, WidgetRegistry } from '${spaImport}';`);
    imports.push(`import { widgetsManifest } from 'emroute:widgets';`);
    body.push('const widgets = new WidgetRegistry();');
    body.push('for (const entry of widgetsManifest.widgets) {');
    body.push(
      '  const mod = await widgetsManifest.moduleLoaders![entry.modulePath]() as Record<string, unknown>;',
    );
    body.push('  for (const exp of Object.values(mod)) {');
    body.push("    if (exp && typeof exp === 'object' && 'getData' in exp) {");
    body.push('      widgets.add(exp as any);');
    body.push('      ComponentElement.register(exp as any, entry.files);');
    body.push('      break;');
    body.push('    }');
    body.push("    if (typeof exp === 'function' && exp.prototype?.getData) {");
    body.push('      const instance = new (exp as new () => any)();');
    body.push('      widgets.add(instance);');
    body.push(
      '      ComponentElement.registerClass(exp as new () => any, entry.name, entry.files);',
    );
    body.push('      break;');
    body.push('    }');
    body.push('  }');
    body.push('}');
  }

  if ((spa === 'root' || spa === 'only') && hasRoutes) {
    imports.push(`import { routeTree, moduleLoaders } from 'emroute:routes';`);
    imports.push(`import { createEmrouteServer } from '${importPath}/server';`);
    imports.push(`import { FetchRuntime } from '${importPath}/runtime/fetch';`);
    imports.push(`import { createEmrouteApp } from '${spaImport}';`);

    body.push('const runtime = new FetchRuntime(location.origin);');

    // Merge route + widget module loaders so the browser never calls runtime.loadModule()
    const loadersExpr = hasWidgets
      ? '{ ...moduleLoaders, ...widgetsManifest.moduleLoaders }'
      : 'moduleLoaders';

    const configParts = ['routeTree', `moduleLoaders: ${loadersExpr}`];
    if (hasWidgets) configParts.push('widgets');
    if (basePath) {
      configParts.push(`basePath: { html: '${basePath.html}', md: '${basePath.md}', app: '${basePath.app}' }`);
    }
    body.push(`const server = await createEmrouteServer({ ${configParts.join(', ')} }, runtime);`);

    const appOpts = basePath
      ? `{ basePath: { html: '${basePath.html}', md: '${basePath.md}', app: '${basePath.app}' } }`
      : '';
    body.push(`await createEmrouteApp(server${appOpts ? ', ' + appOpts : ''});`);
  }

  return `/** Auto-generated entry point — do not edit. */\n${imports.join('\n')}\n\n${
    body.join('\n')
  }\n`;
}
