/// <reference lib="deno.ns" />

/**
 * Deno CLI Entry Point for Dev Server
 *
 * Usage: deno run --allow-net --allow-read --allow-write --allow-run --allow-env server/cli.deno.ts
 *
 * Scans ./routes directory and starts dev server with file watching.
 */

import { createDevServer } from './dev.server.ts';
import { denoServerRuntime } from './server.deno.ts';

const PORT = parseInt(Deno.env.get('PORT') || '1420', 10);
const ENTRY_POINT = Deno.env.get('ENTRY_POINT') || 'main.ts';
const SPA_ROOT = Deno.env.get('SPA_ROOT') || 'index.html';
const ROUTES_DIR = Deno.env.get('ROUTES_DIR') || './routes';

// Check if routes directory exists
const routesStat = await denoServerRuntime.stat(ROUTES_DIR);
if (!routesStat?.isDirectory) {
  console.error(`Error: Routes directory not found: ${ROUTES_DIR}`);
  console.error('Create a routes/ directory or set ROUTES_DIR environment variable');
  Deno.exit(1);
}

await createDevServer(
  {
    port: PORT,
    entryPoint: ENTRY_POINT,
    routesDir: ROUTES_DIR,
    watch: true,
    spaRoot: SPA_ROOT,
    appRoot: '.',
  },
  denoServerRuntime,
);
