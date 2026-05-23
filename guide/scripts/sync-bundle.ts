/**
 * Copies the framework's prebuilt bundle (../dist/emroute.js) into the
 * guide's static/ directory so the PWA shell can serve it from a stable,
 * deploy-safe path.
 *
 * Run after rebuilding the framework: `deno task sync-bundle`
 */

import { copyFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const here = import.meta.dirname!;
const src = resolve(here, '..', '..', 'dist', 'emroute.js');
const dst = resolve(here, '..', 'static', 'emroute.js');

const info = await stat(src).catch(() => null);
if (!info) {
  console.error(`Source not found: ${src}`);
  console.error('Did you run the framework build (bun run build) first?');
  Deno.exit(1);
}

await copyFile(src, dst);
console.log(`Copied: ${src} → ${dst} (${info.size} bytes)`);

// Silence unused-import warning
void dirname;
