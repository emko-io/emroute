import { test, expect, describe } from 'bun:test';
import { resolveTargetNode } from '../../core/util/route-tree.util.ts';
import type { RouteNode } from '../../core/type/route-tree.type.ts';

function emptyNode(): RouteNode {
  return {};
}

describe('resolveTargetNode', () => {
  describe('index at root (isRoot = true)', () => {
    test('returns the node itself', () => {
      const node = emptyNode();
      const result = resolveTargetNode(node, 'index', true);
      expect(result).toBe(node);
    });

    test('does not create wildcard on the node', () => {
      const node = emptyNode();
      resolveTargetNode(node, 'index', true);
      expect(node.wildcard).toBeUndefined();
    });
  });

  describe('index in subdirectory (isRoot = false)', () => {
    test('creates a wildcard catch-all and returns its child', () => {
      const node = emptyNode();
      const result = resolveTargetNode(node, 'index', false);
      expect(node.wildcard).toBeDefined();
      expect(node.wildcard!.param).toBe('rest');
      expect(result).toBe(node.wildcard!.child);
    });

    test('reuses existing wildcard on repeated calls', () => {
      const node = emptyNode();
      const first = resolveTargetNode(node, 'index', false);
      const second = resolveTargetNode(node, 'index', false);
      expect(first).toBe(second);
      expect(first).toBe(node.wildcard!.child);
    });

    test('does not overwrite existing wildcard with different param', () => {
      const node: RouteNode = {
        wildcard: { param: 'slug', child: { files: { html: 'x.html' } } },
      };
      const result = resolveTargetNode(node, 'index', false);
      expect(node.wildcard!.param).toBe('slug');
      expect(result).toBe(node.wildcard!.child);
    });
  });

  describe('dynamic parameter segments ([param])', () => {
    test('creates dynamic child for [id]', () => {
      const node = emptyNode();
      const result = resolveTargetNode(node, '[id]', false);
      expect(node.dynamic).toBeDefined();
      expect(node.dynamic!.param).toBe('id');
      expect(result).toBe(node.dynamic!.child);
    });

    test('creates dynamic child for [slug]', () => {
      const node = emptyNode();
      const result = resolveTargetNode(node, '[slug]', false);
      expect(node.dynamic!.param).toBe('slug');
      expect(result).toBe(node.dynamic!.child);
    });

    test('reuses existing dynamic on repeated calls', () => {
      const node = emptyNode();
      const first = resolveTargetNode(node, '[id]', false);
      const second = resolveTargetNode(node, '[id]', false);
      expect(first).toBe(second);
    });

    test('does not overwrite existing dynamic with different param name', () => {
      const node: RouteNode = {
        dynamic: { param: 'id', child: { files: { js: 'id.js' } } },
      };
      const result = resolveTargetNode(node, '[slug]', false);
      expect(node.dynamic!.param).toBe('id');
      expect(result).toBe(node.dynamic!.child);
    });

    test('works with isRoot = true as well', () => {
      const node = emptyNode();
      const result = resolveTargetNode(node, '[id]', true);
      expect(node.dynamic).toBeDefined();
      expect(node.dynamic!.param).toBe('id');
      expect(result).toBe(node.dynamic!.child);
    });
  });

  describe('static child segments', () => {
    test('creates a static child for "about"', () => {
      const node = emptyNode();
      const result = resolveTargetNode(node, 'about', false);
      expect(node.children).toBeDefined();
      expect(node.children!['about']).toBeDefined();
      expect(result).toBe(node.children!['about']!);
    });

    test('returns existing child on repeated calls', () => {
      const node = emptyNode();
      const first = resolveTargetNode(node, 'about', false);
      const second = resolveTargetNode(node, 'about', false);
      expect(first).toBe(second);
    });

    test('creates separate children for different names', () => {
      const node = emptyNode();
      const about = resolveTargetNode(node, 'about', false);
      const blog = resolveTargetNode(node, 'blog', false);
      expect(about).not.toBe(blog);
      expect(Object.keys(node.children!)).toEqual(['about', 'blog']);
    });

    test('does not overwrite an existing child with data', () => {
      const node: RouteNode = {
        children: { about: { files: { html: 'about.html' } } },
      };
      const result = resolveTargetNode(node, 'about', false);
      expect(result.files).toEqual({ html: 'about.html' });
    });

    test('works with isRoot = true', () => {
      const node = emptyNode();
      const result = resolveTargetNode(node, 'contact', true);
      expect(node.children!['contact']).toBeDefined();
      expect(result).toBe(node.children!['contact']!);
    });
  });

  describe('deeply nested paths', () => {
    test('can build a multi-level tree by chaining calls', () => {
      const root = emptyNode();
      const blog = resolveTargetNode(root, 'blog', false);
      const post = resolveTargetNode(blog, '[slug]', false);
      const comments = resolveTargetNode(post, 'comments', false);

      expect(root.children!['blog']).toBe(blog);
      expect(blog.dynamic!.param).toBe('slug');
      expect(blog.dynamic!.child).toBe(post);
      expect(post.children!['comments']).toBe(comments);
    });

    test('index catch-all at leaf level', () => {
      const root = emptyNode();
      const docs = resolveTargetNode(root, 'docs', false);
      const catchAll = resolveTargetNode(docs, 'index', false);

      expect(docs.wildcard).toBeDefined();
      expect(docs.wildcard!.param).toBe('rest');
      expect(catchAll).toBe(docs.wildcard!.child);
    });
  });

  describe('edge cases', () => {
    test('name that looks like dynamic but missing closing bracket', () => {
      const node = emptyNode();
      const result = resolveTargetNode(node, '[broken', false);
      expect(node.dynamic).toBeUndefined();
      expect(node.children!['[broken']).toBe(result);
    });

    test('name that looks like dynamic but missing opening bracket', () => {
      const node = emptyNode();
      const result = resolveTargetNode(node, 'broken]', false);
      expect(node.dynamic).toBeUndefined();
      expect(node.children!['broken]']).toBe(result);
    });

    test('empty brackets [] creates dynamic with empty param', () => {
      const node = emptyNode();
      const result = resolveTargetNode(node, '[]', false);
      expect(node.dynamic).toBeDefined();
      expect(node.dynamic!.param).toBe('');
      expect(result).toBe(node.dynamic!.child);
    });

    test('name with brackets in the middle is treated as static', () => {
      const node = emptyNode();
      const result = resolveTargetNode(node, 'foo[bar]baz', false);
      expect(node.dynamic).toBeUndefined();
      expect(node.children!['foo[bar]baz']).toBe(result);
    });

    test('returned child node starts empty', () => {
      const node = emptyNode();
      const child = resolveTargetNode(node, 'new-page', false);
      expect(child).toEqual({});
    });
  });
});
