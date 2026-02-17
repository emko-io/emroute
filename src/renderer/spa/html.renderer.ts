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
  RouteConfig,
  RouteInfo,
  RouteParams,
  RouterState,
  RoutesManifest,
} from '../../type/route.type.ts';
import type { ContextProvider } from '../../component/abstract.component.ts';
import defaultPageComponent, { type PageComponent } from '../../component/page.component.ts';
import { ComponentElement } from '../../element/component.element.ts';
import {
  assertSafeRedirect,
  type BasePath,
  DEFAULT_BASE_PATH,
  DEFAULT_ROOT_ROUTE,
  RouteCore,
} from '../../route/route.core.ts';
import { escapeHtml, STATUS_MESSAGES } from '../../util/html.util.ts';
import { logger } from '../../util/logger.util.ts';

/** Options for SPA HTML Router */
export interface SpaHtmlRouterOptions {
  /** Enriches every ComponentContext with app-level services before it reaches components. */
  extendContext?: ContextProvider;
  /** Base paths for SSR endpoints. SPA uses html basePath for routing, md for passthrough. */
  basePath?: BasePath;
}

const MARKDOWN_RENDER_TIMEOUT = 5000;

/**
 * SPA Router for browser-based HTML rendering.
 */
export class SpaHtmlRouter {
  private core: RouteCore;
  private slot: Element | null = null;
  private abortController: AbortController | null = null;
  /** Base paths for SSR endpoints. */
  private htmlBase: string;
  private mdBase: string;

  constructor(manifest: RoutesManifest, options?: SpaHtmlRouterOptions) {
    const bp = options?.basePath ?? DEFAULT_BASE_PATH;
    this.htmlBase = bp.html;
    this.mdBase = bp.md;
    this.core = new RouteCore(manifest, {
      extendContext: options?.extendContext,
      basePath: this.htmlBase,
    });
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
        // Adopt SSR content — patterns are prefixed, match directly
        const matched = this.core.match(new URL(ssrRoute, location.origin));
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
    const initController = new AbortController();
    await this.handleNavigation(
      location.pathname + location.search + location.hash,
      initController.signal,
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

    const matchUrl = new URL(pathname + urlObj.search, location.origin);

    try {
      const matched = this.core.match(matchUrl);

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
      await this.handleError(error, pathname);
    }
  }

  /**
   * Render a matched page route with nested route support.
   */
  private async renderPage(
    routeInfo: RouteInfo,
    matched: MatchedRoute,
    signal: AbortSignal,
  ): Promise<void> {
    if (!this.slot) return;

    try {
      const hierarchy = this.core.buildRouteHierarchy(routeInfo.pattern);
      logger.render('page', routeInfo.pattern, `hierarchy: ${hierarchy.join(' > ')}`);

      let currentSlot: Element = this.slot;
      let pageTitle: string | undefined;

      for (let i = 0; i < hierarchy.length; i++) {
        if (signal.aborted) return;

        const routePattern = hierarchy[i];
        const isLeaf = i === hierarchy.length - 1;

        let route = this.core.matcher.findRoute(routePattern);

        if (!route && routePattern === this.core.root) {
          route = { ...DEFAULT_ROOT_ROUTE, pattern: this.core.root };
        }

        if (!route) {
          logger.render('skip', routePattern, 'route not found');
          continue;
        }

        const routeType = isLeaf ? 'leaf' : 'layout';
        logger.render(routeType, routePattern, `${route.files?.ts ?? 'default'} → slot`);

        // Skip wildcard route appearing as its own parent (prevents double-render)
        if (route === matched.route && routePattern !== matched.route.pattern) {
          continue;
        }

        const { html, title } = await this.renderRouteContent(routeInfo, route, signal, isLeaf);
        if (signal.aborted) return;

        currentSlot.setHTMLUnsafe(html);

        // Attribute bare <router-slot> tags with this route's pattern
        for (const slot of currentSlot.querySelectorAll('router-slot:not([pattern])')) {
          slot.setAttribute('pattern', routePattern);
        }

        if (title) {
          pageTitle = title;
        }

        // Wait for <mark-down> to finish rendering its content
        const markDown = currentSlot.querySelector<HTMLElement>('mark-down');
        if (markDown) {
          await this.waitForMarkdownRender(markDown);
          if (signal.aborted) return;
        }

        if (!isLeaf) {
          const nestedSlot = currentSlot.querySelector(
            `router-slot[pattern="${CSS.escape(routePattern)}"]`,
          );
          if (nestedSlot) {
            currentSlot = nestedSlot;
          } else {
            logger.warn(
              `[SPA] Route "${routePattern}" has no <router-slot> ` +
                `for child routes to render into. ` +
                `Add <router-slot></router-slot> to the parent template.`,
            );
          }
        }
      }

      if (signal.aborted) return;

      this.updateTitle(pageTitle);

      this.core.emit({
        type: 'load',
        pathname: routeInfo.pattern,
        params: routeInfo.params,
      });
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof Response) {
        await this.renderStatusPage(error.status, routeInfo.pattern, error);
        return;
      }
      throw error;
    }
  }

  /**
   * Render a single route's content.
   */
  private async renderRouteContent(
    routeInfo: RouteInfo,
    route: RouteConfig,
    signal: AbortSignal,
    isLeaf?: boolean,
  ): Promise<{ html: string; title?: string }> {
    if (route.modulePath === DEFAULT_ROOT_ROUTE.modulePath) {
      return { html: `<router-slot pattern="${route.pattern}"></router-slot>` };
    }

    const files = route.files ?? {};

    const component: PageComponent = files.ts
      ? (await this.core.loadModule<{ default: PageComponent }>(files.ts)).default
      : defaultPageComponent;

    const context = await this.core.buildComponentContext(routeInfo, route, signal, isLeaf);
    const data = await component.getData({ params: routeInfo.params, signal, context });
    const html = component.renderHTML({ data, params: routeInfo.params, context });
    const title = component.getTitle({ data, params: routeInfo.params, context });
    return { html, title };
  }

  /**
   * Wait for a <mark-down> element to finish rendering.
   */
  private waitForMarkdownRender(element: HTMLElement): Promise<void> {
    return new Promise((resolve) => {
      if (element.children.length > 0) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        observer.disconnect();
        resolve();
      }, MARKDOWN_RENDER_TIMEOUT);

      const observer = new MutationObserver(() => {
        if (element.children.length > 0) {
          clearTimeout(timeout);
          observer.disconnect();
          resolve();
        }
      });

      observer.observe(element, { childList: true });
    });
  }

  /**
   * Render a status-specific page.
   */
  private async renderStatusPage(
    status: number,
    pathname: string,
    _response?: Response,
  ): Promise<void> {
    if (!this.slot) return;

    const statusPage = this.core.matcher.getStatusPage(status);

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

    const boundary = this.core.matcher.findErrorBoundary(pathname);

    if (boundary) {
      try {
        const module = await this.core.loadModule<{ default: PageComponent }>(
          boundary.modulePath,
        );
        const component = module.default;
        const minCtx = {
          pathname: '',
          pattern: '',
          params: {},
          searchParams: new URLSearchParams(),
        };
        const data = await component.getData({ params: {}, context: minCtx });
        const html = component.renderHTML({ data, params: {}, context: minCtx });

        if (this.slot) {
          this.slot.setHTMLUnsafe(html);
          this.updateTitle();
        }
        return;
      } catch (e) {
        console.error('[Router] Error boundary failed:', e);
      }
    }

    const errorHandler = this.core.matcher.getErrorHandler();

    if (errorHandler) {
      try {
        const module = await this.core.loadModule<{ default: PageComponent }>(
          errorHandler.modulePath,
        );
        const component = module.default;
        const minCtx = {
          pathname: '',
          pattern: '',
          params: {},
          searchParams: new URLSearchParams(),
        };
        const data = await component.getData({ params: {}, context: minCtx });
        const html = component.renderHTML({ data, params: {}, context: minCtx });

        if (this.slot) {
          this.slot.setHTMLUnsafe(html);
          this.updateTitle();
        }
        return;
      } catch (e) {
        console.error('[Router] Error handler failed:', e);
      }
    }

    if (this.slot) {
      const message = error instanceof Error ? error.message : String(error);
      this.slot.setHTMLUnsafe(`
        <h1>Error</h1>
        <p>${escapeHtml(message)}</p>
      `);
      this.updateTitle();
    }
  }

  /**
   * Update document.title from getTitle() result.
   */
  private updateTitle(pageTitle?: string): void {
    if (pageTitle) {
      document.title = pageTitle;
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
  manifest: RoutesManifest,
  options?: SpaHtmlRouterOptions,
): Promise<SpaHtmlRouter> {
  const g = globalThis as Record<string, unknown>;
  if (g.__emroute_router) {
    console.warn('eMroute: SPA router already initialized. Remove duplicate <script> tags.');
    return g.__emroute_router as SpaHtmlRouter;
  }
  const router = new SpaHtmlRouter(manifest, options);
  await router.initialize();
  g.__emroute_router = router;
  return router;
}
