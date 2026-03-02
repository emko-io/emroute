/**
 * Route Tree
 *
 * Serializable tree structure that mirrors the filesystem layout.
 *
 * Each node corresponds to a URL segment. The tree is JSON-serializable
 * (no Maps, no classes) so it can be written to disk, sent over the wire,
 * or used directly as the in-memory trie for O(depth) route matching.
 */

/** Files associated with a route (companion files discovered alongside the page). */
export interface RouteFiles {
  ts?: string;
  js?: string;
  html?: string;
  md?: string;
  css?: string;
}

/** A single node in the route tree. */
export interface RouteNode {
  files?: RouteFiles;
  errorBoundary?: string;
  redirect?: string;
  children?: Record<string, RouteNode>;
  dynamic?: { param: string; child: RouteNode };
  wildcard?: { param: string; child: RouteNode };
}
