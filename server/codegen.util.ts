/**
 * Code Generation Utilities
 *
 * Generates a default main.ts entry point for SPA bootstrapping.
 * The generated code simply calls `bootEmrouteApp()` which handles
 * fetching manifests, creating the runtime, and wiring navigation.
 */

import type { SpaMode } from '../src/type/widget.type.ts';

/**
 * Generate a minimal main.ts entry point.
 *
 * For `root`/`only` modes: calls `bootEmrouteApp()` which fetches
 * manifests as JSON, creates FetchRuntime, registers widgets lazily,
 * and wires Navigation API.
 *
 * For `leaf` mode: just imports the SPA module (registers custom elements).
 *
 * Consumer can replace this with a hand-written main.ts that sets up
 * MarkdownElement renderer, registers custom elements, etc.
 */
export function generateMainTs(
  spa: SpaMode,
  importPath: string,
): string {
  const spaImport = `${importPath}/spa`;

  if (spa === 'root' || spa === 'only') {
    return `/** Auto-generated entry point — do not edit. */
import { bootEmrouteApp } from '${spaImport}';

await bootEmrouteApp();
`;
  }

  // leaf mode — just import spa module to register custom elements
  return `/** Auto-generated entry point — do not edit. */
import '${spaImport}';
`;
}
