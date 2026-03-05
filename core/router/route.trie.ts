/**
 * Route Trie
 *
 * Default RouteResolver implementation. O(depth) route matching over
 * the RouteNode tree.
 *
 * Walks the RouteNode tree directly — no conversion step, no internal state
 * beyond the tree reference. Each URL segment is matched in order:
 * static → dynamic (:param) → wildcard (:rest*). Backtracking handles
 * cases where a dynamic path leads to a dead end but a wildcard at an
 * ancestor would match.
 *
 * Static segment matching is case-sensitive, per RFC 3986.
 */

import type { RouteNode } from '../type/route-tree.type.ts';
import type { ResolvedRoute, RouteResolver } from './route.resolver.ts';

/**
 * Default RouteResolver implementation.
 * Walks the RouteNode tree directly — no conversion, no Maps.
 */
export class RouteTrie implements RouteResolver {
  constructor(private readonly tree: RouteNode) {}

  match(pathname: string): ResolvedRoute | undefined {
    pathname = this.normalizePath(pathname);
    if (pathname === '/') {
      if (this.tree.files || this.tree.redirect) {
        return { node: this.tree, pattern: '/', params: {} };
      }
      return undefined;
    }
    return this.walk(this.tree, this.splitSegments(pathname), 0, {}, '/');
  }

  findErrorBoundary(pathname: string): string | undefined {
    pathname = this.normalizePath(pathname);
    if (pathname === '/') return this.tree.errorBoundary;
    return this.walkForBoundary(this.tree, this.splitSegments(pathname), 0, this.tree.errorBoundary);
  }

  findRoute(pattern: string): RouteNode | undefined {
    if (pattern === '/') {
      return (this.tree.files || this.tree.redirect) ? this.tree : undefined;
    }
    const segments = this.splitSegments(pattern);
    let node = this.tree;
    for (const segment of segments) {
      let child: RouteNode | undefined;
      if (segment.startsWith(':') && segment.endsWith('*')) {
        child = node.wildcard?.child;
      } else if (segment.startsWith(':')) {
        child = node.dynamic?.child;
      } else {
        child = node.children?.[segment];
      }
      if (!child) return undefined;
      node = child;
    }
    return (node.files || node.redirect) ? node : undefined;
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private safeDecode(segment: string): string {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }

  private splitSegments(pathname: string): string[] {
    return pathname.substring(1).split('/');
  }

  private normalizePath(pathname: string): string {
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    if (!pathname.startsWith('/')) {
      pathname = '/' + pathname;
    }
    return pathname;
  }

  private walk(
    node: RouteNode,
    segments: string[],
    index: number,
    params: Record<string, string>,
    pattern: string,
  ): ResolvedRoute | undefined {
    if (index === segments.length) {
      if (node.files || node.redirect) {
        return { node, pattern, params: { ...params } };
      }
      if (node.wildcard && (node.wildcard.child.files || node.wildcard.child.redirect)) {
        const wp = pattern === '/' ? `/:${node.wildcard.param}*` : `${pattern}/:${node.wildcard.param}*`;
        return {
          node: node.wildcard.child,
          pattern: wp,
          params: { ...params, [node.wildcard.param]: '' },
        };
      }
      return undefined;
    }

    const segment = segments[index]!;

    // Static
    const staticChild = node.children?.[segment];
    if (staticChild) {
      const childPattern = pattern === '/' ? `/${segment}` : `${pattern}/${segment}`;
      const result = this.walk(staticChild, segments, index + 1, params, childPattern);
      if (result) return result;
    }

    // Dynamic
    if (node.dynamic) {
      const { param, child } = node.dynamic;
      params[param] = this.safeDecode(segment);
      const childPattern = pattern === '/' ? `/:${param}` : `${pattern}/:${param}`;
      const result = this.walk(child, segments, index + 1, params, childPattern);
      if (result) return result;
      delete params[param];
    }

    // Wildcard
    if (node.wildcard && (node.wildcard.child.files || node.wildcard.child.redirect)) {
      const { param, child } = node.wildcard;
      let rest = this.safeDecode(segment);
      for (let i = index + 1; i < segments.length; i++) {
        rest += '/' + this.safeDecode(segments[i]!);
      }
      const wp = pattern === '/' ? `/:${param}*` : `${pattern}/:${param}*`;
      return {
        node: child,
        pattern: wp,
        params: { ...params, [param]: rest },
      };
    }

    return undefined;
  }

  private walkForBoundary(
    node: RouteNode,
    segments: string[],
    index: number,
    deepest: string | undefined,
  ): string | undefined {
    if (index === segments.length) {
      return node.errorBoundary ?? deepest;
    }

    const segment = segments[index]!;

    const staticChild = node.children?.[segment];
    if (staticChild) {
      return this.walkForBoundary(staticChild, segments, index + 1, staticChild.errorBoundary ?? deepest);
    }

    if (node.dynamic) {
      return this.walkForBoundary(node.dynamic.child, segments, index + 1, node.dynamic.child.errorBoundary ?? deepest);
    }

    if (node.wildcard) {
      return node.wildcard.child.errorBoundary ?? deepest;
    }

    return deepest;
  }
}
