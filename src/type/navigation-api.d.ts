/**
 * Navigation API type declarations.
 *
 * The Navigation API is supported by all major browsers (Chrome 102+, Edge 102+,
 * Firefox 147+, Safari 26.2+) but TypeScript's lib.dom.d.ts does not yet include
 * these types. This file provides the subset used by the SPA renderer.
 *
 * Will be removed once TypeScript ships native Navigation API types.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API
 * @see ADR-0014
 */

interface NavigationNavigateOptions {
  state?: unknown;
  history?: 'auto' | 'push' | 'replace';
}

interface NavigationResult {
  committed: Promise<NavigationHistoryEntry>;
  finished: Promise<NavigationHistoryEntry>;
}

interface NavigationHistoryEntry extends EventTarget {
  readonly key: string;
  readonly id: string;
  readonly url: string | null;
  readonly index: number;
  readonly sameDocument: boolean;
  getState(): unknown;
}

interface NavigationDestination {
  readonly url: string;
  readonly key: string | null;
  readonly id: string | null;
  readonly index: number;
  readonly sameDocument: boolean;
  getState(): unknown;
}

interface NavigationInterceptOptions {
  handler?: () => Promise<void>;
  focusReset?: 'after-transition' | 'manual';
  scroll?: 'after-transition' | 'manual';
}

interface NavigateEvent extends Event {
  readonly navigationType: 'push' | 'replace' | 'reload' | 'traverse';
  readonly destination: NavigationDestination;
  readonly canIntercept: boolean;
  readonly userInitiated: boolean;
  readonly hashChange: boolean;
  readonly signal: AbortSignal;
  readonly formData: FormData | null;
  readonly downloadRequest: string | null;
  readonly info: unknown;
  intercept(options?: NavigationInterceptOptions): void;
  scroll(): void;
}

interface NavigationUpdateCurrentEntryOptions {
  state: unknown;
}

interface Navigation extends EventTarget {
  readonly currentEntry: NavigationHistoryEntry | null;
  readonly transition: NavigationTransition | null;
  entries(): NavigationHistoryEntry[];
  navigate(url: string, options?: NavigationNavigateOptions): NavigationResult;
  reload(options?: NavigationNavigateOptions): NavigationResult;
  back(): NavigationResult;
  forward(): NavigationResult;
  traverseTo(key: string): NavigationResult;
  updateCurrentEntry(options: NavigationUpdateCurrentEntryOptions): void;
  addEventListener(
    type: 'navigate',
    listener: (event: NavigateEvent) => void,
    options?: AddEventListenerOptions,
  ): void;
  addEventListener(
    type: 'navigatesuccess' | 'navigateerror' | 'currententrychange',
    listener: (event: Event) => void,
    options?: AddEventListenerOptions,
  ): void;
}

interface NavigationTransition {
  readonly navigationType: 'push' | 'replace' | 'reload' | 'traverse';
  readonly from: NavigationHistoryEntry;
  readonly finished: Promise<void>;
}

// deno-lint-ignore no-var
declare var navigation: Navigation;
