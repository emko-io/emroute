/**
 * Emroute — re-exports from core/server.
 */
export { Emroute } from '../core/server/emroute.server.ts';

// ── Deprecated aliases ───────────────────────────────────────────────

import { Emroute as _Emroute } from '../core/server/emroute.server.ts';
import type { Runtime } from '../core/runtime/abstract.runtime.ts';

/** @deprecated Use `Emroute` class directly. */
export type EmrouteServer = _Emroute;

/** @deprecated Use `Emroute.create(config, runtime)`. */
export function createEmrouteServer(
  config: Parameters<typeof _Emroute.create>[0],
  runtime: Runtime,
): Promise<_Emroute> {
  return _Emroute.create(config, runtime);
}
