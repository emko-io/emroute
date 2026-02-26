/// <reference path="../../type/navigation-api.d.ts" />

/**
 * Emroute App
 *
 * Browser entry point for `/app/` routes. Wraps an EmrouteServer instance
 * (same server, same pipeline) with Navigation API glue that intercepts
 * link clicks, calls `htmlRouter.render()`, and injects the result.
 */

import type { EmrouteServer } from '../../../server/server-api.type.ts';
import type { NavigateOptions } from '../../type/route.type.ts';
import { assertSafeRedirect, type BasePath, DEFAULT_BASE_PATH } from '../../route/route.core.ts';
import { escapeHtml } from '../../util/html.util.ts';

/** Options for `createEmrouteApp`. */
export interface EmrouteAppOptions {
  basePath?: BasePath;
}

/** Browser app — Navigation API wired to an EmrouteServer. */
export class EmrouteApp {
  private readonly server: EmrouteServer;
  private readonly appBase: string;
  private slot: Element | null = null;
  private abortController: AbortController | null = null;

  constructor(server: EmrouteServer, options?: EmrouteAppOptions) {
    const bp = options?.basePath ?? DEFAULT_BASE_PATH;
    this.server = server;
    this.appBase = bp.app;
  }

  async initialize(slotSelector = 'router-slot'): Promise<void> {
    this.slot = document.querySelector(slotSelector);

    if (!this.slot) {
      console.error('[EmrouteApp] Slot not found:', slotSelector);
      return;
    }

    if (!('navigation' in globalThis)) {
      console.warn('[EmrouteApp] Navigation API not available');
      return;
    }

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    navigation.addEventListener('navigate', (event) => {
      if (!event.canIntercept) return;
      if (event.hashChange) return;
      if (event.downloadRequest !== null) return;

      const url = new URL(event.destination.url);
      if (!this.isAppPath(url.pathname)) return;

      event.intercept({
        scroll: 'manual',
        handler: async () => {
          await this.handleNavigation(url, event.signal);
          event.scroll();
        },
      });
    }, { signal });

    // SSR adoption — server already rendered this page, skip re-render
    const ssrRoute = this.slot.getAttribute('data-ssr-route');
    if (ssrRoute && (location.pathname === ssrRoute || location.pathname === ssrRoute + '/')) {
      this.slot.removeAttribute('data-ssr-route');
      return;
    }

    // Initial render
    await this.handleNavigation(new URL(location.href), this.abortController.signal);
  }

  dispose(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.slot = null;
  }

  async navigate(url: string, options: NavigateOptions = {}): Promise<void> {
    try {
      const { finished } = navigation.navigate(url, {
        state: options.state,
        history: options.replace ? 'replace' : 'auto',
      });
      await finished;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      throw e;
    }
  }

  private isAppPath(pathname: string): boolean {
    return pathname === this.appBase || pathname.startsWith(this.appBase + '/');
  }

  private stripAppBase(pathname: string): string {
    if (pathname === this.appBase) return '/';
    if (pathname.startsWith(this.appBase + '/')) return pathname.slice(this.appBase.length);
    return pathname;
  }

  private async handleNavigation(url: URL, signal: AbortSignal): Promise<void> {
    if (!this.slot || !this.server.htmlRouter) return;

    const routePath = this.stripAppBase(url.pathname);
    const routeUrl = new URL(routePath + url.search, url.origin);

    try {
      const { content, title, redirect } = await this.server.htmlRouter.render(routeUrl, signal);

      if (signal.aborted) return;

      if (redirect) {
        assertSafeRedirect(redirect);
        const target = redirect.startsWith('/') ? this.appBase + redirect : redirect;
        navigation.navigate(target, { history: 'replace' });
        return;
      }

      if (document.startViewTransition) {
        const transition = document.startViewTransition(() => {
          this.slot!.setHTMLUnsafe(content);
        });
        signal.addEventListener('abort', () => transition.skipTransition(), { once: true });
        await transition.updateCallbackDone;
      } else {
        this.slot.setHTMLUnsafe(content);
      }

      if (title) document.title = title;
    } catch (error) {
      if (signal.aborted) return;
      console.error('[EmrouteApp] Navigation error:', error);
      if (this.slot) {
        const message = error instanceof Error ? error.message : String(error);
        this.slot.setHTMLUnsafe(`<h1>Error</h1><p>${escapeHtml(message)}</p>`);
      }
    }
  }
}

/**
 * Create and initialize the browser app.
 *
 * Stored on `globalThis.__emroute_app` for programmatic access.
 */
export async function createEmrouteApp(
  server: EmrouteServer,
  options?: EmrouteAppOptions,
): Promise<EmrouteApp> {
  const g = globalThis as Record<string, unknown>;
  if (g.__emroute_app) {
    console.warn('eMroute: App already initialized.');
    return g.__emroute_app as EmrouteApp;
  }
  const app = new EmrouteApp(server, options);
  await app.initialize();
  g.__emroute_app = app;
  return app;
}
