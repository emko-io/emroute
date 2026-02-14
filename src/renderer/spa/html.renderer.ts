/**
 * SPA HTML Renderer
 *
 * Browser-based Single Page Application renderer.
 * Handles:
 * - DOM manipulation (slot.innerHTML)
 * - History API (pushState, replaceState, popstate)
 * - Link interception for SPA navigation
 * - Scroll handling and anchor navigation
 * - Title updates from <h1>
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
  DEFAULT_ROOT_ROUTE,
  RouteCore,
  SSR_HTML_PREFIX,
  SSR_MD_PREFIX,
  stripSsrPrefix,
} from '../../route/route.core.ts';
import { escapeHtml, STATUS_MESSAGES } from '../../util/html.util.ts';

/** Options for SPA HTML Router */
export interface SpaHtmlRouterOptions {
  /** Enriches every ComponentContext with app-level services before it reaches components. */
  extendContext?: ContextProvider;
}

const MARKDOWN_RENDER_TIMEOUT = 5000;

/**
 * SPA Router for browser-based HTML rendering.
 */
export class SpaHtmlRouter {
  private core: RouteCore;
  private slot: Element | null = null;
  private abortController: AbortController | null = null;
  /** Per-navigation controller — aborted when a newer navigation starts. */
  private navigationController: AbortController | null = null;

  constructor(manifest: RoutesManifest, options?: SpaHtmlRouterOptions) {
    this.core = new RouteCore(manifest, { extendContext: options?.extendContext });
    if (options?.extendContext) {
      ComponentElement.setContextProvider(options.extendContext);
    }
  }

  /**
   * Initialize router with slot element.
   * Sets up history listeners and performs initial navigation.
   */
  async initialize(slotSelector = 'router-slot'): Promise<void> {
    this.slot = document.querySelector(slotSelector);

    if (!this.slot) {
      console.error(`[Router] Slot not found: ${slotSelector}`);
      return;
    }

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    // Listen for popstate (back/forward navigation)
    globalThis.addEventListener('popstate', (e) => {
      const state = e.state as RouterState | null;
      this.handleNavigation(
        location.pathname + location.search + location.hash,
        {
          replace: true,
          state: state ?? undefined,
        },
      );
    }, { signal });

    // Intercept link clicks for SPA navigation
    document.addEventListener('click', (e) => {
      const link = (e.target instanceof Element) ? e.target.closest('a') : null;
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href) return;

      // Skip modifier-key clicks (new tab, new window, download)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      // Skip external links, downloads, and special targets
      if (
        link.hasAttribute('download') ||
        link.target === '_blank' ||
        link.origin !== location.origin ||
        href.startsWith('#')
      ) {
        return;
      }

      if (link.pathname.startsWith(SSR_HTML_PREFIX) || link.pathname.startsWith(SSR_MD_PREFIX)) {
        return;
      }

      e.preventDefault();
      this.navigate(href);
    }, { signal });

    // Check for SSR content — skip initial render if route matches
    const ssrRoute = this.slot.getAttribute('data-ssr-route');
    if (ssrRoute) {
      const currentPath = stripSsrPrefix(location.pathname);

      if (currentPath === ssrRoute || currentPath === ssrRoute + '/') {
        // Adopt SSR content: set internal state without re-rendering
        const matched = this.core.match(new URL(ssrRoute, location.origin));
        if (matched) {
          this.core.currentRoute = matched;
          history.replaceState(
            { pathname: ssrRoute, params: matched.params } as RouterState,
            '',
          );
        }
        this.slot.removeAttribute('data-ssr-route');
        return;
      }
    }

    // No SSR content or route mismatch — full client-side render
    await this.handleNavigation(
      location.pathname + location.search + location.hash,
    );
  }

  /**
   * Remove event listeners and release references.
   */
  dispose(): void {
    this.navigationController?.abort();
    this.navigationController = null;
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
    await this.handleNavigation(normalizedUrl, options);
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
   * Each call aborts the previous in-flight navigation so that only the
   * most recently initiated navigation can mutate the DOM.
   */
  private async handleNavigation(
    url: string,
    options: NavigateOptions = {},
  ): Promise<void> {
    const urlObj = new URL(url, location.origin);
    let pathname = urlObj.pathname;
    const hash = urlObj.hash;

    // /md/ paths are handled server-side, not by SPA router
    if (pathname.startsWith(SSR_MD_PREFIX)) {
      globalThis.location.href = url;
      return;
    }

    // Strip /html/ or /md/ prefix if present
    pathname = stripSsrPrefix(pathname);

    const matchUrl = new URL(pathname + urlObj.search, location.origin);

    // Cancel any in-flight navigation before starting this one
    this.navigationController?.abort();
    const navController = new AbortController();
    this.navigationController = navController;
    const { signal } = navController;

    try {
      const matched = this.core.match(matchUrl);

      if (!matched) {
        await this.renderStatusPage(404, pathname);
        return;
      }

      // Handle redirect
      if (matched.route.type === 'redirect') {
        const module = await this.core.loadModule<{ default: RedirectConfig }>(
          matched.route.modulePath,
        );
        if (signal.aborted) return;
        assertSafeRedirect(module.default.to);
        this.navigate(module.default.to, { replace: true });
        return;
      }

      // Update history
      const state: RouterState = {
        pathname,
        params: matched.params,
        scrollY: options.state?.scrollY,
      };

      if (options.replace) {
        history.replaceState(state, '', url);
      } else {
        history.pushState(state, '', url);
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

      // Handle scrolling
      if (hash) {
        this.scrollToAnchor(hash.slice(1));
      } else if (!options.state?.scrollY) {
        globalThis.scrollTo(0, 0);
      } else {
        globalThis.scrollTo(0, options.state.scrollY);
      }
    } catch (error) {
      // Silently discard errors from aborted navigations
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

      let currentSlot: Element = this.slot;
      let pageTitle: string | undefined;

      for (let i = 0; i < hierarchy.length; i++) {
        if (signal.aborted) return;

        const routePattern = hierarchy[i];
        const isLeaf = i === hierarchy.length - 1;

        let route = this.core.matcher.findRoute(routePattern);

        if (!route && routePattern === '/') {
          route = DEFAULT_ROOT_ROUTE;
        }

        if (!route) continue;

        // Skip wildcard route appearing as its own parent (prevents double-render)
        if (route === matched.route && routePattern !== matched.route.pattern) {
          continue;
        }

        const { html, title } = await this.renderRouteContent(routeInfo, route, signal, isLeaf);
        if (signal.aborted) return;

        currentSlot.innerHTML = html;

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
          const nestedSlot = currentSlot.querySelector('router-slot');
          if (nestedSlot) {
            currentSlot = nestedSlot;
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
      return { html: '<router-slot></router-slot>' };
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
        this.slot.innerHTML = component.renderHTML({ data, params: {}, context });
        this.updateTitle();
        return;
      } catch (e) {
        console.error(`[Router] Failed to render ${status} page:`, e);
      }
    }

    this.slot.innerHTML = `
      <h1>${STATUS_MESSAGES[status] ?? 'Error'}</h1>
      <p>Path: ${escapeHtml(pathname)}</p>
    `;
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
        const data = await component.getData({ params: {} });
        const html = component.renderHTML({ data, params: {} });

        if (this.slot) {
          this.slot.innerHTML = html;
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
        const data = await component.getData({ params: {} });
        const html = component.renderHTML({ data, params: {} });

        if (this.slot) {
          this.slot.innerHTML = html;
          this.updateTitle();
        }
        return;
      } catch (e) {
        console.error('[Router] Error handler failed:', e);
      }
    }

    if (this.slot) {
      const message = error instanceof Error ? error.message : String(error);
      this.slot.innerHTML = `
        <h1>Error</h1>
        <p>${escapeHtml(message)}</p>
      `;
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

  /**
   * Scroll to anchor element.
   */
  private scrollToAnchor(id: string): void {
    requestAnimationFrame(() => {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    });
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
