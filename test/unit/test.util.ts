/**
 * Test Utilities
 *
 * Helpers for converting old-style RouteConfig arrays into RouteNode trees
 * for use with RouteTrie in tests.
 */

import type { RouteNode } from '../../src/type/route-tree.type.ts';
import type { RouteConfig, ErrorBoundary } from '../../src/type/route.type.ts';
import { RouteTrie } from '../../src/route/route.trie.ts';
import type { RouteResolver } from '../../src/route/route.resolver.ts';

/**
 * Old-style manifest shape for test compatibility.
 * Tests define routes in this shape, then convert via createResolver().
 */
export interface TestManifest {
  routes?: RouteConfig[];
  errorBoundaries?: ErrorBoundary[];
  statusPages?: Map<number, RouteConfig>;
  errorHandler?: RouteConfig;
  moduleLoaders?: Record<string, () => Promise<unknown>>;
}

/**
 * Convert a flat list of RouteConfig into a RouteNode tree.
 * This bridges old test manifests to the new tree-based format.
 */
export function routesToTree(
  routes: RouteConfig[],
  options?: {
    errorBoundaries?: ErrorBoundary[];
    statusPages?: Map<number, RouteConfig>;
    errorHandler?: RouteConfig;
  },
): RouteNode {
  const root: RouteNode = {};

  // Error handler on root
  if (options?.errorHandler) {
    root.errorBoundary = options.errorHandler.modulePath;
  }

  for (const route of routes) {
    const node = resolveNode(root, route.pattern);

    if (route.type === 'redirect') {
      node.redirect = route.modulePath;
    } else {
      if (route.files) {
        node.files = { ...route.files };
      } else if (route.modulePath) {
        node.files = { ts: route.modulePath };
      } else {
        // Mark as a terminal route even without files (e.g. default page component)
        node.files = {};
      }
    }
  }

  // Status pages are just routes at numeric paths (e.g. /404)
  if (options?.statusPages) {
    for (const [status, route] of options.statusPages) {
      const node = resolveNode(root, `/${status}`);
      if (route.files) {
        node.files = { ...route.files };
      } else if (route.modulePath) {
        node.files = { ts: route.modulePath };
      } else {
        node.files = {};
      }
    }
  }

  // Error boundaries
  if (options?.errorBoundaries) {
    for (const boundary of options.errorBoundaries) {
      const node = resolveNode(root, boundary.pattern);
      node.errorBoundary = boundary.modulePath;
    }
  }

  return root;
}

/**
 * Walk the tree to find or create the node for a given pattern.
 */
function resolveNode(root: RouteNode, pattern: string): RouteNode {
  if (pattern === '/') return root;

  const segments = pattern.slice(1).split('/');
  let node = root;

  for (const segment of segments) {
    if (segment.startsWith(':') && segment.endsWith('*')) {
      const param = segment.slice(1, -1);
      node.wildcard ??= { param, child: {} };
      node = node.wildcard.child;
    } else if (segment.startsWith(':')) {
      const param = segment.slice(1);
      node.dynamic ??= { param, child: {} };
      node = node.dynamic.child;
    } else {
      node.children ??= {};
      node.children[segment] ??= {};
      node = node.children[segment];
    }
  }

  return node;
}

/**
 * Build a RouteTrie from a flat list of RouteConfig.
 * Drop-in replacement for old RoutesManifest in tests.
 */
/** Shorthand for tests: string → URL (defaults to http://test base). */
export function url(path: string): URL {
  return new URL(path, 'http://test');
}

export function createResolver(
  routes: RouteConfig[],
  options?: {
    errorBoundaries?: ErrorBoundary[];
    statusPages?: Map<number, RouteConfig>;
    errorHandler?: RouteConfig;
  },
): RouteResolver {
  return new RouteTrie(routesToTree(routes, options));
}

