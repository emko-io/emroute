/**
 * Standalone Browser Test Server
 *
 * Starts the dev server with the same configuration as the test setup.
 *
 * Usage: bun test/browser/shared/start-server.ts
 * Set SPA_MODE env var to test different modes: SPA_MODE=leaf bun ...
 */

import type { SpaMode } from '../../../src/type/widget.type.ts';
import { createTestServer } from './setup.ts';

const spaMode = (process.env.SPA_MODE ?? 'only') as SpaMode;
const port = process.env.TEST_PORT ? Number(process.env.TEST_PORT) : 4101;

await createTestServer({ mode: spaMode, port });
console.log(
  `\nReady for manual testing (mode: ${spaMode}, port: ${port}). Press Ctrl+C to stop.\n`,
);
