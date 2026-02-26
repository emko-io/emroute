/**
 * Bundle dist/emroute.js — a single browser-ready file from the compiled dist/.
 *
 * Run after tsc: `bun scripts/bundle-browser.ts`
 *
 * This flattens all internal imports from dist/ into one ESM file so the
 * browser can load it via a single import map entry. No new code —
 * just the same dist/ modules concatenated by esbuild.
 */

import { build } from 'esbuild';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname!, '..');

await build({
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: resolve(root, 'dist/emroute.js'),
  stdin: {
    contents: [
      `export * from './dist/src/renderer/spa/mod.js';`,
      `export { createEmrouteServer } from './dist/server/emroute.server.js';`,
      `export { FetchRuntime } from './dist/runtime/fetch.runtime.js';`,
    ].join('\n'),
    resolveDir: root,
    loader: 'js',
  },
  sourcemap: true,
});

console.log('Built dist/emroute.js');
