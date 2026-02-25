/// <reference path="../../type/navigation-api.d.ts" />

/**
 * SPA HTML Renderer
 *
 * Browser-based Single Page Application renderer.
 * Handles:
 * - DOM manipulation (slot.innerHTML)
 * - Navigation API (navigate event, intercept, scroll restoration)
 * - Document title via component.getTitle()
 * - View transitions
 */

import type {
  MatchedRoute,
  NavigateOptions,
  RedirectConfig,
  RouteParams,
  RouterState,
} from '../../type/route.type.ts';
import type { ContextProvider } from '../../component/abstract.component.ts';
import type { PageComponent } from '../../component/page.component.ts';
import type { RouteResolver } from '../../route/route.resolver.ts';
import { ComponentElement } from '../../element/component.element.ts';
import {
  assertSafeRedirect,
  type BasePath,
  DEFAULT_BASE_PATH,
  RouteCore,
} from '../../route/route.core.ts';
import { escapeHtml, STATUS_MESSAGES } from '../../util/html.util.ts';
import { logger } from '../../util/logger.util.ts';
import { BaseRenderer } from './base.renderer.ts';
import type { RouteInfo } from '../../type/route.type.ts';
import defaultPageComponent from '../../component/page.component.ts';

/** Options for SPA HTML Router */
export interface SpaHtmlRouterOptions {
  /** Enriches every ComponentContext with app-level services before it reaches components. */
  extendContext?: ContextProvider;
  /** Base paths for SSR endpoints. SPA uses html basePath for routing, md for passthrough. */
  basePath?: BasePath;
  /** Pre-bundled module loaders keyed by file path. Bridges JSON route tree → bundled code in the browser. */
  moduleLoaders?: Record<string, () => Promise<unknown>>;
}

/**
 * SPA Router for browser-based HTML rendering.
 */
export class SpaHtmlRouter extends BaseRenderer {
  private abortController: AbortController | null = null;
  /** Base paths for SSR endpoints. */
  private htmlBase: string;
  private mdBase: string;

  constructor(resolver: RouteResolver, options?: SpaHtmlRouterOptions) {
    const bp = options?.basePath ?? DEFAULT_BASE_PATH;
    const core = new RouteCore(resolver, {
      extendContext: options?.extendContext,
      basePath: bp.html,
      moduleLoaders: options?.moduleLoaders,
    });
    super(core);
    this.htmlBase = bp.html;
    this.mdBase = bp.md;
    if (options?.extendContext) {
      ComponentElement.setContextProvider(options.extendContext);
    }
  }

  /**
   * Initialize router with slot element.
   * Sets up Navigation API listener and performs initial navigation.
   */
  async initialize(slotSelector = 'router-slot'): Promise<void> {
    this.slot = document.querySelector(slotSelector);

    if (!this.slot) {
      console.error(`[Router] Slot not found: ${slotSelector}`);
      return;
    }

    // Navigation API required for SPA routing — SSR handles browsers without it
    if (!('navigation' in globalThis)) {
      logger.info('init', 'Navigation API not available — using SSR full-page navigation');
      return;
    }

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    // Single handler for ALL navigations: link clicks, back/forward,
    // navigate() calls, form submissions. Replaces popstate + click listeners.
    navigation.addEventListener('navigate', (event) => {
      if (!event.canIntercept) return;
      if (event.hashChange) return;
      if (event.downloadRequest !== null) return;

      const url = new URL(event.destination.url);

      // /md/ paths pass through to server for full page load
      if (url.pathname.startsWith(this.mdBase + '/') || url.pathname === this.mdBase) {
        return;
      }

      event.intercept({
        scroll: 'manual',
        handler: async () => {
          await this.handleNavigation(
            url.pathname + url.search + url.hash,
            event.signal,
          );
          event.scroll();
        },
      });
    }, { signal });

    // Check for SSR content — skip initial render if route matches.
    // data-ssr-route stores the full path including basePath (e.g. /html/about).
    const ssrRoute = this.slot.getAttribute('data-ssr-route');
    if (ssrRoute) {
      const currentPath = location.pathname;
      logger.ssr('check-adoption', `SSR route=${ssrRoute}, current=${currentPath}`);

      if (currentPath === ssrRoute || currentPath === ssrRoute + '/') {
        // Adopt SSR content — strip basePath before matching unprefixed trie
        const matched = this.core.match(new URL(this.stripBase(ssrRoute), location.origin));
        if (matched) {
          logger.ssr('adopt', ssrRoute);
          this.core.currentRoute = matched;
          navigation.updateCurrentEntry({
            state: { pathname: ssrRoute, params: matched.params } as RouterState,
          });
        }
        this.slot.removeAttribute('data-ssr-route');
        return;
      } else {
        logger.ssr('mismatch', `Expected ${ssrRoute}, got ${currentPath}`);
      }
    }

    // No SSR content or route mismatch — full client-side render
    logger.info('init', `Initial navigation to ${location.pathname}`);
    await this.handleNavigation(
      location.pathname + location.search + location.hash,
      this.abortController.signal,
    );
  }

  /**
   * Remove event listeners and release references.
   */
  dispose(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.slot = null;
    ComponentElement.setContextProvider(undefined);
  }

  /**
   * Navigate to a new URL.
   */
  async navigate(url: string, options: NavigateOptions = {}): Promise<void> {
    const normalizedUrl = this.core.normalizeUrl(url);
    try {
      const { finished } = navigation.navigate(normalizedUrl, {
        state: options.state,
        history: options.replace ? 'replace' : 'auto',
      });
      await finished;
    } catch (e) {
      // Navigation interrupted (e.g. by a redirect) — not an error
      if (e instanceof DOMException && e.name === 'AbortError') return;
      throw e;
    }
  }

  /**
   * Add event listener for router events.
   */
  addEventListener(
    listener: Parameters<RouteCore['addEventListener']>[0],
  ): () => void {
    return this.core.addEventListener(listener);
  }

  /**
   * Get current route parameters.
   */
  getParams(): RouteParams {
    return this.core.getParams();
  }

  /**
   * Get current matched route.
   */
  getCurrentRoute(): MatchedRoute | null {
    return this.core.currentRoute;
  }

  /**
   * Strip the HTML basePath prefix from a browser pathname.
   * Browser URLs include the prefix (e.g. /html/about) but trie patterns don't.
   */
  private stripBase(pathname: string): string {
    if (this.htmlBase && (pathname.startsWith(this.htmlBase + '/') || pathname === this.htmlBase)) {
      return pathname === this.htmlBase ? '/' : pathname.slice(this.htmlBase.length);
    }
    return pathname;
  }

  /**
   * Handle navigation to a URL.
   *
   * Pure render function — URL updates and scroll restoration are handled
   * by the Navigation API. Abort is signalled via the navigate event's signal.
   */
  private async handleNavigation(
    url: string,
    signal: AbortSignal,
  ): Promise<void> {
    const urlObj = new URL(url, location.origin);
    const pathname = urlObj.pathname;

    logger.nav('start', location.pathname, pathname);

    // /md/ paths are handled server-side (initial load only — navigate handler filters these)
    if (pathname.startsWith(this.mdBase + '/') || pathname === this.mdBase) {
      logger.nav('redirect-md', pathname, pathname, { reason: 'server-side markdown' });
      globalThis.location.href = url;
      return;
    }

    // Strip basePath prefix — trie holds unprefixed patterns
    const routePath = this.stripBase(pathname);

    try {
      const matched = this.core.match(new URL(routePath, location.origin));

      if (!matched) {
        logger.nav('not-found', pathname, pathname);
        await this.renderStatusPage(404, pathname);
        return;
      }

      logger.nav('matched', pathname, matched.route.pattern, { params: matched.params });

      // Handle redirect — starts a new navigation, aborting this one
      if (matched.route.type === 'redirect') {
        const module = await this.core.loadModule<{ default: RedirectConfig }>(
          matched.route.modulePath,
        );
        if (signal.aborted) return;
        assertSafeRedirect(module.default.to);
        navigation.navigate(module.default.to, { history: 'replace' });
        return;
      }

      // Render page
      this.core.currentRoute = matched;
      const routeInfo = this.core.toRouteInfo(matched, pathname);

      if (document.startViewTransition) {
        const transition = document.startViewTransition(async () => {
          await this.renderPage(routeInfo, matched, signal);
        });
        signal.addEventListener('abort', () => transition.skipTransition(), { once: true });
        await transition.updateCallbackDone;
      } else {
        await this.renderPage(routeInfo, matched, signal);
      }

      if (signal.aborted) return;

      // Emit navigate event
      this.core.emit({
        type: 'navigate',
        pathname,
        params: matched.params,
      });
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof Response) {
        await this.renderStatusPage(error.status, pathname);
        return;
      }
      await this.handleError(error, routePath);
    }
  }

  /**
   * Render a status-specific page.
   */
  private async renderStatusPage(
    status: number,
    pathname: string,
  ): Promise<void> {
    if (!this.slot) return;

    const statusPage = this.core.getStatusPage(status);

    if (statusPage) {
      try {
        const component: PageComponent = statusPage.files?.ts
          ? (await this.core.loadModule<{ default: PageComponent }>(statusPage.files.ts)).default
          : defaultPageComponent;
        const ri: RouteInfo = {
          pathname,
          pattern: statusPage.pattern,
          params: {},
          searchParams: new URLSearchParams(),
        };
        const context = await this.core.buildComponentContext(ri, statusPage);
        const data = await component.getData({ params: {}, context });
        this.slot.setHTMLUnsafe(component.renderHTML({ data, params: {}, context }));
        this.updateTitle();
        return;
      } catch (e) {
        console.error(`[Router] Failed to render ${status} page:`, e);
      }
    }

    this.slot.setHTMLUnsafe(`
      <h1>${STATUS_MESSAGES[status] ?? 'Error'}</h1>
      <p>Path: ${escapeHtml(pathname)}</p>
    `);
    this.updateTitle();
  }

  /** Try to load and render an error boundary or handler module into the slot. */
  private async tryRenderErrorModule(modulePath: string): Promise<boolean> {
    try {
      const module = await this.core.loadModule<{ default: PageComponent }>(modulePath);
      const component = module.default;
      const minCtx = { pathname: '', pattern: '', params: {}, searchParams: new URLSearchParams() };
      const data = await component.getData({ params: {}, context: minCtx });
      const html = component.renderHTML({ data, params: {}, context: minCtx });
      if (this.slot) {
        this.slot.setHTMLUnsafe(html);
        this.updateTitle();
      }
      return true;
    } catch (e) {
      console.error('[Router] Error module failed:', e);
      return false;
    }
  }

  /**
   * Handle errors during navigation/rendering.
   */
  private async handleError(error: unknown, pathname: string): Promise<void> {
    console.error('[Router] Navigation error:', error);

    this.core.emit({
      type: 'error',
      pathname,
      params: {},
      error: error instanceof Error ? error : new Error(String(error)),
    });

    const boundary = this.core.findErrorBoundary(pathname);
    if (boundary && await this.tryRenderErrorModule(boundary.modulePath)) return;

    const errorHandler = this.core.getErrorHandler();
    if (errorHandler && await this.tryRenderErrorModule(errorHandler.modulePath)) return;

    if (this.slot) {
      const message = error instanceof Error ? error.message : String(error);
      this.slot.setHTMLUnsafe(`
        <h1>Error</h1>
        <p>${escapeHtml(message)}</p>
      `);
      this.updateTitle();
    }
  }
}

/**
 * Create and initialize SPA HTML router.
 *
 * The router instance is stored on `globalThis.__emroute_router` for
 * programmatic access from consumer scripts (navigate, getParams, etc.).
 * Calling this function twice returns the existing router with a warning.
 */
export async function createSpaHtmlRouter(
  resolver: RouteResolver,
  options?: SpaHtmlRouterOptions,
): Promise<SpaHtmlRouter> {
  const g = globalThis as Record<string, unknown>;
  if (g.__emroute_router) {
    console.warn('eMroute: SPA router already initialized. Remove duplicate <script> tags.');
    return g.__emroute_router as SpaHtmlRouter;
  }
  const router = new SpaHtmlRouter(resolver, options);
  await router.initialize();
  g.__emroute_router = router;
  return router;
}
