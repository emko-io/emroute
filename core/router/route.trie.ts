/**
 * Route Trie
 *
 * Segment-based trie implementing RouteResolver for O(depth) route matching.
 *
 * Each URL segment maps to a trie node. Nodes are tried in order:
 * static → dynamic (:param) → wildcard (:rest*). Backtracking handles
 * cases where a dynamic path leads to a dead end but a wildcard at an
 * ancestor would match.
 *
 * Static segment matching is case-sensitive, per RFC 3986.
 *
 * Accepts a RouteNode tree (the JSON-serializable manifest from Runtime)
 * and converts it to an internal trie with Map-based static children for
 * O(1) segment lookup.
 */

import type { RouteNode } from '../type/route-tree.type.ts';
import type { RouteResolver, ResolvedRoute } from './route.resolver.ts';

/** Internal trie node with Map for O(1) static child lookup. */
interface TrieNode {
  route?: RouteNode;
  pattern?: string;
  errorBoundary?: string;
  static: Map<string, TrieNode>;
  dynamic?: { param: string; node: TrieNode };
  wildcard?: { param: string; node: TrieNode };
}

function createNode(): TrieNode {
  return { static: new Map() };
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function splitSegments(pathname: string): string[] {
  return pathname.substring(1).split('/');
}

function convertNode(source: RouteNode, pattern: string): TrieNode {
  const node = createNode();

  if (source.files || source.redirect) {
    node.route = source;
    node.pattern = pattern;
  }

  if (source.errorBoundary) {
    node.errorBoundary = source.errorBoundary;
  }

  if (source.children) {
    for (const [segment, child] of Object.entries(source.children)) {
      const childPattern = pattern === '/' ? `/${segment}` : `${pattern}/${segment}`;
      node.static.set(segment, convertNode(child, childPattern));
    }
  }

  if (source.dynamic) {
    const { param, child } = source.dynamic;
    const childPattern = pattern === '/' ? `/:${param}` : `${pattern}/:${param}`;
    node.dynamic = { param, node: convertNode(child, childPattern) };
  }

  if (source.wildcard) {
    const { param, child } = source.wildcard;
    const childPattern = pattern === '/' ? `/:${param}*` : `${pattern}/:${param}*`;
    node.wildcard = { param, node: convertNode(child, childPattern) };
  }

  return node;
}

export class RouteTrie implements RouteResolver {
  private readonly root: TrieNode;

  constructor(tree: RouteNode) {
    this.root = convertNode(tree, '/');
  }

  match(pathname: string): ResolvedRoute | undefined {
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    if (!pathname.startsWith('/')) {
      pathname = '/' + pathname;
    }
    if (pathname === '/') {
      if (this.root.route) {
        return { node: this.root.route, pattern: '/', params: {} };
      }
      return undefined;
    }
    const segments = splitSegments(pathname);
    return this.walk(this.root, segments, 0, {});
  }

  findErrorBoundary(pathname: string): string | undefined {
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    if (!pathname.startsWith('/')) {
      pathname = '/' + pathname;
    }
    if (pathname === '/') return this.root.errorBoundary;
    const segments = splitSegments(pathname);
    return this.walkForBoundary(this.root, segments, 0, this.root.errorBoundary);
  }

  findRoute(pattern: string): RouteNode | undefined {
    if (pattern === '/') {
      return this.root.route;
    }
    const segments = splitSegments(pattern);
    let node = this.root;
    for (const segment of segments) {
      let child: TrieNode | undefined;
      if (segment.startsWith(':') && segment.endsWith('*')) {
        child = node.wildcard?.node;
      } else if (segment.startsWith(':')) {
        child = node.dynamic?.node;
      } else {
        child = node.static.get(segment);
      }
      if (!child) return undefined;
      node = child;
    }
    return node.route;
  }

  private walk(
    node: TrieNode,
    segments: string[],
    index: number,
    params: Record<string, string>,
  ): ResolvedRoute | undefined {
    if (index === segments.length) {
      if (node.route) {
        return { node: node.route, pattern: node.pattern!, params: { ...params } };
      }
      if (node.wildcard?.node.route) {
        return {
          node: node.wildcard.node.route,
          pattern: node.wildcard.node.pattern!,
          params: { ...params, [node.wildcard.param]: '' },
        };
      }
      return undefined;
    }

    const segment = segments[index];

    const staticChild = node.static.get(segment);
    if (staticChild) {
      const result = this.walk(staticChild, segments, index + 1, params);
      if (result) return result;
    }

    if (node.dynamic) {
      const { param, node: dynamicNode } = node.dynamic;
      params[param] = safeDecode(segment);
      const result = this.walk(dynamicNode, segments, index + 1, params);
      if (result) return result;
      delete params[param];
    }

    if (node.wildcard?.node.route) {
      const { param, node: wildcardNode } = node.wildcard;
      let rest = safeDecode(segments[index]);
      for (let i = index + 1; i < segments.length; i++) {
        rest += '/' + safeDecode(segments[i]);
      }
      return {
        node: wildcardNode.route!,
        pattern: wildcardNode.pattern!,
        params: { ...params, [param]: rest },
      };
    }

    return undefined;
  }

  private walkForBoundary(
    node: TrieNode,
    segments: string[],
    index: number,
    deepest: string | undefined,
  ): string | undefined {
    if (index === segments.length) {
      return node.errorBoundary ?? deepest;
    }

    const segment = segments[index];

    const staticChild = node.static.get(segment);
    if (staticChild) {
      return this.walkForBoundary(staticChild, segments, index + 1, staticChild.errorBoundary ?? deepest);
    }

    if (node.dynamic) {
      return this.walkForBoundary(node.dynamic.node, segments, index + 1, node.dynamic.node.errorBoundary ?? deepest);
    }

    if (node.wildcard) {
      return node.wildcard.node.errorBoundary ?? deepest;
    }

    return deepest;
  }
}
