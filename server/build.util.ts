/**
 * Build Utilities
 *
 * Standalone client bundling — extracted from Runtime so that build is a
 * separate concern from storage. Call `buildClientBundles()` before
 * `createEmrouteServer()` to produce emroute.js + app.js.
 *
 * Route tree and widget manifest are fetched as JSON at boot time by
 * `bootEmrouteApp()` — no longer compiled into app.js.
 *
 * Per-file module merging: each .ts page/widget is transpiled to .js with
 * companion files (.html, .md, .css) inlined as `export const __files`.
 * The browser lazy-loads these individual .js files — no bundler needed.
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Runtime } from '../runtime/abstract.runtime.ts';
import {
  ROUTES_MANIFEST_PATH,
  WIDGETS_MANIFEST_PATH,
} from '../runtime/abstract.runtime.ts';
import type { RouteNode } from '../src/type/route-tree.type.ts';
import type { WidgetManifestEntry } from '../src/type/widget.type.ts';
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
 * - Merged .js modules — each .ts page/widget transpiled with companions inlined
 * - Updated manifests — route tree and widget manifest reference .js paths
 * - emroute.js — pre-built from dist/ (no esbuild needed for this)
 * - app.js — consumer entry point (esbuild only touches consumer code)
 * - index.html — shell with import map + script tags (if not already present)
 */
export async function buildClientBundles(options: BuildOptions): Promise<void> {
  const { runtime, root, spa, entryPoint } = options;
  if (spa === 'none') return;

  const paths = options.bundlePaths ?? DEFAULT_BUNDLE_PATHS;

  // Merge .ts modules → .js with inlined companions, update manifests
  await mergeModules(runtime);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const esbuild = await loadEsbuild() as any;

  // Copy pre-built emroute.js from the package dist/
  const consumerRequire = createRequire(root + '/');
  const emrouteJsPath = resolvePrebuiltBundle(consumerRequire);
  const emrouteJs = await readFile(emrouteJsPath);
  await runtime.command(paths.emroute, { body: emrouteJs });

  // App bundle — consumer's main.ts bundled with esbuild.
  // Try filesystem first (where node_modules lives), then runtime, then generate.
  const ep = entryPoint ?? '/main.ts';
  let source: string | undefined;
  try {
    source = await readFile(root + ep, 'utf-8');
  } catch {
    const epResponse = await runtime.query(ep);
    if (epResponse.status !== 404) source = await epResponse.text();
  }
  source ??= generateMainTs(spa, '@emkodev/emroute');

  const result = await esbuild.build({
    bundle: true,
    write: false,
    format: 'esm' as const,
    platform: 'browser' as const,
    stdin: { contents: source, loader: 'ts', resolveDir: root },
    outfile: paths.app,
    external: [...EMROUTE_EXTERNALS],
  });

  for (const file of result.outputFiles) {
    await runtime.command(paths.app, { body: file.contents as unknown as BodyInit });
  }

  // Copy main.css from disk into runtime if it exists (and runtime doesn't have it)
  if ((await runtime.query('/main.css')).status === 404) {
    try {
      const css = await readFile(root + '/main.css');
      await runtime.command('/main.css', { body: css });
    } catch { /* no main.css on disk — fine */ }
  }

  // Write shell (index.html) if not already present
  await writeShell(runtime, paths);

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
): Promise<void> {
  if ((await runtime.query('/index.html')).status !== 404) return;

  const imports: Record<string, string> = {};
  for (const pkg of EMROUTE_EXTERNALS) {
    imports[pkg] = paths.emroute;
  }
  const importMap = JSON.stringify({ imports }, null, 2);

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
  <script type="importmap">
${importMap}
  </script>
  <script type="module" src="${paths.app}"></script>
</body>
</html>`;

  await runtime.command('/index.html', { body: html });
}

// ── Module merging ───────────────────────────────────────────────────

/** Escape backticks and ${} for safe embedding in a JS template literal. */
function escapeTemplateLiteral(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/** Convert a .ts path to .js (e.g. "routes/about.page.ts" → "routes/about.page.js"). */
function tsToJs(path: string): string {
  return path.replace(/\.ts$/, '.js');
}

/**
 * Read a file from runtime as text. Returns undefined if not found.
 */
async function readText(runtime: Runtime, path: string): Promise<string | undefined> {
  const abs = path.startsWith('/') ? path : '/' + path;
  const response = await runtime.query(abs);
  if (response.status === 404) return undefined;
  return response.text();
}

/**
 * Transpile a .ts module, inline companion files as `__files` export,
 * and write the resulting .js back to the runtime.
 *
 * Returns the .js output path.
 */
async function transpileAndMerge(
  runtime: Runtime,
  tsPath: string,
  companionPaths?: { html?: string; md?: string; css?: string },
): Promise<string> {
  const source = await readText(runtime, tsPath);
  if (!source) throw new Error(`[emroute] Module not found: ${tsPath}`);

  const js = await runtime.transpile(source);
  const jsPath = tsToJs(tsPath);

  // Read companion files and build __files export
  const entries: string[] = [];
  if (companionPaths) {
    for (const [key, filePath] of Object.entries(companionPaths)) {
      if (!filePath) continue;
      const content = await readText(runtime, filePath);
      if (content !== undefined) {
        entries.push(`  ${key}: \`${escapeTemplateLiteral(content)}\``);
      }
    }
  }

  const merged = entries.length > 0
    ? `${js}\nexport const __files = {\n${entries.join(',\n')}\n};\n`
    : js;

  const absJsPath = jsPath.startsWith('/') ? jsPath : '/' + jsPath;
  await runtime.command(absJsPath, { body: merged });
  return jsPath;
}

/**
 * Walk the route tree and widget manifest, transpile+merge each .ts module,
 * update the manifests to reference .js paths, and write them back.
 */
async function mergeModules(runtime: Runtime): Promise<void> {
  // Read route tree
  const routesResponse = await runtime.query(ROUTES_MANIFEST_PATH);
  if (routesResponse.status === 404) return;
  const routeTree: RouteNode = await routesResponse.json();

  // Read widget manifest
  const widgetsResponse = await runtime.query(WIDGETS_MANIFEST_PATH);
  const widgetEntries: WidgetManifestEntry[] = widgetsResponse.status !== 404
    ? await widgetsResponse.json()
    : [];

  // Merge route modules
  async function walkRoutes(node: RouteNode): Promise<void> {
    if (node.files?.ts) {
      const companions = {
        html: node.files.html,
        md: node.files.md,
        css: node.files.css,
      };
      node.files.js = await transpileAndMerge(runtime, node.files.ts, companions);
      delete node.files.ts;
      delete node.files.html;
      delete node.files.md;
      delete node.files.css;
    }

    if (node.redirect && node.redirect.endsWith('.ts')) {
      await transpileAndMerge(runtime, node.redirect);
      node.redirect = tsToJs(node.redirect);
    }

    if (node.errorBoundary && node.errorBoundary.endsWith('.ts')) {
      await transpileAndMerge(runtime, node.errorBoundary);
      node.errorBoundary = tsToJs(node.errorBoundary);
    }

    if (node.children) {
      for (const child of Object.values(node.children)) await walkRoutes(child);
    }
    if (node.dynamic) await walkRoutes(node.dynamic.child);
    if (node.wildcard) await walkRoutes(node.wildcard.child);
  }

  await walkRoutes(routeTree);

  // Merge widget modules
  for (const entry of widgetEntries) {
    if (entry.modulePath.endsWith('.ts')) {
      entry.modulePath = await transpileAndMerge(runtime, entry.modulePath, entry.files);
      delete entry.files;
    }
  }

  // Write updated manifests back
  await runtime.command(ROUTES_MANIFEST_PATH, {
    body: JSON.stringify(routeTree),
  });
  await runtime.command(WIDGETS_MANIFEST_PATH, {
    body: JSON.stringify(widgetEntries),
  });
}

// ── esbuild loader ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadEsbuild(): Promise<any> {
  const consumerRequire = createRequire(process.cwd() + '/');
  return consumerRequire('esbuild');
}
