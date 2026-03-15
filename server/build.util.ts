/**
 * Build Utilities
 *
 * Optional production build step. The runtime serves .ts modules as
 * transpiled JavaScript on the fly — this step pre-computes that output
 * into .js files to avoid per-request transpilation overhead.
 *
 * Also produces the SPA shell assets (emroute.js, app.js, importmap.json)
 * required by root/only modes.
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Runtime } from '../runtime/abstract.runtime.ts';
import {
  ROUTES_MANIFEST_PATH,
  WIDGETS_MANIFEST_PATH,
  ELEMENTS_MANIFEST_PATH,
} from '../core/runtime/abstract.runtime.ts';
import type { RouteNode } from '../core/type/route-tree.type.ts';
import type { WidgetManifestEntry } from '../core/type/widget.type.ts';
import type { ElementManifestEntry } from '../core/type/element.type.ts';
import { generateMainTs } from './codegen.util.ts';
import type { SpaMode } from '../core/type/widget.type.ts';

/** Package specifiers that map to emroute.js via import map. */
export const EMROUTE_EXTERNALS = [
  '@emkodev/emroute/spa',
  '@emkodev/emroute/overlay',
  '@emkodev/emroute',
  '@emkodev/emroute/server',
  '@emkodev/emroute/runtime/fetch',
] as const;

export interface BuildOptions {
  /** Runtime instance to read manifests and source files from. */
  runtime: Runtime;
  /** Filesystem root for resolving the pre-built emroute.js bundle. */
  root: string;
  /** SPA mode — skips build when 'none'. */
  spa: SpaMode;
  /** Consumer's SPA entry point (e.g. '/main.ts'). When absent, auto-generates one. */
  entryPoint?: string;
  /** Output paths for the bundles. */
  bundlePaths?: { emroute: string; app: string };
}

const DEFAULT_BUNDLE_PATHS = { emroute: '/emroute.js', app: '/app.js' };

/**
 * Build client assets and write them into the runtime.
 *
 * Produces:
 * - Merged .js modules — each .ts page/widget transpiled with companions inlined
 * - Updated manifests — route tree and widget manifest reference .js paths
 * - emroute.js — pre-built from dist/ (copied into runtime)
 * - app.js — consumer entry point (transpiled from .ts, no bundler)
 * - importmap.json — merged import map (emroute externals + consumer entries)
 */
export async function buildClientBundles(options: BuildOptions): Promise<void> {
  const { runtime, root, spa, entryPoint } = options;
  const paths = options.bundlePaths ?? DEFAULT_BUNDLE_PATHS;

  // Merge .ts modules → .js with inlined companions, update manifests
  await mergeModules(runtime);

  if (spa === 'none') return;

  // Copy pre-built emroute.js from the package dist/
  const consumerRequire = createRequire(root + '/');
  const emrouteJsPath = resolvePrebuiltBundle(consumerRequire);
  const emrouteJs = await readFile(emrouteJsPath);
  await runtime.command(paths.emroute, { body: emrouteJs });

  // App entry point — transpile consumer's main.ts (or generate a default one).
  // Imports resolve via the import map in index.html — no bundler needed.
  const ep = entryPoint ?? '/main.ts';
  let source: string | undefined;
  try {
    source = await readFile(root + ep, 'utf-8');
  } catch {
    const epResponse = await runtime.query(ep);
    if (epResponse.status !== 404) source = await epResponse.text();
  }
  source ??= generateMainTs(spa, '@emkodev/emroute');

  const appJs = await runtime.transpile(source);
  await runtime.command(paths.app, { body: appJs });

  // Copy main.css from disk into runtime if it exists (and runtime doesn't have it)
  if ((await runtime.query('/main.css')).status === 404) {
    try {
      const css = await readFile(root + '/main.css');
      await runtime.command('/main.css', { body: css });
    } catch { /* no main.css on disk — fine */ }
  }

  // Write merged import map — server reads this when generating the shell
  await writeImportMap(runtime, paths);
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

// ── Import map ───────────────────────────────────────────────────────

async function writeImportMap(
  runtime: Runtime,
  paths: { emroute: string; app: string },
): Promise<void> {
  const imports: Record<string, string> = {};
  for (const pkg of EMROUTE_EXTERNALS) {
    imports[pkg] = paths.emroute;
  }

  // Merge user-provided importmap.json (user entries win on conflict)
  const mapResponse = await runtime.query('/importmap.json');
  if (mapResponse.status !== 404) {
    const userMap = await mapResponse.json() as { imports?: Record<string, string> };
    if (userMap.imports) {
      for (const [key, value] of Object.entries(userMap.imports)) {
        imports[key] = value;
      }
    }
  }

  await runtime.command('/importmap.json', {
    body: JSON.stringify({ imports }, null, 2),
  });
}

// ── Module merging ───────────────────────────────────────────────────

/** Convert a .ts path to .js (e.g. "routes/about.page.ts" → "routes/about.page.js"). */
function tsToJs(path: string): string {
  return path.replace(/\.ts$/, '.js');
}

/**
 * Materialize a .ts module as a browser-ready .js file in the runtime.
 *
 * Queries the runtime for the .ts path. The runtime is expected to serve .ts
 * as transpiled JavaScript with companion files inlined — the build step is
 * a pre-computation of what the runtime serves on the fly.
 *
 * Returns the .js output path (same format as the input tsPath).
 */
async function transpileAndMerge(
  runtime: Runtime,
  tsPath: string,
): Promise<string> {
  const abs = tsPath.startsWith('/') ? tsPath : '/' + tsPath;
  const response = await runtime.query(abs);
  if (response.status === 404) throw new Error(`[emroute] Module not found: ${tsPath}`);

  const jsPath = tsToJs(tsPath);
  const absJsPath = jsPath.startsWith('/') ? jsPath : '/' + jsPath;
  await runtime.command(absJsPath, { body: await response.text() });
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
      node.files.js = await transpileAndMerge(runtime, node.files.ts);
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
      entry.modulePath = await transpileAndMerge(runtime, entry.modulePath);
      delete entry.files;
    }
  }

  // Read element manifest
  const elementsResponse = await runtime.query(ELEMENTS_MANIFEST_PATH);
  const elementEntries: ElementManifestEntry[] = elementsResponse.status !== 404
    ? await elementsResponse.json()
    : [];

  // Merge element modules
  for (const entry of elementEntries) {
    if (entry.modulePath.endsWith('.ts')) {
      entry.modulePath = await transpileAndMerge(runtime, entry.modulePath);
    }
  }

  // Write updated manifests back
  await runtime.command(ROUTES_MANIFEST_PATH, {
    body: JSON.stringify(routeTree),
  });
  await runtime.command(WIDGETS_MANIFEST_PATH, {
    body: JSON.stringify(widgetEntries),
  });
  if (elementEntries.length > 0) {
    await runtime.command(ELEMENTS_MANIFEST_PATH, {
      body: JSON.stringify(elementEntries),
    });
  }
}
