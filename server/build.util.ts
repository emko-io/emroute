/**
 * Build Utilities
 *
 * Standalone client bundling — extracted from Runtime so that build is a
 * separate concern from storage. Call `buildClientBundles()` before
 * `createEmrouteServer()` to produce emroute.js + app.js.
 *
 * Requires esbuild as a devDependency in the consumer project.
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
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
  bundlePaths?: { emroute: string; app: string };
}

const DEFAULT_BUNDLE_PATHS = { emroute: '/emroute.js', app: '/app.js' };

/**
 * Build client bundles and write them into the runtime.
 *
 * Produces:
 * - emroute.js — pre-built from dist/ (no esbuild needed for this)
 * - app.js — consumer entry point with routeTree, FetchRuntime, createEmrouteApp
 * - index.html — shell with import map + script tags (if not already present)
 */
export async function buildClientBundles(options: BuildOptions): Promise<void> {
  const { runtime, root, spa, entryPoint } = options;
  if (spa === 'none') return;

  const paths = options.bundlePaths ?? DEFAULT_BUNDLE_PATHS;

  // Copy pre-built emroute.js from the package dist/
  const consumerRequire = createRequire(root + '/');
  const emrouteJsPath = resolvePrebuiltBundle(consumerRequire);
  const emrouteJs = await readFile(emrouteJsPath);
  await runtime.command(paths.emroute, { body: emrouteJs });

  // App bundle — generate main.ts if absent, virtual plugin resolves manifests
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const esbuild = await loadEsbuild() as any;
  const ep = entryPoint ?? '/main.ts';
  if ((await runtime.query(ep)).status === 404) {
    const hasRoutes = (await runtime.query((runtime.config.routesDir ?? DEFAULT_ROUTES_DIR) + '/')).status !== 404;
    const hasWidgets = (await runtime.query((runtime.config.widgetsDir ?? DEFAULT_WIDGETS_DIR) + '/')).status !== 404;
    const code = generateMainTs(spa, hasRoutes, hasWidgets, '@emkodev/emroute');
    await runtime.command(ep, { body: code });
  }

  const manifestPlugin = createManifestPlugin({ runtime, resolveDir: root });
  const runtimeLoader = createRuntimeLoaderPlugin({ runtime, root });

  const result = await esbuild.build({
    bundle: true,
    write: false,
    format: 'esm' as const,
    platform: 'browser' as const,
    entryPoints: [`${root}${ep}`],
    outfile: `${root}${paths.app}`,
    external: [...EMROUTE_EXTERNALS],
    plugins: [manifestPlugin, runtimeLoader],
  });

  for (const file of result.outputFiles) {
    const runtimePath = file.path.startsWith(root)
      ? file.path.slice(root.length)
      : '/' + file.path;
    await runtime.command(runtimePath, { body: file.contents as unknown as BodyInit });
  }

  // Write shell (index.html) if not already present
  await writeShell(runtime, paths, ep);

  await esbuild.stop();
}

/**
 * Resolve the pre-built dist/emroute.js from the consumer's node_modules.
 * Falls back to the local dist/ when running from the source repo.
 */
function resolvePrebuiltBundle(require: NodeRequire): string {
  try {
    const spaEntry = require.resolve('@emkodev/emroute/spa');
    // Compiled: .../dist/src/renderer/spa/mod.js → .../dist/emroute.js
    const distMatch = spaEntry.match(/^(.+\/dist\/)src\/renderer\/spa\/mod\.js$/);
    if (distMatch) return distMatch[1] + 'emroute.js';
    // Source (Bun): .../src/renderer/spa/mod.ts → .../dist/emroute.js
    const srcMatch = spaEntry.match(/^(.+\/)src\/renderer\/spa\/mod\.ts$/);
    if (srcMatch) return srcMatch[1] + 'dist/emroute.js';
  } catch { /* not installed as dependency */ }
  // Last resort
  return resolve(process.cwd(), 'dist/emroute.js');
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
