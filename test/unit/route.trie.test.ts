import { test, expect, describe } from 'bun:test';
import { RouteTrie } from '../../src/route/route.trie.ts';
import type { RouteConfig } from '../../src/type/route.type.ts';
import { routesToTree, createResolver } from './test.util.ts';

function route(pattern: string, modulePath = pattern + '.page.ts'): RouteConfig {
  return { pattern, type: 'page', modulePath };
}

function trie(routes: RouteConfig[]) {
  return new RouteTrie(routesToTree(routes));
}

describe('Route Trie', () => {
  describe('static routes', () => {
    test('matches root /', () => {
      const t = trie([route('/')]);
      const result = t.match('/');
      expect(result).not.toBeUndefined();
      expect(result!.pattern).toBe('/');
      expect(result!.params).toEqual({});
    });

    test('matches /about', () => {
      const t = trie([route('/about')]);
      const result = t.match('/about');
      expect(result).not.toBeUndefined();
      expect(result!.pattern).toBe('/about');
    });

    test('matches deep static /a/b/c', () => {
      const t = trie([route('/a/b/c')]);
      const result = t.match('/a/b/c');
      expect(result).not.toBeUndefined();
      expect(result!.pattern).toBe('/a/b/c');
    });

    test('returns undefined for unregistered path', () => {
      const t = trie([route('/about')]);
      expect(t.match('/missing')).toBeUndefined();
    });

    test('strips trailing slash', () => {
      const t = trie([route('/about')]);
      const result = t.match('/about/');
      expect(result).not.toBeUndefined();
      expect(result!.pattern).toBe('/about');
    });

    test('multiple static routes', () => {
      const t = trie([route('/'), route('/about'), route('/contact')]);
      expect(t.match('/')!.pattern).toBe('/');
      expect(t.match('/about')!.pattern).toBe('/about');
      expect(t.match('/contact')!.pattern).toBe('/contact');
    });
  });

  describe('dynamic routes', () => {
    test('matches single dynamic segment', () => {
      const t = trie([route('/projects/:id')]);
      const result = t.match('/projects/42');
      expect(result).not.toBeUndefined();
      expect(result!.pattern).toBe('/projects/:id');
      expect(result!.params).toEqual({ id: '42' });
    });

    test('matches multiple dynamic segments', () => {
      const t = trie([route('/users/:userId/posts/:postId')]);
      const result = t.match('/users/alice/posts/99');
      expect(result).not.toBeUndefined();
      expect(result!.params).toEqual({ userId: 'alice', postId: '99' });
    });

    test('dynamic after static', () => {
      const t = trie([route('/projects/:id/tasks')]);
      const result = t.match('/projects/7/tasks');
      expect(result).not.toBeUndefined();
      expect(result!.params).toEqual({ id: '7' });
      expect(result!.pattern).toBe('/projects/:id/tasks');
    });

    test('decodes URI components in params', () => {
      const t = trie([route('/tags/:name')]);
      const result = t.match('/tags/hello%20world');
      expect(result).not.toBeUndefined();
      expect(result!.params).toEqual({ name: 'hello world' });
    });
  });

  describe('wildcard routes', () => {
    test('matches catch-all', () => {
      const t = trie([route('/docs/:rest*')]);
      const result = t.match('/docs/a/b/c');
      expect(result).not.toBeUndefined();
      expect(result!.pattern).toBe('/docs/:rest*');
      expect(result!.params).toEqual({ rest: 'a/b/c' });
    });

    test('catch-all matches single segment', () => {
      const t = trie([route('/docs/:rest*')]);
      const result = t.match('/docs/intro');
      expect(result).not.toBeUndefined();
      expect(result!.params).toEqual({ rest: 'intro' });
    });

    test('catch-all matches zero segments', () => {
      const t = trie([route('/docs/:rest*')]);
      const result = t.match('/docs');
      expect(result).not.toBeUndefined();
      expect(result!.params).toEqual({ rest: '' });
    });

    test('decodes URI components in wildcard params', () => {
      const t = trie([route('/docs/:rest*')]);
      const result = t.match('/docs/hello%20world/sub%20path');
      expect(result).not.toBeUndefined();
      expect(result!.params).toEqual({ rest: 'hello world/sub path' });
    });
  });

  describe('specificity: static > dynamic > wildcard', () => {
    test('static wins over dynamic', () => {
      const t = trie([route('/projects/new'), route('/projects/:id')]);
      const result = t.match('/projects/new');
      expect(result!.pattern).toBe('/projects/new');
    });

    test('dynamic wins over wildcard', () => {
      const t = trie([route('/projects/:id'), route('/projects/:rest*')]);
      const result = t.match('/projects/42');
      expect(result!.pattern).toBe('/projects/:id');
    });

    test('wildcard catches what dynamic cannot', () => {
      const t = trie([
        route('/projects/:id/tasks'),
        route('/projects/:rest*'),
      ]);

      const tasks = t.match('/projects/42/tasks');
      expect(tasks!.pattern).toBe('/projects/:id/tasks');

      const deep = t.match('/projects/42/unknown/path');
      expect(deep!.pattern).toBe('/projects/:rest*');
      expect(deep!.params).toEqual({ rest: '42/unknown/path' });
    });
  });

  describe('backtracking', () => {
    test('backtracks from dynamic dead end to wildcard', () => {
      const t = trie([
        route('/files/:id/edit'),
        route('/files/:rest*'),
      ]);

      expect(t.match('/files/1/edit')!.pattern).toBe('/files/:id/edit');

      const result = t.match('/files/1/download');
      expect(result!.pattern).toBe('/files/:rest*');
      expect(result!.params).toEqual({ rest: '1/download' });
    });

    test('backtracks from static dead end to dynamic', () => {
      const t = trie([
        route('/a/b/c'),
        route('/a/:x/d'),
      ]);

      expect(t.match('/a/b/c')!.pattern).toBe('/a/b/c');

      const result = t.match('/a/b/d');
      expect(result!.pattern).toBe('/a/:x/d');
      expect(result!.params).toEqual({ x: 'b' });
    });

    test('backtracks through static → dynamic → wildcard chain', () => {
      const t = trie([
        route('/a/b/c/d'),    // static path
        route('/a/:x/y/z'),   // dynamic path
        route('/a/:rest*'),   // wildcard fallback
      ]);

      expect(t.match('/a/b/c/d')!.pattern).toBe('/a/b/c/d');
      expect(t.match('/a/b/y/z')!.pattern).toBe('/a/:x/y/z');

      const result = t.match('/a/b/q/r');
      expect(result!.pattern).toBe('/a/:rest*');
      expect(result!.params).toEqual({ rest: 'b/q/r' });
    });

    test('params do not leak across backtracking branches', () => {
      const t = trie([
        route('/a/:x/b/:y'),
        route('/a/:rest*'),
      ]);

      const result = t.match('/a/1/c/2');
      expect(result!.pattern).toBe('/a/:rest*');
      expect(result!.params).toEqual({ rest: '1/c/2' });
    });
  });

  describe('error boundaries', () => {
    test('finds root error boundary', () => {
      const resolver = createResolver([route('/')], {
        errorHandler: { pattern: '/', type: 'page', modulePath: '/error.ts' },
      });
      const boundary = resolver.findErrorBoundary('/anything');
      expect(boundary).not.toBeUndefined();
      expect(boundary).toBe('/error.ts');
    });

    test('finds most specific error boundary', () => {
      const resolver = createResolver([route('/'), route('/admin/users')], {
        errorBoundaries: [
          { pattern: '/', modulePath: '/root-error.ts' },
          { pattern: '/admin', modulePath: '/admin-error.ts' },
        ],
      });

      expect(resolver.findErrorBoundary('/about')).toBe('/root-error.ts');
      expect(resolver.findErrorBoundary('/admin/users')).toBe('/admin-error.ts');
      expect(resolver.findErrorBoundary('/admin/settings')).toBe('/admin-error.ts');
    });

    test('returns undefined when no boundary exists', () => {
      const t = trie([route('/')]);
      expect(t.findErrorBoundary('/anything')).toBeUndefined();
    });

    test('error boundary on dynamic pattern', () => {
      const resolver = createResolver([route('/users/:id')], {
        errorBoundaries: [{ pattern: '/users/:id', modulePath: '/user-error.ts' }],
      });
      const boundary = resolver.findErrorBoundary('/users/42');
      expect(boundary).not.toBeUndefined();
      expect(boundary).toBe('/user-error.ts');
    });

    test('error boundary on wildcard pattern', () => {
      const resolver = createResolver([route('/docs/:rest*')], {
        errorBoundaries: [{ pattern: '/docs/:rest*', modulePath: '/docs-error.ts' }],
      });
      const boundary = resolver.findErrorBoundary('/docs/a/b/c');
      expect(boundary).not.toBeUndefined();
      expect(boundary).toBe('/docs-error.ts');
    });

    test('wildcard error boundary does not match sibling paths', () => {
      const resolver = createResolver([route('/docs/:rest*'), route('/about')], {
        errorBoundaries: [{ pattern: '/docs/:rest*', modulePath: '/docs-error.ts' }],
      });
      expect(resolver.findErrorBoundary('/about')).toBeUndefined();
    });

    test('follows static branch when static child exists', () => {
      const resolver = createResolver([route('/a/b'), route('/a/:x')], {
        errorBoundaries: [{ pattern: '/a/:x', modulePath: '/dynamic-error.ts' }],
      });
      const boundary = resolver.findErrorBoundary('/a/b');
      expect(boundary).toBeUndefined();
    });

    test('follows dynamic branch when no static child', () => {
      const resolver = createResolver([route('/a/:x')], {
        errorBoundaries: [{ pattern: '/a/:x', modulePath: '/dynamic-error.ts' }],
      });
      const boundary = resolver.findErrorBoundary('/a/anything');
      expect(boundary).not.toBeUndefined();
      expect(boundary).toBe('/dynamic-error.ts');
    });
  });

  describe('findRoute', () => {
    test('finds route by pattern', () => {
      const t = trie([route('/'), route('/about'), route('/projects/:id')]);
      expect(t.findRoute('/')).toBeDefined();
      expect(t.findRoute('/about')).toBeDefined();
      expect(t.findRoute('/projects/:id')).toBeDefined();
      expect(t.findRoute('/missing')).toBeUndefined();
    });

    test('finds wildcard route by pattern', () => {
      const t = trie([route('/docs/:rest*')]);
      expect(t.findRoute('/docs/:rest*')).toBeDefined();
    });
  });

  describe('encoded segments', () => {
    test('encoded static segment matches encoded pattern', () => {
      const t = trie([route('/caf%C3%A9')]);
      const result = t.match('/caf%C3%A9');
      expect(result).not.toBeUndefined();
    });

    test('encoded static segment does not match unencoded pattern', () => {
      const t = trie([route('/café')]);
      expect(t.match('/caf%C3%A9')).toBeUndefined();
    });

    test('dynamic segment decodes value', () => {
      const t = trie([route('/search/:query')]);
      const result = t.match('/search/hello%20world%26more');
      expect(result!.params).toEqual({ query: 'hello world&more' });
    });

    test('malformed percent-encoding does not throw', () => {
      const t = trie([route('/tags/:name')]);
      const result = t.match('/tags/%ZZ');
      expect(result).not.toBeUndefined();
      expect(result!.params).toEqual({ name: '%ZZ' });
    });

    test('malformed percent-encoding in wildcard does not throw', () => {
      const t = trie([route('/docs/:rest*')]);
      const result = t.match('/docs/%ZZ/more');
      expect(result).not.toBeUndefined();
      expect(result!.params).toEqual({ rest: '%ZZ/more' });
    });
  });

  describe('multiple wildcards at different depths', () => {
    test('deeper wildcard wins over shallower', () => {
      const t = trie([
        route('/a/:rest*'),
        route('/a/b/:rest*'),
      ]);

      const result = t.match('/a/b/c/d');
      expect(result!.pattern).toBe('/a/b/:rest*');
      expect(result!.params).toEqual({ rest: 'c/d' });

      const shallow = t.match('/a/x');
      expect(shallow!.pattern).toBe('/a/:rest*');
      expect(shallow!.params).toEqual({ rest: 'x' });
    });
  });

  describe('doc/05-nesting.md promises', () => {
    test('exact route + catch-all directory coexistence', () => {
      const t = trie([
        route('/docs'),
        route('/docs/:rest*'),
      ]);

      expect(t.match('/docs')!.pattern).toBe('/docs');
      expect(t.match('/docs/getting-started')!.pattern).toBe('/docs/:rest*');
      expect(t.match('/docs/getting-started')!.params).toEqual({ rest: 'getting-started' });
      expect(t.match('/docs/api/components')!.pattern).toBe('/docs/:rest*');
      expect(t.match('/docs/api/components')!.params).toEqual({ rest: 'api/components' });
    });

    test('dynamic segment vs catch-all (specific wins for single segment)', () => {
      const t = trie([
        route('/users'),
        route('/users/:id'),
        route('/users/:rest*'),
      ]);

      expect(t.match('/users')!.pattern).toBe('/users');
      expect(t.match('/users/42')!.pattern).toBe('/users/:id');
      expect(t.match('/users/42')!.params).toEqual({ id: '42' });
      expect(t.match('/users/42/posts')!.pattern).toBe('/users/:rest*');
      expect(t.match('/users/42/posts')!.params).toEqual({ rest: '42/posts' });
      expect(t.match('/users/42/posts/drafts')!.pattern).toBe('/users/:rest*');
      expect(t.match('/users/42/posts/drafts')!.params).toEqual({ rest: '42/posts/drafts' });
    });

    test('static overrides in a catch-all', () => {
      const t = trie([
        route('/blog'),
        route('/blog/:rest*'),
        route('/blog/featured'),
        route('/blog/archive'),
      ]);

      expect(t.match('/blog')!.pattern).toBe('/blog');
      expect(t.match('/blog/featured')!.pattern).toBe('/blog/featured');
      expect(t.match('/blog/archive')!.pattern).toBe('/blog/archive');
      expect(t.match('/blog/my-post')!.pattern).toBe('/blog/:rest*');
      expect(t.match('/blog/my-post')!.params).toEqual({ rest: 'my-post' });
      expect(t.match('/blog/2024/01/hi')!.pattern).toBe('/blog/:rest*');
      expect(t.match('/blog/2024/01/hi')!.params).toEqual({ rest: '2024/01/hi' });
    });
  });

  describe('edge cases', () => {
    test('empty manifest', () => {
      const t = trie([]);
      expect(t.match('/')).toBeUndefined();
      expect(t.match('/anything')).toBeUndefined();
    });

    test('no match returns undefined', () => {
      const t = trie([route('/a'), route('/b')]);
      expect(t.match('/c')).toBeUndefined();
    });

    test('partial path does not match', () => {
      const t = trie([route('/a/b/c')]);
      expect(t.match('/a')).toBeUndefined();
      expect(t.match('/a/b')).toBeUndefined();
    });

    test('extra segments do not match static route', () => {
      const t = trie([route('/about')]);
      expect(t.match('/about/extra')).toBeUndefined();
    });

    test('pathname without leading slash', () => {
      const t = trie([route('/about')]);
      const result = t.match('about');
      expect(result).not.toBeUndefined();
      expect(result!.pattern).toBe('/about');
    });
  });
});
