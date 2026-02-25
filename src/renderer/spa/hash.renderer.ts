/**
 * Hash Router
 *
 * Lightweight client-side router for leaf mode mini-apps.
 * Uses hashchange events + RouteCore pattern matching.
 *
 * Routes are defined inline by the consumer, not from the main manifest.
 * Coexists with SpaHtmlRouter in root mode (SPA router skips hash changes).
 */

import type { RouteNode } from '../../type/route-tree.type.ts';
import type { ContextProvider } from '../../component/abstract.component.ts';
import type { RouteResolver } from '../../route/route.resolver.ts';
import { RouteCore } from '../../route/route.core.ts';
import { RouteTrie } from '../../route/route.trie.ts';
import { escapeHtml } from '../../util/html.util.ts';
import { logger } from '../../util/logger.util.ts';
import { BaseRenderer } from './base.renderer.ts';

/**
 * A single hash route definition with a lazy module loader.
 * @experimental
 */
export interface HashRouteConfig {
  /** URLPattern pathname pattern (e.g. '/settings', '/users/:id'). */
  pattern: string;
  /** Lazy loader returning a module with a default PageComponent export. */
  loader: () => Promise<unknown>;
}

/**
 * Options for creating a HashRouter.
 * @experimental
 */
export interface HashRouterOptions {
  /** Inline route definitions. */
  routes: HashRouteConfig[];
  /** CSS selector or element to render into. Defaults to 'hash-slot'. */
  slot?: string | Element;
  /** Enriches every ComponentContext with app-level services. */
  extendContext?: ContextProvider;
}

/**
 * Build a RouteNode tree and module loaders from inline hash route definitions.
 * Each route's pattern is used as the moduleLoaders key so RouteCore.loadModule works.
 */
function buildRouteTree(routes: HashRouteConfig[]): {
  resolver: RouteResolver;
  moduleLoaders: Record<string, () => Promise<unknown>>;
} {
  const root: RouteNode = {};
  const moduleLoaders: Record<string, () => Promise<unknown>> = {};

  for (const r of routes) {
    const segments = r.pattern.split('/').filter(Boolean);
    let node = root;

    for (const segment of segments) {
      if (segment.startsWith(':')) {
        const param = segment.endsWith('*') ? segment.slice(1, -1) : segment.slice(1);
        if (segment.endsWith('*')) {
          node.wildcard ??= { param, child: {} };
          node = node.wildcard.child;
        } else {
          node.dynamic ??= { param, child: {} };
          node = node.dynamic.child;
        }
      } else {
        node.children ??= {};
        node.children[segment] ??= {};
        node = node.children[segment];
      }
    }

    node.files = { ts: r.pattern };
    moduleLoaders[r.pattern] = r.loader;
  }

  return { resolver: new RouteTrie(root), moduleLoaders };
}

/**
 * Hash-based mini-app router for leaf mode pages.
 *
 * Listens to `hashchange`, maps `#/path` → pattern match via RouteCore,
 * renders matched PageComponent into a slot element.
 *
 * @experimental
 */
export class HashRouter extends BaseRenderer {
  private boundHandler: (() => void) | null = null;

  constructor(resolver: RouteResolver, options?: { extendContext?: ContextProvider; moduleLoaders?: Record<string, () => Promise<unknown>> }) {
    const core = new RouteCore(resolver, {
      extendContext: options?.extendContext,
      moduleLoaders: options?.moduleLoaders,
    });
    super(core);
  }

  /**
   * Initialize: find slot, attach hashchange listener, render initial hash.
   */
  async initialize(slot: string | Element = 'hash-slot'): Promise<void> {
    this.slot = typeof slot === 'string' ? document.querySelector(slot) : slot;

    if (!this.slot) {
      console.error(`[HashRouter] Slot not found: ${slot}`);
      return;
    }

    this.boundHandler = () => {
      this.handleHashChange();
    };
    globalThis.addEventListener('hashchange', this.boundHandler);

    // Render initial hash if present
    if (location.hash.length > 1) {
      await this.handleHashChange();
    }
  }

  /**
   * Navigate to a hash path. Triggers hashchange → render.
   */
  navigate(hash: string): void {
    location.hash = hash.startsWith('#') ? hash : '#' + hash;
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
   * Remove event listeners and release references.
   */
  dispose(): void {
    if (this.boundHandler) {
      globalThis.removeEventListener('hashchange', this.boundHandler);
      this.boundHandler = null;
    }
    this.slot = null;
  }

  /**
   * Handle a hashchange event: parse hash, match, render.
   */
  private async handleHashChange(): Promise<void> {
    const path = location.hash.slice(1) || '/';
    const matchUrl = new URL(path, location.origin);

    logger.nav('hash', path, path);

    const controller = new AbortController();
    const { signal } = controller;

    try {
      const matched = this.core.match(matchUrl);

      if (!matched) {
        logger.nav('hash-not-found', path, path);
        if (this.slot) {
          this.slot.setHTMLUnsafe(`
            <h1>Not Found</h1>
            <p>Path: ${escapeHtml(path)}</p>
          `);
        }
        return;
      }

      logger.nav('hash-matched', path, matched.route.pattern, { params: matched.params });

      this.core.currentRoute = matched;
      const routeInfo = this.core.toRouteInfo(matched, path);

      await this.renderPage(routeInfo, matched, signal);

      if (signal.aborted) return;

      this.core.emit({
        type: 'navigate',
        pathname: path,
        params: matched.params,
      });
    } catch (error) {
      if (signal.aborted) return;
      console.error('[HashRouter] Render error:', error);

      this.core.emit({
        type: 'error',
        pathname: path,
        params: {},
        error: error instanceof Error ? error : new Error(String(error)),
      });

      if (this.slot) {
        const message = error instanceof Error ? error.message : String(error);
        this.slot.setHTMLUnsafe(`
          <h1>Error</h1>
          <p>${escapeHtml(message)}</p>
        `);
      }
    }
  }
}

/**
 * Create and initialize a hash router for a leaf-mode mini-app.
 *
 * The router instance is stored on `globalThis.__emroute_hash_router` for
 * programmatic access. Calling twice returns the existing router with a warning.
 *
 * @experimental
 */
export async function createHashRouter(
  options: HashRouterOptions,
): Promise<HashRouter> {
  const g = globalThis as Record<string, unknown>;
  if (g.__emroute_hash_router) {
    console.warn('eMroute: Hash router already initialized.');
    return g.__emroute_hash_router as HashRouter;
  }

  const { resolver, moduleLoaders } = buildRouteTree(options.routes);
  const router = new HashRouter(resolver, {
    extendContext: options.extendContext,
    moduleLoaders,
  });
  await router.initialize(options.slot ?? 'hash-slot');
  g.__emroute_hash_router = router;
  return router;
}
