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
 * Imports route and widget manifests from virtual `emroute:` specifiers
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

  if (hasRoutes) {
    imports.push(`import { routesManifest } from 'emroute:routes';`);
  }

  if (hasWidgets) {
    imports.push(`import { ComponentElement } from '${spaImport}';`);
    imports.push(`import { widgetsManifest } from 'emroute:widgets';`);
    body.push('for (const entry of widgetsManifest.widgets) {');
    body.push(
      '  const mod = await widgetsManifest.moduleLoaders![entry.modulePath]() as Record<string, unknown>;',
    );
    body.push('  for (const exp of Object.values(mod)) {');
    body.push("    if (exp && typeof exp === 'object' && 'getData' in exp) {");
    body.push('      ComponentElement.register(exp as any, entry.files);');
    body.push('      break;');
    body.push('    }');
    body.push("    if (typeof exp === 'function' && exp.prototype?.getData) {");
    body.push(
      '      ComponentElement.registerClass(exp as new () => any, entry.name, entry.files);',
    );
    body.push('      break;');
    body.push('    }');
    body.push('  }');
    body.push('}');
  }

  if ((spa === 'root' || spa === 'only') && hasRoutes) {
    imports.push(`import { createSpaHtmlRouter } from '${spaImport}';`);
    const bpOpt = basePath ? `basePath: { html: '${basePath.html}', md: '${basePath.md}' }` : '';
    const opts = bpOpt ? `{ ${bpOpt} }` : '';
    body.push(`await createSpaHtmlRouter(routesManifest${opts ? `, ${opts}` : ''});`);
  }

  return `/** Auto-generated entry point — do not edit. */\n${imports.join('\n')}\n\n${
    body.join('\n')
  }\n`;
}
