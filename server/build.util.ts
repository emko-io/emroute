/**
 * Build Utilities
 *
 * Produces the SPA shell assets (emroute.js, app.js, importmap.json)
 * required by root/only modes. Module serving (.ts → JS with companions
 * inlined) is handled by the runtime at request time.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Runtime } from '../runtime/abstract.runtime.ts';
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
 * Build SPA shell assets and write them into the runtime.
 *
 * Produces:
 * - emroute.js — pre-built framework bundle (copied from dist/)
 * - app.js — consumer entry point (transpiled from main.ts)
 * - importmap.json — merged import map (emroute externals + consumer entries)
 *
 * Module serving (pages, widgets, elements) is handled by the runtime —
 * manifests reference .ts paths and the runtime transpiles on the fly.
 */
export async function buildClientBundles(options: BuildOptions): Promise<void> {
  const { runtime, root, spa, entryPoint } = options;
  const paths = options.bundlePaths ?? DEFAULT_BUNDLE_PATHS;

  if (spa === 'none') return;

  // Copy pre-built emroute.js from this package's dist/
  const emrouteJsPath = resolvePrebuiltBundle();
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
 * Resolve dist/emroute.js relative to this file.
 * This module IS part of emroute — no need to resolve via the consumer's
 * node_modules. Works for both source (server/build.util.ts → ../dist/)
 * and compiled (dist/server/build.util.js → ../emroute.js).
 */
function resolvePrebuiltBundle(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  // Source: server/build.util.ts → repo root → dist/emroute.js
  // Compiled: dist/server/build.util.js → dist/ → emroute.js
  const fromSource = resolve(thisDir, '..', 'dist', 'emroute.js');
  const fromDist = resolve(thisDir, '..', 'emroute.js');
  // Prefer the compiled path (consumer installs dist/), fall back to source
  try {
    require('node:fs').accessSync(fromDist);
    return fromDist;
  } catch {
    return fromSource;
  }
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

