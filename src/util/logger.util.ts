/**
 * Logger Utility
 *
 * Provides structured logging for emroute internals.
 * Enable via localStorage: localStorage.setItem('emroute:debug', 'true')
 */

const STORAGE_KEY = 'emroute:debug';
const PREFIX = '[emroute]';

function isEnabled(): boolean {
  if (typeof globalThis.localStorage === 'undefined') return false;
  return globalThis.localStorage.getItem(STORAGE_KEY) === 'true';
}

export const logger = {
  /** Enable debug logging (persists in localStorage) */
  enable(): void {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem(STORAGE_KEY, 'true');
      console.log(`${PREFIX} Debug logging enabled`);
    }
  },

  /** Disable debug logging */
  disable(): void {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.removeItem(STORAGE_KEY);
      console.log(`${PREFIX} Debug logging disabled`);
    }
  },

  /** Log general information */
  info(category: string, message: string, data?: unknown): void {
    if (!isEnabled()) return;
    const prefix = `${PREFIX} [${category}]`;
    if (data !== undefined) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  },

  /** Log navigation events */
  nav(action: string, from: string, to: string, data?: Record<string, unknown>): void {
    if (!isEnabled()) return;
    console.log(`${PREFIX} [nav] ${action}:`, { from, to, ...(data ?? {}) });
  },

  /** Log rendering events */
  render(component: string, route: string, mode?: string): void {
    if (!isEnabled()) return;
    const modeStr = mode ? ` [mode=${mode}]` : '';
    console.log(`${PREFIX} [render]${modeStr} ${component} → ${route}`);
  },

  /** Log link interception */
  link(action: 'intercept' | 'passthrough', href: string, reason?: string): void {
    if (!isEnabled()) return;
    const reasonStr = reason ? ` (${reason})` : '';
    console.log(`${PREFIX} [link] ${action}: ${href}${reasonStr}`);
  },

  /** Log widget lifecycle */
  widget(event: string, name: string, data?: unknown): void {
    if (!isEnabled()) return;
    console.log(`${PREFIX} [widget] ${event}: ${name}`, data ?? '');
  },

  /** Log warnings (always shown, not gated by debug flag) */
  warn(message: string): void {
    console.warn(`${PREFIX}`, message);
  },

  /** Log SSR adoption */
  ssr(action: string, route: string): void {
    if (!isEnabled()) return;
    console.log(`${PREFIX} [ssr] ${action}: ${route}`);
  },
};

// Expose globally for console access
(globalThis as Record<string, unknown>).__emroute_logger = logger;
