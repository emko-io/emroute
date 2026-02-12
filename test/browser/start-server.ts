/**
 * Standalone Browser Test Server
 *
 * Starts the dev server with the same configuration as the test setup.
 *
 * Usage: deno run --allow-net --allow-read --allow-write --allow-run --allow-env --allow-sys test/browser/start-server.ts
 */

import { startServer } from './setup.ts';

await startServer({ watch: true });
console.log('\nReady for manual testing (watching for changes). Press Ctrl+C to stop.\n');
