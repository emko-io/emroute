/**
 * Bundle dist/emroute.js — a single browser-ready file from the compiled dist/.
 *
 * Run after tsc: `bun scripts/bundle-browser.ts`
 *
 * This flattens all internal imports from dist/ into one ESM file so the
 * browser can load it via a single import map entry. No new code —
 * just the same dist/ modules concatenated by Bun's bundler.
 */

import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const root = resolve(import.meta.dirname!, '..');

// Virtual entry that re-exports the three browser-facing modules
const entry = [
  `export * from './src/renderer/spa/mod.js';`,
  `export { createEmrouteServer } from './server/emroute.server.js';`,
  `export { FetchRuntime } from './runtime/fetch.runtime.js';`,
].join('\n');

// Write a temporary entry file (Bun.build needs a real file path)
const entryPath = resolve(root, 'dist/.bundle-entry.js');
writeFileSync(entryPath, entry);

const result = await Bun.build({
  entrypoints: [entryPath],
  outdir: resolve(root, 'dist'),
  naming: 'emroute.[ext]',
  format: 'esm',
  sourcemap: 'linked',
});

// Clean up temp entry
const { unlinkSync } = await import('node:fs');
unlinkSync(entryPath);

if (!result.success) {
  console.error('Bundle failed:');
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log('Built dist/emroute.js');
