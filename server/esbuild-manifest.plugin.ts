/**
 * esbuild Virtual Manifest Plugin
 *
 * Intercepts `emroute:routes` and `emroute:widgets` import specifiers.
 * Reads JSON manifests from the runtime and generates TypeScript modules
 * with `moduleLoaders` (dynamic `import()` calls) in-memory — no .g.ts
 * files on disk.
 *
 * This is the single source of truth: JSON manifest → esbuild bundle.
 */

import type { Runtime } from '../runtime/abstract.runtime.ts';
import { ROUTES_MANIFEST_PATH, WIDGETS_MANIFEST_PATH } from '../runtime/abstract.runtime.ts';

/** Escape a string for use inside a single-quoted JS/TS string literal. */
function esc(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

interface ManifestPluginOptions {
  runtime: Runtime;
  /** HTML base path prefix for route patterns (e.g. '/html'). */
  basePath?: string;
  /**
   * Directory prefix to strip from module paths so that import() calls
   * are relative to the entry point (e.g. 'routes/' strips '/routes/').
   */
  stripPrefix?: string;
  /** Absolute directory for resolving relative import() paths in generated code. */
  resolveDir: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EsbuildPlugin = any;

export function createManifestPlugin(options: ManifestPluginOptions): EsbuildPlugin {
  const { runtime, basePath = '', stripPrefix = '', resolveDir } = options;

  const prefixPattern = (pattern: string): string =>
    basePath ? (pattern === '/' ? basePath : basePath + pattern) : pattern;

  const strip = (p: string): string =>
    stripPrefix && p.startsWith(stripPrefix) ? p.slice(stripPrefix.length) : p;

  return {
    name: 'emroute-manifest',

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup(build: any) {
      // ── Resolve virtual specifiers ──────────────────────────────────
      build.onResolve(
        { filter: /^emroute:/ },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (args: any) => ({ path: args.path, namespace: 'emroute' }),
      );

      // ── Load virtual modules ────────────────────────────────────────
      build.onLoad(
        { filter: /.*/, namespace: 'emroute' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
          if (args.path === 'emroute:routes') {
            return { contents: await generateRoutesModule(), loader: 'ts' as const, resolveDir };
          }
          if (args.path === 'emroute:widgets') {
            return { contents: await generateWidgetsModule(), loader: 'ts' as const, resolveDir };
          }
          return undefined;
        },
      );
    },
  };

  // ── Routes module generator ───────────────────────────────────────

  async function generateRoutesModule(): Promise<string> {
    const response = await runtime.query(ROUTES_MANIFEST_PATH);
    if (response.status === 404) {
      return `export const routesManifest = { routes: [], errorBoundaries: [], statusPages: new Map(), moduleLoaders: {} };`;
    }
    const raw = await response.json();

    // Routes array
    const routesArray = (raw.routes ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => {
        const filesStr = r.files
          ? `\n    files: { ${
            Object.entries(r.files)
              .filter(([_, v]) => v)
              .map(([k, v]) => `${k}: '${esc(strip(v as string))}'`)
              .join(', ')
          } },`
          : '';

        return `  {
    pattern: '${esc(prefixPattern(r.pattern))}',
    type: '${esc(r.type)}',
    modulePath: '${esc(strip(r.modulePath))}',${filesStr}${
          r.parent ? `\n    parent: '${esc(prefixPattern(r.parent))}',` : ''
        }${r.statusCode ? `\n    statusCode: ${r.statusCode},` : ''}
  }`;
      })
      .join(',\n');

    // Error boundaries
    const errorBoundariesArray = (raw.errorBoundaries ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((e: any) => `  {
    pattern: '${esc(prefixPattern(e.pattern))}',
    modulePath: '${esc(strip(e.modulePath))}',
  }`)
      .join(',\n');

    // Status pages
    const statusPagesEntries = (raw.statusPages ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map(([status, route]: [number, any]) => {
        const filesStr = route.files
          ? `, files: { ${
            Object.entries(route.files)
              .map(([k, v]) => `${k}: '${esc(strip(v as string))}'`)
              .join(', ')
          } }`
          : '';
        return `  [${status}, { pattern: '${esc(prefixPattern(route.pattern))}', type: '${
          esc(route.type)
        }', modulePath: '${
          esc(strip(route.modulePath))
        }', statusCode: ${status}${filesStr} }]`;
      })
      .join(',\n');

    // Error handler
    const errorHandlerCode = raw.errorHandler
      ? `{
  pattern: '${esc(prefixPattern(raw.errorHandler.pattern))}',
  type: '${esc(raw.errorHandler.type)}',
  modulePath: '${esc(strip(raw.errorHandler.modulePath))}',
}`
      : 'undefined';

    // Module loaders — collect all .ts module paths
    const tsModulePaths = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const route of (raw.routes ?? []) as any[]) {
      if (route.files?.ts) tsModulePaths.add(route.files.ts);
      if (route.modulePath.endsWith('.ts')) tsModulePaths.add(route.modulePath);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const boundary of (raw.errorBoundaries ?? []) as any[]) {
      tsModulePaths.add(boundary.modulePath);
    }
    if (raw.errorHandler) {
      tsModulePaths.add(raw.errorHandler.modulePath);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const [_, statusRoute] of (raw.statusPages ?? []) as [number, any][]) {
      if (statusRoute.modulePath.endsWith('.ts')) {
        tsModulePaths.add(statusRoute.modulePath);
      }
    }

    const moduleLoadersCode = [...tsModulePaths]
      .map((p) => {
        const key = strip(p);
        const rel = key.replace(/^\.?\//, '');
        return `    '${esc(key)}': () => import('./${esc(rel)}'),`;
      })
      .join('\n');

    return `import type { RoutesManifest } from '@emkodev/emroute';

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

  // ── Widgets module generator ──────────────────────────────────────

  async function generateWidgetsModule(): Promise<string> {
    const response = await runtime.query(WIDGETS_MANIFEST_PATH);
    if (response.status === 404) {
      return `export const widgetsManifest = { widgets: [], moduleLoaders: {} };`;
    }
    const entries = await response.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const widgetEntries = (entries as any[]).map((e) => {
      const filesStr = e.files
        ? `\n      files: { ${
          Object.entries(e.files)
            .filter(([_, v]) => v)
            .map(([k, v]) => `${k}: '${esc(strip(v as string))}'`)
            .join(', ')
        } },`
        : '';

      return `    {
      name: '${esc(e.name)}',
      modulePath: '${esc(strip(e.modulePath))}',
      tagName: '${esc(e.tagName)}',${filesStr}
    }`;
    }).join(',\n');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loaderEntries = (entries as any[]).map((e) => {
      const key = strip(e.modulePath);
      const rel = key.replace(/^\.?\//, '');
      return `    '${esc(key)}': () => import('./${esc(rel)}'),`;
    }).join('\n');

    return `import type { WidgetsManifest } from '@emkodev/emroute';

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
}
