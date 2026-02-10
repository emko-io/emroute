/**
 * Logger Interface
 *
 * Minimal pluggable logger for surfacing errors from silent catch blocks.
 * Structurally compatible with hardkore's StructuredLogger — any instance
 * of that class satisfies this interface without an explicit dependency.
 *
 * Default: no-op (silent degradation). Call setLogger() at startup to wire in.
 */
export interface Logger {
  error(msg: string, error?: Error): void;
  warn(msg: string): void;
}

const noop = () => {};

/** Module-level logger. Always callable — defaults to no-op. */
export const logger: Logger = { error: noop, warn: noop };

/** Replace the logger implementation. Call once at startup. */
export function setLogger(impl: Logger): void {
  logger.error = impl.error.bind(impl);
  logger.warn = impl.warn.bind(impl);
}
