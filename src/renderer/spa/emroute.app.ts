/// <reference path="../../type/navigation-api.d.ts" />

/**
 * Emroute App
 *
 * Browser entry point for `/app/` routes. Wraps an Emroute instance
 * (same server, same pipeline) with Navigation API glue that intercepts
 * link clicks, calls `htmlRouter.render()`, and injects the result.
 */

import { Emroute } from '../../../core/server/emroute.server.ts';
import { FetchRuntime } from '../../../runtime/fetch.runtime.ts';
import { ROUTES_MANIFEST_PATH, WIDGETS_MANIFEST_PATH, ELEMENTS_MANIFEST_PATH } from '../../../core/runtime/abstract.runtime.ts';
import type { RouteNode } from '../../../core/type/route-tree.type.ts';
import type { NavigateOptions } from '../../../core/type/route.type.ts';
import type { WidgetManifestEntry } from '../../../core/type/widget.type.ts';
import type { ElementManifestEntry } from '../../../core/type/element.type.ts';
import type { ContextProvider } from '../../../core/type/component.type.ts';
import { type BasePath, DEFAULT_BASE_PATH } from '../../../core/server/emroute.server.ts';
import { assertSafeRedirect, escapeHtml } from '../../../core/util/html.util.ts';
import { ComponentElement } from '../../element/component.element.ts';
import { MarkdownElement } from '../../element/markdown.element.ts';
import { WidgetRegistry } from '../../../core/widget/widget.registry.ts';

/** Options for `createEmrouteApp`. */
export interface EmrouteAppOptions {
  basePath?: BasePath;
}

/** Browser app — Navigation API wired to an Emroute. */
export class EmrouteApp {
  private readonly server: Emroute;
  private readonly appBase: string;
  private slot: Element | null = null;
  private abortController: AbortController | null = null;

  constructor(server: Emroute, options?: EmrouteAppOptions) {
    this.server = server;
    if (options?.basePath) {
      this.appBase = options.basePath.app;
    } else if (typeof document !== 'undefined') {
      const base = document.querySelector('base')?.getAttribute('href');
      this.appBase = base ? base.replace(/\/$/, '') : DEFAULT_BASE_PATH.app;
    } else {
      this.appBase = DEFAULT_BASE_PATH.app;
    }
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
    if (!this.slot || !this.server.htmlRenderer) return;

    const routePath = this.stripAppBase(url.pathname);
    const routeUrl = new URL(routePath + url.search, url.origin);

    try {
      const { content, title, redirect } = await this.server.htmlRenderer.render(routeUrl, signal);

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
  server: Emroute,
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

// ── Boot ──────────────────────────────────────────────────────────────

/** Options for `bootEmrouteApp`. */
export interface BootOptions extends EmrouteAppOptions {
  /** Override the server origin (defaults to `location.origin`). */
  origin?: string;
  /** Context provider — enriches every ComponentContext (pages and widgets). */
  extendContext?: ContextProvider;
}

/**
 * Boot the browser app from runtime manifests.
 *
 * Fetches route tree and widget manifest as JSON, creates lazy module
 * loaders via FetchRuntime, registers widgets for deferred hydration,
 * and wires the Navigation API.
 *
 * Consumer `main.ts` calls this after setting up MarkdownElement renderer,
 * custom elements, etc.
 */
export async function bootEmrouteApp(options?: BootOptions): Promise<EmrouteApp> {
  const origin = options?.origin ?? location.origin;
  const runtime = new FetchRuntime(origin);

  // Fetch route tree
  const routesResponse = await runtime.handle(ROUTES_MANIFEST_PATH);
  if (!routesResponse.ok) {
    throw new Error(`[emroute] Failed to fetch ${ROUTES_MANIFEST_PATH}: ${routesResponse.status}`);
  }
  const routeTree: RouteNode = await routesResponse.json();

  // Fetch widget manifest (optional — app may have no widgets)
  const widgetsResponse = await runtime.handle(WIDGETS_MANIFEST_PATH);
  const widgetEntries: WidgetManifestEntry[] = widgetsResponse.ok
    ? await widgetsResponse.json()
    : [];

  // Fetch element manifest (optional — app may have no custom elements)
  const elementsResponse = await runtime.handle(ELEMENTS_MANIFEST_PATH);
  const elementEntries: ElementManifestEntry[] = elementsResponse.ok
    ? await elementsResponse.json()
    : [];

  // Build lazy module loaders for all route + widget + element modules
  const moduleLoaders = buildLazyLoaders(routeTree, widgetEntries, elementEntries, runtime);

  // Register widgets: lazy in registry (loaded on demand during render),
  // lazy in DOM (module loads on connectedCallback for hydration).
  const widgets = new WidgetRegistry();
  for (const entry of widgetEntries) {
    widgets.addLazy(entry.name, entry.modulePath);
    ComponentElement.registerLazy(entry.name, moduleLoaders[entry.modulePath]!);
  }

  // Register custom elements — import all modules, define when loaded
  for (const entry of elementEntries) {
    const loader = moduleLoaders[entry.modulePath];
    if (loader) {
      loader().then((mod) => {
        const cls = (mod as Record<string, unknown>).default;
        if (typeof cls === 'function' && !customElements.get(entry.tagName)) {
          customElements.define(entry.tagName, cls as CustomElementConstructor);
        }
      }).catch((e) => {
        console.error(`[emroute] Failed to load element ${entry.tagName}:`, e);
      });
    }
  }

  // Wire context provider for both pages (Pipeline) and widgets (ComponentElement)
  if (options?.extendContext) {
    ComponentElement.setContextProvider(options.extendContext);
  }

  // Create Emroute instance (same class as SSR)
  const mdRenderer = MarkdownElement.getConfiguredRenderer();
  const server = await Emroute.create({
    routeTree,
    widgets,
    moduleLoaders,
    ...(mdRenderer ? { markdownRenderer: mdRenderer } : {}),
    ...(options?.extendContext ? { extendContext: options.extendContext } : {}),
  }, runtime);

  return createEmrouteApp(server, options);
}

/**
 * Walk the route tree, widget entries, and element entries to build a map of
 * `path → () => runtime.loadModule(path)` lazy loaders.
 */
function buildLazyLoaders(
  tree: RouteNode,
  widgetEntries: WidgetManifestEntry[],
  elementEntries: ElementManifestEntry[],
  runtime: FetchRuntime,
): Record<string, () => Promise<unknown>> {
  const paths = new Set<string>();

  function walk(node: RouteNode): void {
    const modulePath = node.files?.ts ?? node.files?.js;
    if (modulePath) paths.add(modulePath);
    if (node.redirect) paths.add(node.redirect);
    if (node.errorBoundary) paths.add(node.errorBoundary);
    if (node.children) {
      for (const child of Object.values(node.children)) walk(child);
    }
    if (node.dynamic) walk(node.dynamic.child);
    if (node.wildcard) walk(node.wildcard.child);
  }

  walk(tree);
  for (const entry of widgetEntries) paths.add(entry.modulePath);
  for (const entry of elementEntries) paths.add(entry.modulePath);

  const loaders: Record<string, () => Promise<unknown>> = {};
  for (const path of paths) {
    const absolute = path.startsWith('/') ? path : '/' + path;
    loaders[path] = () => runtime.loadModule(absolute);
  }
  return loaders;
}
