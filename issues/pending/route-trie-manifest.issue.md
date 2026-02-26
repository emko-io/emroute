# Replace linear route matching with a segment trie

## Problem

The routes manifest is an array (`RouteConfig[]`). `RouteMatcher` compiles a
`URLPattern` per route at startup, then iterates all of them on every request
until one matches. This is O(n) where n = number of routes.

Worse, the manifest is **copied** into each SSR router at startup. When routes
are added at runtime (e.g. via `BunSqliteRuntime`), the routers hold a stale
snapshot and new pages return 404. The only workaround is recreating the entire
server (`createEmrouteServer()`), which re-imports widgets and re-bundles.

The data is a tree at every stage — filesystem directories, URL segments — but
we flatten it into an array and linearly scan it. We destroy structure to
rebuild it worse.

## Approach 1: Segment trie

A trie where each URL segment is a node. Matching walks the tree instead of
scanning an array.

### Node structure

```ts
interface TrieNode {
  /** Route config if this node is a terminal route. */
  route?: RouteConfig;
  /** Error boundary scoped to this prefix. */
  errorBoundary?: ErrorBoundary;
  /** Static children keyed by segment (e.g. 'about', 'projects'). */
  static: Map<string, TrieNode>;
  /** Dynamic child for single-segment params (:id). */
  dynamic?: { param: string; node: TrieNode };
  /** Wildcard child for catch-all params (:rest*). */
  wildcard?: { param: string; node: TrieNode };
}
```

### Matching algorithm

Split the URL into segments, walk the trie. At each node, try children in
order:

1. **Static** — exact segment match in the Map
2. **Dynamic** — single-segment param, captures the value
3. **Wildcard** — consumes all remaining segments

If a dynamic path leads to a dead end deeper in the tree, backtrack and try
the wildcard at the current level.

```
GET /projects/42/tasks

root
  → 'projects' (static)  ✓
    → '42' (dynamic :id)  ✓  capture id=42
      → 'tasks' (static)  ✓  → matched
```

```
GET /projects/42/deep/nested
(routes: /projects/:id/tasks, /projects/:rest*)

root
  → 'projects' (static)  ✓
    → '42' (dynamic :id)  ✓
      → 'deep' — no match → dead end
    → backtrack → wildcard :rest*  ✓  capture rest=42/deep/nested
```

### Complexity

| Operation | Array (current) | Trie |
|-----------|-----------------|------|
| Match URL | O(routes) | O(depth) |
| Find error boundary | O(boundaries) | O(depth) walk up |
| Route hierarchy (layouts) | O(segments × routes) | Free — nodes walked |
| Add a route | Rebuild | O(depth) insert |
| Remove a route | Rebuild | O(depth) delete |

### What falls out for free

- **Route hierarchy**: the nodes you walked through ARE the ancestors — no
  separate `buildRouteHierarchy` needed
- **Error boundaries**: walk up from matched node, first ancestor with a
  boundary wins — no prefix scanning
- **Specificity**: enforced by try order (static → dynamic → wildcard) — no
  sorting
- **Live updates**: insert/remove nodes in the trie — no snapshot, no rebuild,
  no `refresh()` method needed. The runtime owns the trie, routers reference it.

### What it replaces

- `RouteMatcher` class (URLPattern compilation + linear scan)
- `prefixManifest()` (snapshot copy for SSR routers)
- `buildRouteHierarchy()` on `RouteCore`
- `sortRoutesBySpecificity()`
- The stale-manifest problem from `emroute-server-refresh-ssr-routers.issue.md`

### Open questions

- **SPA router**: `SpaHtmlRouter` also uses `RouteMatcher`. Should it share the
  same trie implementation, or does the browser context change things?
- **Serialization**: the trie is a live in-memory structure. The JSON manifest
  (`routes.manifest.json`) is still useful for serialization/transport. The trie
  would be built from it, not replace the JSON format.
- **basePath prefixing**: currently `prefixManifest()` clones the manifest with
  `/html` or `/md` prefixed to patterns. With a trie, basePath can be a
  property of the walker — strip the prefix before walking, no cloning needed.
- **Runtime-specific optimizations**: `BunSqliteRuntime` could potentially do
  `LIKE`-based matching in SQL instead of an in-memory trie. The interface
  should allow this — the trie is the default, not the only implementation.
