/**
 * Deno CLI Entry Point for Dev Server
 *
 * Usage: deno run --allow-net --allow-read --allow-write --allow-run --allow-env server/cli.deno.ts
 *
 * Scans ./routes and ./widgets directories and starts dev server with file watching.
 *
 * Environment variables:
 *   PORT         - Server port (default: 1420)
 *   ENTRY_POINT  - SPA entry point (default: auto-generated)
 *   SPA_ROOT     - SPA fallback HTML (default: index.html)
 *   ROUTES_DIR   - Routes directory (default: ./routes)
 *   WIDGETS_DIR  - Widgets directory (default: ./widgets)
 *   SPA_MODE     - SPA mode: none|leaf|root|only (default: root)
 *   HTML_BASE    - Base path for SSR HTML (default: /html)
 *   MD_BASE      - Base path for SSR Markdown (default: /md)
 */

import { createDevServer } from './dev.server.ts';
import type { SpaMode } from './dev.server.ts';
import { denoServerRuntime } from './server.deno.ts';

const PORT = parseInt(Deno.env.get('PORT') || '1420', 10);
const ENTRY_POINT = Deno.env.get('ENTRY_POINT');
const SPA_ROOT = Deno.env.get('SPA_ROOT') || 'index.html';
const ROUTES_DIR = Deno.env.get('ROUTES_DIR') || './routes';
const WIDGETS_DIR = Deno.env.get('WIDGETS_DIR') || './widgets';
const SPA_MODE = (Deno.env.get('SPA_MODE') || 'root') as SpaMode;
const HTML_BASE = Deno.env.get('HTML_BASE');
const MD_BASE = Deno.env.get('MD_BASE');
const basePath = (HTML_BASE || MD_BASE)
  ? { html: HTML_BASE || '/html', md: MD_BASE || '/md' }
  : undefined;

// Check if routes directory exists
const routesStat = await denoServerRuntime.stat(ROUTES_DIR);
if (!routesStat?.isDirectory) {
  console.error(`Error: Routes directory not found: ${ROUTES_DIR}`);
  console.error('Create a routes/ directory or set ROUTES_DIR environment variable');
  Deno.exit(1);
}

// Check if widgets directory exists (optional)
const widgetsStat = await denoServerRuntime.stat(WIDGETS_DIR);
const widgetsDir = widgetsStat?.isDirectory ? WIDGETS_DIR : undefined;

await createDevServer(
  {
    port: PORT,
    entryPoint: ENTRY_POINT,
    routesDir: ROUTES_DIR,
    widgetsDir,
    watch: true,
    spaRoot: SPA_ROOT,
    appRoot: '.',
    spa: SPA_MODE,
    basePath,
  },
  denoServerRuntime,
);
