/**
 * Standalone Browser Test Server
 *
 * Starts the dev server with the same configuration as the test setup.
 *
 * Usage: deno run --allow-net --allow-read --allow-write --allow-run --allow-env --allow-sys test/browser/start-server.ts
 * Set SPA_MODE env var to test different modes: SPA_MODE=leaf deno run ...
 */

import type { SpaMode } from '../../src/type/widget.type.ts';
import { startServer } from './setup.ts';

const spaMode = Deno.env.get('SPA_MODE') as SpaMode | undefined;

await startServer({ watch: true, spa: spaMode ?? 'only' });
console.log(
  '\nReady for manual testing (watching for changes). Press Ctrl+C to stop.\n',
);
