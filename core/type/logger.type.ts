/**
 * Logger Interface
 *
 * Minimal pluggable logger. Default: no-op (silent degradation).
 * Pass via PipelineOptions to wire in.
 */
export interface Logger {
  error(msg: string, error?: Error): void;
  warn(msg: string): void;
}

const noop = () => {};

/** Default no-op logger. */
export const defaultLogger: Logger = { error: noop, warn: noop };

/** @deprecated Pass `logger` in Emroute.create() config instead. This function is a no-op. */
export function setLogger(_logger: Logger): void {
  console.warn('[emroute] setLogger() is deprecated. Pass `logger` in Emroute.create() config instead.');
}
