/**
 * Code Generation Utilities
 *
 * Generates TypeScript manifest source files from route and widget data.
 * Used by the CLI `generate` command to produce `.g.ts` files that consumers
 * import in their entry points.
 */

import type { RoutesManifest } from '../src/type/route.type.ts';
import type { WidgetManifestEntry } from '../src/type/widget.type.ts';
import type { BasePath } from '../src/route/route.core.ts';
import type { SpaMode } from '../src/type/widget.type.ts';

/** Escape a string for use inside a single-quoted JS/TS string literal. */
export function escapeForCodeString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Generate TypeScript manifest file with route patterns.
 *
 * When `basePath` is provided, all patterns are prefixed (e.g. '/html/about').
 * The root pattern '/' becomes the basePath itself (e.g. '/html').
 * Without basePath, patterns remain bare (e.g. '/about').
 */
export function generateManifestCode(
  manifest: RoutesManifest,
  importPath = '@emkodev/emroute',
  basePath = '',
  manifestDir = '',
): string {
  const prefix = (pattern: string): string =>
    basePath ? (pattern === '/' ? basePath : basePath + pattern) : pattern;

  const stripPrefix = manifestDir ? manifestDir.replace(/\/$/, '') + '/' : '';
  const strip = (p: string): string =>
    stripPrefix && p.startsWith(stripPrefix) ? p.slice(stripPrefix.length) : p;

  const routesArray = manifest.routes
    .map((r) => {
      const filesStr = r.files
        ? `\n    files: { ${
          Object.entries(r.files)
            .filter(([_, v]) => v)
            .map(([k, v]) => `${k}: '${escapeForCodeString(strip(v!))}'`)
            .join(', ')
        } },`
        : '';

      return `  {
    pattern: '${escapeForCodeString(prefix(r.pattern))}',
    type: '${escapeForCodeString(r.type)}',
    modulePath: '${escapeForCodeString(strip(r.modulePath))}',${filesStr}${
        r.parent ? `\n    parent: '${escapeForCodeString(prefix(r.parent))}',` : ''
      }${r.statusCode ? `\n    statusCode: ${r.statusCode},` : ''}
  }`;
    })
    .join(',\n');

  const errorBoundariesArray = manifest.errorBoundaries
    .map(
      (e) =>
        `  {
    pattern: '${escapeForCodeString(prefix(e.pattern))}',
    modulePath: '${escapeForCodeString(strip(e.modulePath))}',
  }`,
    )
    .join(',\n');

  const statusPagesEntries = [...manifest.statusPages.entries()]
    .map(
      ([status, route]) => {
        const filesStr = route.files
          ? `, files: { ${
            Object.entries(route.files).map(([k, v]) => `${k}: '${escapeForCodeString(strip(v!))}'`)
              .join(', ')
          } }`
          : '';
        return `  [${status}, { pattern: '${escapeForCodeString(prefix(route.pattern))}', type: '${
          escapeForCodeString(route.type)
        }', modulePath: '${
          escapeForCodeString(strip(route.modulePath))
        }', statusCode: ${status}${filesStr} }]`;
      },
    )
    .join(',\n');

  const errorHandlerCode = manifest.errorHandler
    ? `{
  pattern: '${escapeForCodeString(prefix(manifest.errorHandler.pattern))}',
  type: '${escapeForCodeString(manifest.errorHandler.type)}',
  modulePath: '${escapeForCodeString(strip(manifest.errorHandler.modulePath))}',
}`
    : 'undefined';

  const tsModulePaths = new Set<string>();
  for (const route of manifest.routes) {
    if (route.files?.ts) tsModulePaths.add(route.files.ts);
    if (route.modulePath.endsWith('.ts')) tsModulePaths.add(route.modulePath);
  }
  for (const boundary of manifest.errorBoundaries) {
    tsModulePaths.add(boundary.modulePath);
  }
  if (manifest.errorHandler) {
    tsModulePaths.add(manifest.errorHandler.modulePath);
  }
  for (const [_, statusRoute] of manifest.statusPages) {
    if (statusRoute.modulePath.endsWith('.ts')) {
      tsModulePaths.add(statusRoute.modulePath);
    }
  }

  const moduleLoadersCode = [...tsModulePaths]
    .map((p) => {
      const key = strip(p);
      const rel = key.replace(/^\.\//, '');
      return `    '${escapeForCodeString(key)}': () => import('./${escapeForCodeString(rel)}'),`;
    })
    .join('\n');

  return `/**
 * Generated Routes Manifest
 *
 * DO NOT EDIT - This file is auto-generated.
 */

import type { RoutesManifest } from '${escapeForCodeString(importPath)}';

export const routesManifest: RoutesManifest = {
  routes: [
${routesArray}
  ],

  errorBoundaries: [
${errorBoundariesArray}
  ],

  statusPages: new Map([
${statusPagesEntries}
  ]),

  errorHandler: ${errorHandlerCode},

  moduleLoaders: {
${moduleLoadersCode}
  },
};
`;
}

/**
 * Generate TypeScript source for a full widgets manifest module.
 */
export function generateWidgetsManifestCode(
  entries: WidgetManifestEntry[],
  importPath = '@emkodev/emroute',
  manifestDir = '',
): string {
  const stripPrefix = manifestDir ? manifestDir.replace(/\/$/, '') + '/' : '';
  const strip = (p: string): string =>
    stripPrefix && p.startsWith(stripPrefix) ? p.slice(stripPrefix.length) : p;

  const widgetEntries = entries.map((e) => {
    const filesStr = e.files
      ? `\n      files: { ${
        Object.entries(e.files)
          .filter(([_, v]) => v)
          .map(([k, v]) => `${k}: '${escapeForCodeString(strip(v!))}'`)
          .join(', ')
      } },`
      : '';

    return `    {
      name: '${escapeForCodeString(e.name)}',
      modulePath: '${escapeForCodeString(strip(e.modulePath))}',
      tagName: '${escapeForCodeString(e.tagName)}',${filesStr}
    }`;
  }).join(',\n');

  const loaderEntries = entries.map((e) => {
    const key = strip(e.modulePath);
    const rel = key.replace(/^\.\//, '');
    return `    '${escapeForCodeString(key)}': () => import('./${escapeForCodeString(rel)}'),`;
  }).join('\n');

  return `/**
 * Generated Widgets Manifest
 *
 * DO NOT EDIT - This file is auto-generated.
 */

import type { WidgetsManifest } from '${escapeForCodeString(importPath)}';

export const widgetsManifest: WidgetsManifest = {
  widgets: [
${widgetEntries}
  ],

  moduleLoaders: {
${loaderEntries}
  },
};
`;
}

/**
 * Generate a main.ts entry point for SPA bootstrapping.
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
    imports.push(`import { routesManifest } from './routes.manifest.g.ts';`);
  }

  if (hasWidgets) {
    imports.push(`import { ComponentElement } from '${spaImport}';`);
    imports.push(`import { widgetsManifest } from './widgets.manifest.g.ts';`);
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
