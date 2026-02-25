/**
 * Route Tree Utilities
 *
 * Pure functions for building a RouteNode tree from filesystem paths.
 */

import type { RouteNode } from '../type/route-tree.type.ts';

/**
 * Resolve the target node for a page or redirect file based on its name.
 *
 * - "index" at root → the node itself (root route)
 * - "index" in a subdirectory → wildcard catch-all on the node
 * - "[param]" → dynamic child
 * - anything else → static child
 */
export function resolveTargetNode(node: RouteNode, name: string, isRoot: boolean): RouteNode {
  if (name === 'index') {
    if (isRoot) return node;
    // Non-root index → wildcard catch-all
    node.wildcard ??= { param: 'rest', child: {} };
    return node.wildcard.child;
  }

  if (name.startsWith('[') && name.endsWith(']')) {
    const param = name.slice(1, -1);
    node.dynamic ??= { param, child: {} };
    return node.dynamic.child;
  }

  // Static segment
  node.children ??= {};
  node.children[name] ??= {};
  return node.children[name];
}
