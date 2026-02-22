/**
 * Unit tests for RouteCore
 *
 * Tests cover:
 * - Route matching against patterns
 * - Parameter extraction from URLs
 * - Parent-child relationships
 * - Catch-all route matching (index files)
 * - Dynamic segment matching ([id])
 * - Specificity ordering
 * - Context provider integration
 * - Event emission
 * - Module loading and caching
 * - Widget file loading
 */

import { test, expect, describe } from 'bun:test';
import {
  assertSafeRedirect,
  DEFAULT_BASE_PATH,
  DEFAULT_ROOT_ROUTE,
  prefixManifest,
  RouteCore,
} from '../../src/route/route.core.ts';
import type { RouteConfig, RouteInfo, RoutesManifest } from '../../src/type/route.type.ts';
import type { ComponentContext } from '../../src/component/abstract.component.ts';

/**
 * Helper to create a minimal routes manifest for testing
 */
function createTestManifest(
  routes: RouteConfig[] = [],
): RoutesManifest {
  return {
    routes,
    errorBoundaries: [],
    statusPages: new Map(),
    moduleLoaders: {
      'test-loader': () => Promise.resolve({ test: true }),
    },
  };
}

/**
 * Helper to create a route config
 */
function createRoute(
  pattern: string,
  modulePath: string = 'test-module',
  parent?: string,
): RouteConfig {
  return {
    pattern,
    type: 'page',
    modulePath,
    parent,
  };
}

describe('RouteCore - basePath matching', () => {
  test('matches routes with prefixed manifest', () => {
    const bare = createTestManifest([createRoute('/about')]);
    const manifest = prefixManifest(bare, '/html');
    const core = new RouteCore(manifest, { basePath: '/html' });
    const matched = core.match('/html/about');
    expect(matched).toBeDefined();
    expect(matched.route.pattern).toEqual('/html/about');
  });

  test('root fallback uses basePath', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest, { basePath: '/html' });
    const matched = core.match('/html');
    expect(matched).toBeDefined();
    expect(matched.route.pattern).toEqual('/html');
    expect(matched.route.modulePath).toEqual('__default_root__');
  });

  test('root fallback handles trailing slash', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest, { basePath: '/html' });
    const matched = core.match('/html/');
    expect(matched).toBeDefined();
    expect(matched.route.pattern).toEqual('/html');
  });

  test('no match for paths outside basePath', () => {
    const bare = createTestManifest([createRoute('/about')]);
    const manifest = prefixManifest(bare, '/html');
    const core = new RouteCore(manifest, { basePath: '/html' });
    const matched = core.match('/about');
    expect(matched).toEqual(undefined);
  });

  test('works without basePath (backward compatible)', () => {
    const manifest = createTestManifest([createRoute('/about')]);
    const core = new RouteCore(manifest);
    const matched = core.match('/about');
    expect(matched).toBeDefined();
    expect(matched.route.pattern).toEqual('/about');
  });
});

describe('RouteCore - buildRouteHierarchy with basePath', () => {
  test('root returns basePath', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest, { basePath: '/html' });
    expect(core.buildRouteHierarchy('/html')).toEqual(['/html']);
  });

  test('root with trailing slash', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest, { basePath: '/html' });
    expect(core.buildRouteHierarchy('/html/')).toEqual(['/html']);
  });

  test('nested route', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest, { basePath: '/html' });
    expect(
      core.buildRouteHierarchy('/html/projects/:id'),
    ).toEqual(
      ['/html', '/html/projects', '/html/projects/:id'],
    );
  });

  test('without basePath (backward compatible)', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest);
    expect(
      core.buildRouteHierarchy('/projects/:id'),
    ).toEqual(
      ['/', '/projects', '/projects/:id'],
    );
  });
});

describe('RouteCore - normalizeUrl with basePath', () => {
  test('strips trailing slash on basePath root', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest, { basePath: '/html' });
    expect(core.normalizeUrl('/html/')).toEqual('/html');
  });

  test('strips trailing slash on non-root paths', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest, { basePath: '/html' });
    expect(core.normalizeUrl('/html/about/')).toEqual('/html/about');
  });
});

describe('RouteCore - assertSafeRedirect', () => {
  test('allows http URLs', () => {
    assertSafeRedirect('http://example.com');
  });

  test('allows https URLs', () => {
    assertSafeRedirect('https://example.com');
  });

  test('allows relative URLs', () => {
    assertSafeRedirect('/about');
    assertSafeRedirect('../home');
  });

  test('allows root-relative URLs', () => {
    assertSafeRedirect('/');
  });

  test('throws on javascript protocol', () => {
    try {
      assertSafeRedirect('javascript:alert("xss")');
      throw new Error('Should have thrown');
    } catch (e) {
      expect(
        (e as Error).message.includes('Unsafe redirect URL'),
      ).toEqual(true);
    }
  });

  test('throws on data protocol', () => {
    try {
      assertSafeRedirect('data:text/html,<script>alert("xss")</script>');
      throw new Error('Should have thrown');
    } catch (e) {
      expect(
        (e as Error).message.includes('Unsafe redirect URL'),
      ).toEqual(true);
    }
  });

  test('throws on vbscript protocol', () => {
    try {
      assertSafeRedirect('vbscript:msgbox("xss")');
      throw new Error('Should have thrown');
    } catch (e) {
      expect(
        (e as Error).message.includes('Unsafe redirect URL'),
      ).toEqual(true);
    }
  });

  test('is case-insensitive for protocols', () => {
    try {
      assertSafeRedirect('JavaScript:alert("xss")');
      throw new Error('Should have thrown');
    } catch (e) {
      expect(
        (e as Error).message.includes('Unsafe redirect URL'),
      ).toEqual(true);
    }
  });

  test('handles whitespace before protocol', () => {
    try {
      assertSafeRedirect('  javascript:alert("xss")');
      throw new Error('Should have thrown');
    } catch (e) {
      expect(
        (e as Error).message.includes('Unsafe redirect URL'),
      ).toEqual(true);
    }
  });
});

describe('RouteCore - constructor and initialization', () => {
  test('creates router with manifest', () => {
    const manifest = createTestManifest();
    const router = new RouteCore(manifest);

    expect(router.matcher).toBeDefined();
    expect(router.contextProvider).toEqual(undefined);
  });

  test('registers context provider', () => {
    const manifest = createTestManifest();
    const provider = (ctx: ComponentContext) => ({
      ...ctx,
      custom: 'value',
    });

    const router = new RouteCore(manifest, { extendContext: provider });

    expect(router.contextProvider).toEqual(provider);
  });

  test('sets fileReader from options', () => {
    const manifest = createTestManifest();
    const reader = (_path: string) => Promise.resolve('');
    const router = new RouteCore(manifest, { fileReader: reader });

    expect(router).toBeDefined();
  });

  test('defaults fileReader to fetch-based', () => {
    const manifest = createTestManifest();
    const router = new RouteCore(manifest);

    expect(router).toBeDefined();
  });

  test('initializes currentRoute as null', () => {
    const manifest = createTestManifest();
    const router = new RouteCore(manifest);

    expect(router.currentRoute).toEqual(null);
  });
});

describe('RouteCore - route matching', () => {
  test('matches static routes', () => {
    const routes = [createRoute('/about')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/about');

    expect(matched).toBeDefined();
    expect(matched?.route.pattern).toEqual('/about');
  });

  test('matches dynamic segment routes', () => {
    const routes = [createRoute('/projects/:id')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/projects/123');

    expect(matched).toBeDefined();
    expect(matched?.route.pattern).toEqual('/projects/:id');
    expect(matched?.params.id).toEqual('123');
  });

  test('matches nested dynamic routes', () => {
    const routes = [createRoute('/projects/:projectId/tasks/:taskId')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/projects/42/tasks/99');

    expect(matched).toBeDefined();
    expect(matched?.params.projectId).toEqual('42');
    expect(matched?.params.taskId).toEqual('99');
  });

  test('returns undefined for unmatched routes', () => {
    const routes = [createRoute('/about')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/nonexistent');

    expect(matched).toEqual(undefined);
  });

  test('falls back to default root route for /', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const matched = router.match('/');

    expect(matched).toBeDefined();
    expect(matched?.route.modulePath).toEqual(DEFAULT_ROOT_ROUTE.modulePath);
    expect(matched?.route.pattern).toEqual('/');
  });

  test('accepts URL objects', () => {
    const routes = [createRoute('/about')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const url = new URL('http://localhost/about');
    const matched = router.match(url);

    expect(matched).toBeDefined();
    expect(matched?.route.pattern).toEqual('/about');
  });

  test('preserves search params in match result', () => {
    const routes = [createRoute('/search')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/search?q=test&limit=10');

    expect(matched?.searchParams).toBeDefined();
    expect(matched?.searchParams?.get('q')).toEqual('test');
    expect(matched?.searchParams?.get('limit')).toEqual('10');
  });
});

describe('RouteCore - parameter extraction', () => {
  test('extracts single parameter', () => {
    const routes = [createRoute('/users/:id')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/users/john-doe');

    expect(matched?.params.id).toEqual('john-doe');
  });

  test('extracts multiple parameters', () => {
    const routes = [createRoute('/projects/:projectId/tasks/:taskId/comments/:commentId')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/projects/proj-1/tasks/task-2/comments/comment-3');

    expect(matched?.params.projectId).toEqual('proj-1');
    expect(matched?.params.taskId).toEqual('task-2');
    expect(matched?.params.commentId).toEqual('comment-3');
  });

  test('handles numeric parameters', () => {
    const routes = [createRoute('/posts/:id')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/posts/12345');

    expect(matched?.params.id).toEqual('12345');
  });

  test('handles slug parameters with hyphens', () => {
    const routes = [createRoute('/articles/:slug')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/articles/my-awesome-article');

    expect(matched?.params.slug).toEqual('my-awesome-article');
  });

  test('getParams returns current route params', () => {
    const routes = [createRoute('/users/:id')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    router.currentRoute = router.match('/users/123')!;
    const params = router.getParams();

    expect(params.id).toEqual('123');
  });

  test('getParams returns empty object when no current route', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const params = router.getParams();

    expect(params).toEqual({});
  });
});

describe('RouteCore - parent-child relationships', () => {
  test('tracks parent route in config', () => {
    const routes = [
      createRoute('/projects', 'projects'),
      createRoute('/projects/:id', 'project-detail', '/projects'),
      createRoute('/projects/:id/tasks', 'project-tasks', '/projects/:id'),
    ];
    const manifest = createTestManifest(routes);
    const _router = new RouteCore(manifest);

    expect(routes[1].parent).toEqual('/projects');
    expect(routes[2].parent).toEqual('/projects/:id');
  });

  test('matches child routes correctly', () => {
    const routes = [
      createRoute('/projects', 'projects'),
      createRoute('/projects/:id', 'project-detail', '/projects'),
    ];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/projects/123');

    expect(matched?.route.pattern).toEqual('/projects/:id');
    expect(matched?.route.parent).toEqual('/projects');
  });
});

describe('RouteCore - route hierarchy building', () => {
  test('builds hierarchy for root', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const hierarchy = router.buildRouteHierarchy('/');

    expect(hierarchy).toEqual(['/']);
  });

  test('builds hierarchy for single segment', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const hierarchy = router.buildRouteHierarchy('/about');

    expect(hierarchy).toEqual(['/', '/about']);
  });

  test('builds hierarchy for multiple segments', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const hierarchy = router.buildRouteHierarchy('/projects/123/tasks');

    expect(hierarchy).toEqual(['/', '/projects', '/projects/123', '/projects/123/tasks']);
  });

  test('handles trailing segments correctly', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const hierarchy = router.buildRouteHierarchy('/a/b/c/d/e');

    expect(hierarchy).toEqual([
      '/',
      '/a',
      '/a/b',
      '/a/b/c',
      '/a/b/c/d',
      '/a/b/c/d/e',
    ]);
  });
});

describe('RouteCore - URL normalization', () => {
  test('removes trailing slash', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const normalized = router.normalizeUrl('/about/');

    expect(normalized).toEqual('/about');
  });

  test('keeps root slash', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const normalized = router.normalizeUrl('/');

    expect(normalized).toEqual('/');
  });

  test('keeps URLs without trailing slash', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const normalized = router.normalizeUrl('/projects/123');

    expect(normalized).toEqual('/projects/123');
  });

  test('handles nested paths with trailing slash', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const normalized = router.normalizeUrl('/projects/123/tasks/');

    expect(normalized).toEqual('/projects/123/tasks');
  });
});

describe('RouteCore - path conversion', () => {
  test('converts relative path to absolute', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const absolute = router.toAbsolutePath('about');

    expect(absolute).toEqual('/about');
  });

  test('keeps absolute paths unchanged', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const absolute = router.toAbsolutePath('/about');

    expect(absolute).toEqual('/about');
  });

  test('converts nested relative paths', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const absolute = router.toAbsolutePath('projects/123/tasks');

    expect(absolute).toEqual('/projects/123/tasks');
  });
});

describe('RouteCore - route info building', () => {
  test('builds route info from matched route', () => {
    const routes = [createRoute('/projects/:id')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/projects/123')!;
    const info = router.toRouteInfo(matched, '/projects/123');

    expect(info.pathname).toEqual('/projects/123');
    expect(info.pattern).toEqual('/projects/:id');
    expect(info.params.id).toEqual('123');
  });

  test('includes search params in route info', () => {
    const routes = [createRoute('/search')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/search?q=test')!;
    const info = router.toRouteInfo(matched, '/search');

    expect(info.searchParams.get('q')).toEqual('test');
  });

  test('provides default empty search params if not set', () => {
    const routes = [createRoute('/about')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = { route: routes[0], params: {} } as {
      route: typeof routes[0];
      params: Record<string, string>;
    };
    const info = router.toRouteInfo(matched, '/about');

    expect(info.searchParams).toBeDefined();
    expect(info.searchParams.toString()).toEqual('');
  });
});

describe('RouteCore - module loading and caching', () => {
  test('caches modules', async () => {
    const manifest = createTestManifest();
    const router = new RouteCore(manifest);

    const module1 = await router.loadModule('test-loader');
    const module2 = await router.loadModule('test-loader');

    expect(module1).toEqual(module2);
  });

  test('loads module from moduleLoaders', async () => {
    const manifest = createTestManifest();
    const router = new RouteCore(manifest);

    const module = await router.loadModule('test-loader') as { test: boolean };

    expect(module.test).toEqual(true);
  });

  test('returns different modules for different paths', async () => {
    const manifest: RoutesManifest = {
      routes: [],
      errorBoundaries: [],
      statusPages: new Map(),
      moduleLoaders: {
        'module-1': () => Promise.resolve({ id: 1 }),
        'module-2': () => Promise.resolve({ id: 2 }),
      },
    };
    const router = new RouteCore(manifest);

    const mod1 = await router.loadModule('module-1') as { id: number };
    const mod2 = await router.loadModule('module-2') as { id: number };

    expect(mod1.id).toEqual(1);
    expect(mod2.id).toEqual(2);
  });
});

describe('RouteCore - event emission', () => {
  test('emits events to listeners', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const events: Array<{ type: string; pathname: string; params: Record<string, string> }> = [];
    router.addEventListener((event) => {
      events.push(event);
    });

    router.emit({ type: 'navigate', pathname: '/about', params: {} });

    expect(events.length).toEqual(1);
    expect(events[0].type).toEqual('navigate');
    expect(events[0].pathname).toEqual('/about');
  });

  test('supports multiple listeners', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const events1: Array<{ type: string; pathname: string; params: Record<string, string> }> = [];
    const events2: Array<{ type: string; pathname: string; params: Record<string, string> }> = [];

    router.addEventListener((event) => events1.push(event));
    router.addEventListener((event) => events2.push(event));

    router.emit({ type: 'navigate', pathname: '/about', params: {} });

    expect(events1.length).toEqual(1);
    expect(events2.length).toEqual(1);
  });

  test('listener removal returns unsubscribe function', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const events: Array<{ type: string; pathname: string; params: Record<string, string> }> = [];
    const unsubscribe = router.addEventListener((event) => {
      events.push(event);
    });

    router.emit({ type: 'navigate', pathname: '/about', params: {} });
    expect(events.length).toEqual(1);

    unsubscribe();

    router.emit({ type: 'navigate', pathname: '/projects', params: {} });
    expect(events.length).toEqual(1);
  });

  test('handles listener errors gracefully', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const errors: Error[] = [];
    const originalError = console.error;
    console.error = (_msg: string, err: Error) => {
      errors.push(err);
    };

    router.addEventListener(() => {
      throw new Error('Listener error');
    });

    router.addEventListener(() => {
      // This should still be called even though first listener threw
    });

    try {
      router.emit({ type: 'navigate', pathname: '/about', params: {} });
      expect(errors.length > 0).toEqual(true);
    } finally {
      console.error = originalError;
    }
  });

  test('emits events with route parameters', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const events: Array<{ type: string; pathname: string; params: Record<string, string> }> = [];
    router.addEventListener((event) => events.push(event));

    router.emit({
      type: 'navigate',
      pathname: '/users/123',
      params: { id: '123' },
    });

    expect(events[0].params.id).toEqual('123');
  });

  test('emits error events', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const events: Array<
      { type: string; pathname: string; params: Record<string, string>; error?: Error }
    > = [];
    router.addEventListener((event) => events.push(event));

    const error = new Error('Route not found');
    router.emit({
      type: 'error',
      pathname: '/nonexistent',
      params: {},
      error,
    });

    expect(events[0].type).toEqual('error');
    expect(events[0].error).toEqual(error);
  });
});

describe('RouteCore - context provider integration', () => {
  test('extends context with provider', () => {
    const manifest = createTestManifest();
    const provider = (ctx: ComponentContext) => ({
      ...ctx,
      userId: '123',
      isAuthenticated: true,
    });

    const router = new RouteCore(manifest, { extendContext: provider });

    const baseContext: ComponentContext = {
      pathname: '/dashboard',
      pattern: '/dashboard',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const extended = router.contextProvider!(baseContext) as ComponentContext & {
      userId: string;
      isAuthenticated: boolean;
    };

    expect(extended.userId).toEqual('123');
    expect(extended.isAuthenticated).toEqual(true);
    expect(extended.pathname).toEqual('/dashboard');
  });

  test('builds component context with provider', async () => {
    const manifest: RoutesManifest = {
      routes: [],
      errorBoundaries: [],
      statusPages: new Map(),
    };

    const provider = (ctx: ComponentContext) => ({
      ...ctx,
      appName: 'MyApp',
    });

    const router = new RouteCore(manifest, { extendContext: provider });

    const routeInfo: RouteInfo = {
      pathname: '/home',
      pattern: '/home',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const route = createRoute('/home');

    const context = await router.buildComponentContext(routeInfo, route);

    expect((context as ComponentContext & { appName: string }).appName).toEqual('MyApp');
    expect(context.pathname).toEqual('/home');
  });

  test('preserves files in extended context', async () => {
    const manifest: RoutesManifest = {
      routes: [],
      errorBoundaries: [],
      statusPages: new Map(),
    };

    const provider = (ctx: ComponentContext) => ({
      ...ctx,
      custom: 'data',
    });

    const router = new RouteCore(manifest, { extendContext: provider });

    const routeInfo: RouteInfo = {
      pathname: '/page',
      pattern: '/page',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const route = createRoute('/page');
    const context = await router.buildComponentContext(routeInfo, route);

    expect((context as ComponentContext & { custom: string }).custom).toEqual('data');
    expect(context.files?.html).toEqual(undefined);
  });
});

describe('RouteCore - specificity ordering', () => {
  test('matches more specific static routes before less specific', () => {
    const routes = [
      createRoute('/projects'),
      createRoute('/projects/featured'),
      createRoute('/projects/:id'),
    ];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/projects/featured');

    expect(matched?.route.pattern).toEqual('/projects/featured');
  });

  test('matches static routes before dynamic when ordered correctly', () => {
    // Routes must be ordered by specificity in the manifest
    const routes = [
      createRoute('/posts/featured'),
      createRoute('/posts/:id'),
    ];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/posts/featured');

    expect(matched?.route.pattern).toEqual('/posts/featured');
  });

  test('matches deeper routes before shallower', () => {
    const routes = [
      createRoute('/projects/:id'),
      createRoute('/projects/:id/tasks'),
      createRoute('/projects/:id/tasks/:taskId'),
    ];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/projects/123/tasks/456');

    expect(matched?.route.pattern).toEqual('/projects/:id/tasks/:taskId');
  });
});

describe('RouteCore - catch-all and wildcard routes', () => {
  test('matches wildcard routes with rest parameter', () => {
    const routes = [
      createRoute('/docs/:rest*'),
    ];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/docs/guides/getting-started');

    expect(matched).toBeDefined();
  });

  test('provides catch-all for nested paths', () => {
    const routes = [
      createRoute('/docs'),
      createRoute('/docs/:rest*'),
    ];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched1 = router.match('/docs');
    const matched2 = router.match('/docs/guides/advanced/optimization');

    expect(matched1?.route.pattern).toEqual('/docs');
    expect(matched2?.route.pattern).toEqual('/docs/:rest*');
  });
});

describe('RouteCore - edge cases', () => {
  test('handles empty route params', () => {
    const routes = [createRoute('/static')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/static');

    expect(matched?.params).toEqual({});
  });

  test('handles route with special characters in dynamic segment', () => {
    const routes = [createRoute('/search/:query')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/search/hello-world');

    expect(matched?.params.query).toEqual('hello-world');
  });

  test('handles complex nested dynamic parameters', () => {
    const routes = [createRoute('/api/:version/users/:userId/posts/:postId/comments/:commentId')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/api/v1/users/user123/posts/post456/comments/comment789');

    expect(matched?.params.version).toEqual('v1');
    expect(matched?.params.userId).toEqual('user123');
    expect(matched?.params.postId).toEqual('post456');
    expect(matched?.params.commentId).toEqual('comment789');
  });

  test('handles routes with hyphens in static segments', () => {
    const routes = [createRoute('/api-docs/:pageName')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/api-docs/getting-started');

    expect(matched).toBeDefined();
    expect(matched?.params.pageName).toEqual('getting-started');
  });

  test('getParams with no params returns empty object', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const params = router.getParams();

    expect(params).toEqual({});
  });
});

describe('RouteCore - BasePath and DEFAULT_ROOT_ROUTE', () => {
  test('DEFAULT_BASE_PATH has correct defaults', () => {
    expect(DEFAULT_BASE_PATH.html).toEqual('/html');
    expect(DEFAULT_BASE_PATH.md).toEqual('/md');
  });

  test('DEFAULT_ROOT_ROUTE has correct structure', () => {
    expect(DEFAULT_ROOT_ROUTE.pattern).toEqual('/');
    expect(DEFAULT_ROOT_ROUTE.type).toEqual('page');
    expect(DEFAULT_ROOT_ROUTE.modulePath).toEqual('__default_root__');
  });
});
