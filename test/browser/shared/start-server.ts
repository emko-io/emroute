/**
 * Standalone Browser Test Server
 *
 * Starts the dev server with the same configuration as the test setup.
 *
 * Usage: deno run --allow-net --allow-read --allow-write --allow-run --allow-env --allow-sys test/browser/shared/start-server.ts
 * Set SPA_MODE env var to test different modes: SPA_MODE=leaf deno run ...
 */

import type { SpaMode } from '../../../src/type/widget.type.ts';
import { createTestServer } from './setup.ts';

const spaMode = (Deno.env.get('SPA_MODE') ?? 'only') as SpaMode;
const port = Deno.env.get('TEST_PORT') ? Number(Deno.env.get('TEST_PORT')) : 4101;

await createTestServer({ mode: spaMode, port, watch: true });
console.log(
  `\nReady for manual testing (mode: ${spaMode}, port: ${port}). Press Ctrl+C to stop.\n`,
);
