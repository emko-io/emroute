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
