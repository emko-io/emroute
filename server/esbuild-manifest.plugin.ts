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
  const { runtime, stripPrefix = '', resolveDir } = options;

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
      return `import type { RouteNode } from '@emkodev/emroute';
export const routeTree: RouteNode = {};
export const moduleLoaders: Record<string, () => Promise<unknown>> = {};
`;
    }
    const raw = await response.json();

    // Walk the RouteNode tree to collect all .ts module paths for import() loaders
    const tsModulePaths = new Set<string>();
    collectModulePaths(raw, tsModulePaths);

    // Serialize the tree with stripped file paths
    const strippedTree = stripTreePaths(raw);

    const moduleLoadersCode = [...tsModulePaths]
      .map((p) => {
        const key = strip(p);
        const rel = key.replace(/^\.?\//, '');
        return `  '${esc(key)}': () => import('./${esc(rel)}'),`;
      })
      .join('\n');

    return `import type { RouteNode } from '@emkodev/emroute';

export const routeTree: RouteNode = ${JSON.stringify(strippedTree, null, 2)};

export const moduleLoaders: Record<string, () => Promise<unknown>> = {
${moduleLoadersCode}
};
`;
  }

  /**
   * Recursively collect .ts module paths from a RouteNode tree.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function collectModulePaths(node: any, paths: Set<string>): void {
    if (node.files?.ts) paths.add(node.files.ts);
    if (node.errorBoundary) paths.add(node.errorBoundary);
    if (node.redirect) paths.add(node.redirect);
    if (node.children) {
      for (const child of Object.values(node.children)) {
        collectModulePaths(child, paths);
      }
    }
    if (node.dynamic) collectModulePaths(node.dynamic.child, paths);
    if (node.wildcard) collectModulePaths(node.wildcard.child, paths);
  }

  /**
   * Deep-clone a RouteNode tree with stripped file paths.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function stripTreePaths(node: any): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: any = {};

    if (node.files) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      out.files = {} as any;
      for (const [ext, path] of Object.entries(node.files)) {
        if (path) out.files[ext] = strip(path as string);
      }
    }

    if (node.errorBoundary) out.errorBoundary = strip(node.errorBoundary);
    if (node.redirect) out.redirect = strip(node.redirect);

    if (node.children) {
      out.children = {};
      for (const [seg, child] of Object.entries(node.children)) {
        out.children[seg] = stripTreePaths(child);
      }
    }

    if (node.dynamic) {
      out.dynamic = { param: node.dynamic.param, child: stripTreePaths(node.dynamic.child) };
    }

    if (node.wildcard) {
      out.wildcard = { param: node.wildcard.param, child: stripTreePaths(node.wildcard.child) };
    }

    return out;
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
