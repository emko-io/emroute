/**
 * Route Tree
 *
 * Serializable tree structure that mirrors the filesystem layout.
 * Replaces the flat array manifest as the canonical route format.
 *
 * Each node corresponds to a URL segment. The tree is JSON-serializable
 * (no Maps, no classes) so it can be written to disk, sent over the wire,
 * or used directly as the in-memory trie for O(depth) route matching.
 */

/** Files associated with a route (companion files discovered alongside the page). */
export interface RouteFiles {
  /** TypeScript module (e.g. "routes/about.page.ts") */
  ts?: string;
  /** JavaScript module — merged module with inlined companions (e.g. "routes/about.page.js") */
  js?: string;
  /** HTML template (e.g. "routes/about.page.html") */
  html?: string;
  /** Markdown content (e.g. "routes/about.page.md") */
  md?: string;
  /** Scoped stylesheet (e.g. "routes/about.page.css") */
  css?: string;
}

/** A single node in the route tree. */
export interface RouteNode {
  /** Route files when this node is a terminal route. */
  files?: RouteFiles;

  /** Error boundary module path scoped to this prefix (from .error.ts). */
  errorBoundary?: string;

  /** Redirect module path (from .redirect.ts). Mutually exclusive with files. */
  redirect?: string;

  /** Static children keyed by URL segment (e.g. "about", "projects"). */
  children?: Record<string, RouteNode>;

  /** Single-segment dynamic param (from [param] directories/files). */
  dynamic?: {
    param: string;
    child: RouteNode;
  };

  /** Catch-all wildcard (from directory index.page.* files). */
  wildcard?: {
    param: string;
    child: RouteNode;
  };
}
