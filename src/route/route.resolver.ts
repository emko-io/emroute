/**
 * Route Resolver
 *
 * Interface for route lookup. Accepts a RouteNode tree (the manifest),
 * provides O(depth) matching, error boundary lookup, and hierarchy traversal.
 *
 * Implementations: RouteTrie (in-memory trie from RouteNode tree).
 * RouteCore depends on this interface, not on the algorithm.
 */

import type { RouteNode } from '../type/route-tree.type.ts';

/** Result of matching a URL pathname against the route tree. */
export interface ResolvedRoute {
  /** The matched route node. */
  readonly node: RouteNode;
  /** URL pattern reconstructed from the tree path (e.g. "/projects/:id"). */
  readonly pattern: string;
  /** Extracted URL parameters (e.g. { id: "42" }). */
  readonly params: Record<string, string>;
}

/** Route lookup interface. Decouples matching algorithm from the router. */
export interface RouteResolver {
  /** Match a URL pathname to a route. */
  match(pathname: string): ResolvedRoute | undefined;

  /** Find the most specific error boundary for a pathname. */
  findErrorBoundary(pathname: string): string | undefined;

  /** Look up a route node by its exact pattern (e.g. "/projects/:id"). */
  findRoute(pattern: string): RouteNode | undefined;
}
