/**
 * Route Resolver
 *
 * Interface for route lookup. Accepts a RouteNode tree (the manifest),
 * provides O(depth) matching, error boundary lookup, and hierarchy traversal.
 *
 * Implementations: RouteTrie (in-memory trie from RouteNode tree).
 */

import type { RouteNode } from '../type/route-tree.type.ts';

/** Result of matching a URL pathname against the route tree. */
export interface ResolvedRoute {
  readonly node: RouteNode;
  readonly pattern: string;
  readonly params: Record<string, string>;
}

/** Route lookup interface. Decouples matching algorithm from the server. */
export interface RouteResolver {
  match(pathname: string): ResolvedRoute | undefined;
  findErrorBoundary(pathname: string): string | undefined;
  findRoute(pattern: string): RouteNode | undefined;
}
