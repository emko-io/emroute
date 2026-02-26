/**
 * Build Utilities
 *
 * Standalone client bundling — extracted from Runtime so that build is a
 * separate concern from storage. Call `buildClientBundles()` before
 * `createEmrouteServer()` to produce emroute.js + app.js.
 *
 * Requires esbuild as a devDependency in the consumer project.
 */

import { createRequire } from 'node:module';
import type { Runtime } from '../runtime/abstract.runtime.ts';
import { DEFAULT_ROUTES_DIR, DEFAULT_WIDGETS_DIR } from '../runtime/abstract.runtime.ts';
import { createManifestPlugin } from './esbuild-manifest.plugin.ts';
import { createRuntimeLoaderPlugin } from '../runtime/bun/esbuild-runtime-loader.plugin.ts';
import { generateMainTs } from './codegen.util.ts';
import type { SpaMode } from '../src/type/widget.type.ts';

export const EMROUTE_EXTERNALS = [
  '@emkodev/emroute/spa',
  '@emkodev/emroute/overlay',
  '@emkodev/emroute',
  '@emkodev/emroute/server',
  '@emkodev/emroute/runtime/fetch',
] as const;

/** esbuild namespace for virtual `emroute:routes` / `emroute:widgets` modules. */
export const EMROUTE_VIRTUAL_NS = 'emroute';

export interface BuildOptions {
  /** Runtime instance to read manifests and source files from. */
  runtime: Runtime;
  /** Filesystem root for esbuild resolution (e.g. process.cwd() or the app directory). */
  root: string;
  /** SPA mode — skips bundling when 'none'. */
  spa: SpaMode;
  /** Consumer's SPA entry point (e.g. '/main.ts'). When absent, auto-generates one. */
  entryPoint?: string;
  /** Output paths for the bundles. */
  bundlePaths?: { emroute: string; app: string; widgets?: string };
}

const DEFAULT_BUNDLE_PATHS = { emroute: '/emroute.js', app: '/app.js' };

/**
 * Build client bundles and write them into the runtime.
 *
 * Produces:
 * - emroute.js — the @emkodev/emroute/spa bundle (import-mapped)
 * - app.js — consumer entry point with routeTree, FetchRuntime, createEmrouteApp
 * - index.html — shell with import map + script tags (if not already present)
 */
export async function buildClientBundles(options: BuildOptions): Promise<void> {
  const { runtime, root, spa, entryPoint } = options;
  if (spa === 'none') return;

  const paths = options.bundlePaths ?? DEFAULT_BUNDLE_PATHS;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const esbuild = await loadEsbuild() as any;
  const builds: Promise<{ outputFiles: { path: string; contents: Uint8Array }[] }>[] = [];
  const shared = { bundle: true, write: false, format: 'esm' as const, platform: 'browser' as const };
  const runtimeLoader = createRuntimeLoaderPlugin({ runtime, root });

  // Emroute browser bundle — combined entry re-exporting all browser-needed modules
  const combinedEntry = [
    `export * from '@emkodev/emroute/spa';`,
    `export { createEmrouteServer } from '@emkodev/emroute/server';`,
    `export { FetchRuntime } from '@emkodev/emroute/runtime/fetch';`,
  ].join('\n');
  const consumerRequire = createRequire(root + '/');
  builds.push(esbuild.build({
    ...shared,
    stdin: { contents: combinedEntry, resolveDir: root, loader: 'ts' },
    outfile: `${root}${paths.emroute}`,
    plugins: [{
      name: 'resolve-emroute',
      setup(build: { onResolve: (opts: { filter: RegExp }, cb: (args: { path: string }) => { path: string } | undefined) => void }) {
        build.onResolve({ filter: /^@emkodev\/emroute/ }, (args: { path: string }) => {
          try { return { path: consumerRequire.resolve(args.path) }; }
          catch { return undefined; }
        });
      },
    }],
  }));

  // App bundle — generate main.ts if absent, virtual plugin resolves manifests
  const ep = entryPoint ?? '/main.ts';
  if ((await runtime.query(ep)).status === 404) {
    const hasRoutes = (await runtime.query((runtime.config.routesDir ?? DEFAULT_ROUTES_DIR) + '/')).status !== 404;
    const hasWidgets = (await runtime.query((runtime.config.widgetsDir ?? DEFAULT_WIDGETS_DIR) + '/')).status !== 404;
    const code = generateMainTs(spa, hasRoutes, hasWidgets, '@emkodev/emroute');
    await runtime.command(ep, { body: code });
  }

  const manifestPlugin = createManifestPlugin({ runtime, resolveDir: root });
  builds.push(esbuild.build({
    ...shared,
    entryPoints: [`${root}${ep}`],
    outfile: `${root}${paths.app}`,
    external: [...EMROUTE_EXTERNALS],
    plugins: [manifestPlugin, runtimeLoader],
  }));

  // Widgets bundle
  if (paths.widgets) {
    const widgetsTsPath = paths.widgets.replace('.js', '.ts');
    if ((await runtime.query(widgetsTsPath)).status !== 404) {
      builds.push(esbuild.build({
        ...shared,
        entryPoints: [`${root}${widgetsTsPath}`],
        outfile: `${root}${paths.widgets}`,
        external: [...EMROUTE_EXTERNALS],
        plugins: [runtimeLoader],
      }));
    }
  }

  const results = await Promise.all(builds);

  // Write all output files through the runtime
  for (const result of results) {
    for (const file of result.outputFiles) {
      const runtimePath = file.path.startsWith(root)
        ? file.path.slice(root.length)
        : '/' + file.path;
      await runtime.command(runtimePath, { body: file.contents as unknown as BodyInit });
    }
  }

  // Write shell (index.html) if not already present
  await writeShell(runtime, paths, ep);

  await esbuild.stop();
}

// ── Shell generation ──────────────────────────────────────────────────

async function writeShell(
  runtime: Runtime,
  paths: { emroute: string; app: string },
  entryPoint: string,
): Promise<void> {
  if ((await runtime.query('/index.html')).status !== 404) return;

  const imports: Record<string, string> = {};
  for (const pkg of EMROUTE_EXTERNALS) {
    imports[pkg] = paths.emroute;
  }
  const importMap = JSON.stringify({ imports }, null, 2);

  const scripts = [
    `<script type="importmap">\n${importMap}\n  </script>`,
  ];
  if (entryPoint) {
    scripts.push(`<script type="module" src="${paths.app}"></script>`);
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>emroute</title>
  <style>@view-transition { navigation: auto; } router-slot { display: contents; }</style>
</head>
<body>
  <router-slot></router-slot>
  ${scripts.join('\n  ')}
</body>
</html>`;

  await runtime.command('/index.html', { body: html });
}

// ── esbuild loader ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadEsbuild(): Promise<any> {
  const consumerRequire = createRequire(process.cwd() + '/');
  return consumerRequire('esbuild');
}
