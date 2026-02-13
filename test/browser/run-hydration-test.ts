/**
 * Hydration Test Runner
 *
 * Runs the SSR-to-SPA hydration tests in isolation.
 *
 * Usage:
 *   deno test --allow-net --allow-read --allow-write --allow-run --allow-env --allow-sys test/browser/hydration.test.ts
 *
 * Or with this helper:
 *   deno run --allow-net --allow-read --allow-write --allow-run --allow-env --allow-sys test/browser/run-hydration-test.ts
 */

import './hydration.test.ts';
