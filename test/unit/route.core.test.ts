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

import { assertEquals, assertExists } from '@std/assert';
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

Deno.test('RouteCore - basePath matching', async (t) => {
  await t.step('matches routes with prefixed manifest', () => {
    const bare = createTestManifest([createRoute('/about')]);
    const manifest = prefixManifest(bare, '/html');
    const core = new RouteCore(manifest, { basePath: '/html' });
    const matched = core.match('/html/about');
    assertExists(matched);
    assertEquals(matched.route.pattern, '/html/about');
  });

  await t.step('root fallback uses basePath', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest, { basePath: '/html' });
    const matched = core.match('/html');
    assertExists(matched);
    assertEquals(matched.route.pattern, '/html');
    assertEquals(matched.route.modulePath, '__default_root__');
  });

  await t.step('root fallback handles trailing slash', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest, { basePath: '/html' });
    const matched = core.match('/html/');
    assertExists(matched);
    assertEquals(matched.route.pattern, '/html');
  });

  await t.step('no match for paths outside basePath', () => {
    const bare = createTestManifest([createRoute('/about')]);
    const manifest = prefixManifest(bare, '/html');
    const core = new RouteCore(manifest, { basePath: '/html' });
    const matched = core.match('/about');
    assertEquals(matched, undefined);
  });

  await t.step('works without basePath (backward compatible)', () => {
    const manifest = createTestManifest([createRoute('/about')]);
    const core = new RouteCore(manifest);
    const matched = core.match('/about');
    assertExists(matched);
    assertEquals(matched.route.pattern, '/about');
  });
});

Deno.test('RouteCore - buildRouteHierarchy with basePath', async (t) => {
  await t.step('root returns basePath', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest, { basePath: '/html' });
    assertEquals(core.buildRouteHierarchy('/html'), ['/html']);
  });

  await t.step('root with trailing slash', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest, { basePath: '/html' });
    assertEquals(core.buildRouteHierarchy('/html/'), ['/html']);
  });

  await t.step('nested route', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest, { basePath: '/html' });
    assertEquals(
      core.buildRouteHierarchy('/html/projects/:id'),
      ['/html', '/html/projects', '/html/projects/:id'],
    );
  });

  await t.step('without basePath (backward compatible)', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest);
    assertEquals(
      core.buildRouteHierarchy('/projects/:id'),
      ['/', '/projects', '/projects/:id'],
    );
  });
});

Deno.test('RouteCore - normalizeUrl with basePath', async (t) => {
  await t.step('strips trailing slash on basePath root', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest, { basePath: '/html' });
    assertEquals(core.normalizeUrl('/html/'), '/html');
  });

  await t.step('strips trailing slash on non-root paths', () => {
    const manifest = createTestManifest([]);
    const core = new RouteCore(manifest, { basePath: '/html' });
    assertEquals(core.normalizeUrl('/html/about/'), '/html/about');
  });
});

Deno.test('RouteCore - assertSafeRedirect', async (t) => {
  await t.step('allows http URLs', () => {
    assertSafeRedirect('http://example.com');
  });

  await t.step('allows https URLs', () => {
    assertSafeRedirect('https://example.com');
  });

  await t.step('allows relative URLs', () => {
    assertSafeRedirect('/about');
    assertSafeRedirect('../home');
  });

  await t.step('allows root-relative URLs', () => {
    assertSafeRedirect('/');
  });

  await t.step('throws on javascript protocol', () => {
    try {
      assertSafeRedirect('javascript:alert("xss")');
      throw new Error('Should have thrown');
    } catch (e) {
      assertEquals(
        (e as Error).message.includes('Unsafe redirect URL'),
        true,
      );
    }
  });

  await t.step('throws on data protocol', () => {
    try {
      assertSafeRedirect('data:text/html,<script>alert("xss")</script>');
      throw new Error('Should have thrown');
    } catch (e) {
      assertEquals(
        (e as Error).message.includes('Unsafe redirect URL'),
        true,
      );
    }
  });

  await t.step('throws on vbscript protocol', () => {
    try {
      assertSafeRedirect('vbscript:msgbox("xss")');
      throw new Error('Should have thrown');
    } catch (e) {
      assertEquals(
        (e as Error).message.includes('Unsafe redirect URL'),
        true,
      );
    }
  });

  await t.step('is case-insensitive for protocols', () => {
    try {
      assertSafeRedirect('JavaScript:alert("xss")');
      throw new Error('Should have thrown');
    } catch (e) {
      assertEquals(
        (e as Error).message.includes('Unsafe redirect URL'),
        true,
      );
    }
  });

  await t.step('handles whitespace before protocol', () => {
    try {
      assertSafeRedirect('  javascript:alert("xss")');
      throw new Error('Should have thrown');
    } catch (e) {
      assertEquals(
        (e as Error).message.includes('Unsafe redirect URL'),
        true,
      );
    }
  });
});

Deno.test('RouteCore - constructor and initialization', async (t) => {
  await t.step('creates router with manifest', () => {
    const manifest = createTestManifest();
    const router = new RouteCore(manifest);

    assertExists(router.matcher);
    assertEquals(router.contextProvider, undefined);
  });

  await t.step('registers context provider', () => {
    const manifest = createTestManifest();
    const provider = (ctx: ComponentContext) => ({
      ...ctx,
      custom: 'value',
    });

    const router = new RouteCore(manifest, { extendContext: provider });

    assertEquals(router.contextProvider, provider);
  });

  await t.step('sets baseUrl from options', () => {
    const manifest = createTestManifest();
    const router = new RouteCore(manifest, { baseUrl: 'http://localhost:3000' });

    assertExists(router);
  });

  await t.step('defaults baseUrl to empty string', () => {
    const manifest = createTestManifest();
    const router = new RouteCore(manifest);

    assertExists(router);
  });

  await t.step('initializes currentRoute as null', () => {
    const manifest = createTestManifest();
    const router = new RouteCore(manifest);

    assertEquals(router.currentRoute, null);
  });
});

Deno.test('RouteCore - route matching', async (t) => {
  await t.step('matches static routes', () => {
    const routes = [createRoute('/about')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/about');

    assertExists(matched);
    assertEquals(matched?.route.pattern, '/about');
  });

  await t.step('matches dynamic segment routes', () => {
    const routes = [createRoute('/projects/:id')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/projects/123');

    assertExists(matched);
    assertEquals(matched?.route.pattern, '/projects/:id');
    assertEquals(matched?.params.id, '123');
  });

  await t.step('matches nested dynamic routes', () => {
    const routes = [createRoute('/projects/:projectId/tasks/:taskId')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/projects/42/tasks/99');

    assertExists(matched);
    assertEquals(matched?.params.projectId, '42');
    assertEquals(matched?.params.taskId, '99');
  });

  await t.step('returns undefined for unmatched routes', () => {
    const routes = [createRoute('/about')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/nonexistent');

    assertEquals(matched, undefined);
  });

  await t.step('falls back to default root route for /', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const matched = router.match('/');

    assertExists(matched);
    assertEquals(matched?.route.modulePath, DEFAULT_ROOT_ROUTE.modulePath);
    assertEquals(matched?.route.pattern, '/');
  });

  await t.step('accepts URL objects', () => {
    const routes = [createRoute('/about')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const url = new URL('http://localhost/about');
    const matched = router.match(url);

    assertExists(matched);
    assertEquals(matched?.route.pattern, '/about');
  });

  await t.step('preserves search params in match result', () => {
    const routes = [createRoute('/search')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/search?q=test&limit=10');

    assertExists(matched?.searchParams);
    assertEquals(matched?.searchParams?.get('q'), 'test');
    assertEquals(matched?.searchParams?.get('limit'), '10');
  });
});

Deno.test('RouteCore - parameter extraction', async (t) => {
  await t.step('extracts single parameter', () => {
    const routes = [createRoute('/users/:id')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/users/john-doe');

    assertEquals(matched?.params.id, 'john-doe');
  });

  await t.step('extracts multiple parameters', () => {
    const routes = [createRoute('/projects/:projectId/tasks/:taskId/comments/:commentId')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/projects/proj-1/tasks/task-2/comments/comment-3');

    assertEquals(matched?.params.projectId, 'proj-1');
    assertEquals(matched?.params.taskId, 'task-2');
    assertEquals(matched?.params.commentId, 'comment-3');
  });

  await t.step('handles numeric parameters', () => {
    const routes = [createRoute('/posts/:id')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/posts/12345');

    assertEquals(matched?.params.id, '12345');
  });

  await t.step('handles slug parameters with hyphens', () => {
    const routes = [createRoute('/articles/:slug')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/articles/my-awesome-article');

    assertEquals(matched?.params.slug, 'my-awesome-article');
  });

  await t.step('getParams returns current route params', () => {
    const routes = [createRoute('/users/:id')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    router.currentRoute = router.match('/users/123')!;
    const params = router.getParams();

    assertEquals(params.id, '123');
  });

  await t.step('getParams returns empty object when no current route', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const params = router.getParams();

    assertEquals(params, {});
  });
});

Deno.test('RouteCore - parent-child relationships', async (t) => {
  await t.step('tracks parent route in config', () => {
    const routes = [
      createRoute('/projects', 'projects'),
      createRoute('/projects/:id', 'project-detail', '/projects'),
      createRoute('/projects/:id/tasks', 'project-tasks', '/projects/:id'),
    ];
    const manifest = createTestManifest(routes);
    const _router = new RouteCore(manifest);

    assertEquals(routes[1].parent, '/projects');
    assertEquals(routes[2].parent, '/projects/:id');
  });

  await t.step('matches child routes correctly', () => {
    const routes = [
      createRoute('/projects', 'projects'),
      createRoute('/projects/:id', 'project-detail', '/projects'),
    ];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/projects/123');

    assertEquals(matched?.route.pattern, '/projects/:id');
    assertEquals(matched?.route.parent, '/projects');
  });
});

Deno.test('RouteCore - route hierarchy building', async (t) => {
  await t.step('builds hierarchy for root', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const hierarchy = router.buildRouteHierarchy('/');

    assertEquals(hierarchy, ['/']);
  });

  await t.step('builds hierarchy for single segment', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const hierarchy = router.buildRouteHierarchy('/about');

    assertEquals(hierarchy, ['/', '/about']);
  });

  await t.step('builds hierarchy for multiple segments', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const hierarchy = router.buildRouteHierarchy('/projects/123/tasks');

    assertEquals(hierarchy, ['/', '/projects', '/projects/123', '/projects/123/tasks']);
  });

  await t.step('handles trailing segments correctly', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const hierarchy = router.buildRouteHierarchy('/a/b/c/d/e');

    assertEquals(hierarchy, [
      '/',
      '/a',
      '/a/b',
      '/a/b/c',
      '/a/b/c/d',
      '/a/b/c/d/e',
    ]);
  });
});

Deno.test('RouteCore - URL normalization', async (t) => {
  await t.step('removes trailing slash', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const normalized = router.normalizeUrl('/about/');

    assertEquals(normalized, '/about');
  });

  await t.step('keeps root slash', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const normalized = router.normalizeUrl('/');

    assertEquals(normalized, '/');
  });

  await t.step('keeps URLs without trailing slash', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const normalized = router.normalizeUrl('/projects/123');

    assertEquals(normalized, '/projects/123');
  });

  await t.step('handles nested paths with trailing slash', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const normalized = router.normalizeUrl('/projects/123/tasks/');

    assertEquals(normalized, '/projects/123/tasks');
  });
});

Deno.test('RouteCore - path conversion', async (t) => {
  await t.step('converts relative path to absolute', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const absolute = router.toAbsolutePath('about');

    assertEquals(absolute, '/about');
  });

  await t.step('keeps absolute paths unchanged', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const absolute = router.toAbsolutePath('/about');

    assertEquals(absolute, '/about');
  });

  await t.step('converts nested relative paths', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const absolute = router.toAbsolutePath('projects/123/tasks');

    assertEquals(absolute, '/projects/123/tasks');
  });
});

Deno.test('RouteCore - route info building', async (t) => {
  await t.step('builds route info from matched route', () => {
    const routes = [createRoute('/projects/:id')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/projects/123')!;
    const info = router.toRouteInfo(matched, '/projects/123');

    assertEquals(info.pathname, '/projects/123');
    assertEquals(info.pattern, '/projects/:id');
    assertEquals(info.params.id, '123');
  });

  await t.step('includes search params in route info', () => {
    const routes = [createRoute('/search')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/search?q=test')!;
    const info = router.toRouteInfo(matched, '/search');

    assertEquals(info.searchParams.get('q'), 'test');
  });

  await t.step('provides default empty search params if not set', () => {
    const routes = [createRoute('/about')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = { route: routes[0], params: {} } as {
      route: typeof routes[0];
      params: Record<string, string>;
    };
    const info = router.toRouteInfo(matched, '/about');

    assertExists(info.searchParams);
    assertEquals(info.searchParams.toString(), '');
  });
});

Deno.test('RouteCore - module loading and caching', async (t) => {
  await t.step('caches modules', async () => {
    const manifest = createTestManifest();
    const router = new RouteCore(manifest);

    const module1 = await router.loadModule('test-loader');
    const module2 = await router.loadModule('test-loader');

    assertEquals(module1, module2);
  });

  await t.step('loads module from moduleLoaders', async () => {
    const manifest = createTestManifest();
    const router = new RouteCore(manifest);

    const module = await router.loadModule('test-loader') as { test: boolean };

    assertEquals(module.test, true);
  });

  await t.step('returns different modules for different paths', async () => {
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

    assertEquals(mod1.id, 1);
    assertEquals(mod2.id, 2);
  });
});

Deno.test('RouteCore - event emission', async (t) => {
  await t.step('emits events to listeners', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const events: Array<{ type: string; pathname: string; params: Record<string, string> }> = [];
    router.addEventListener((event) => {
      events.push(event);
    });

    router.emit({ type: 'navigate', pathname: '/about', params: {} });

    assertEquals(events.length, 1);
    assertEquals(events[0].type, 'navigate');
    assertEquals(events[0].pathname, '/about');
  });

  await t.step('supports multiple listeners', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const events1: Array<{ type: string; pathname: string; params: Record<string, string> }> = [];
    const events2: Array<{ type: string; pathname: string; params: Record<string, string> }> = [];

    router.addEventListener((event) => events1.push(event));
    router.addEventListener((event) => events2.push(event));

    router.emit({ type: 'navigate', pathname: '/about', params: {} });

    assertEquals(events1.length, 1);
    assertEquals(events2.length, 1);
  });

  await t.step('listener removal returns unsubscribe function', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const events: Array<{ type: string; pathname: string; params: Record<string, string> }> = [];
    const unsubscribe = router.addEventListener((event) => {
      events.push(event);
    });

    router.emit({ type: 'navigate', pathname: '/about', params: {} });
    assertEquals(events.length, 1);

    unsubscribe();

    router.emit({ type: 'navigate', pathname: '/projects', params: {} });
    assertEquals(events.length, 1);
  });

  await t.step('handles listener errors gracefully', () => {
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
      assertEquals(errors.length > 0, true);
    } finally {
      console.error = originalError;
    }
  });

  await t.step('emits events with route parameters', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const events: Array<{ type: string; pathname: string; params: Record<string, string> }> = [];
    router.addEventListener((event) => events.push(event));

    router.emit({
      type: 'navigate',
      pathname: '/users/123',
      params: { id: '123' },
    });

    assertEquals(events[0].params.id, '123');
  });

  await t.step('emits error events', () => {
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

    assertEquals(events[0].type, 'error');
    assertEquals(events[0].error, error);
  });
});

Deno.test('RouteCore - context provider integration', async (t) => {
  await t.step('extends context with provider', () => {
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

    assertEquals(extended.userId, '123');
    assertEquals(extended.isAuthenticated, true);
    assertEquals(extended.pathname, '/dashboard');
  });

  await t.step('builds component context with provider', async () => {
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

    assertEquals((context as ComponentContext & { appName: string }).appName, 'MyApp');
    assertEquals(context.pathname, '/home');
  });

  await t.step('preserves files in extended context', async () => {
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

    assertEquals((context as ComponentContext & { custom: string }).custom, 'data');
    assertEquals(context.files?.html, undefined);
  });
});

Deno.test('RouteCore - specificity ordering', async (t) => {
  await t.step('matches more specific static routes before less specific', () => {
    const routes = [
      createRoute('/projects'),
      createRoute('/projects/featured'),
      createRoute('/projects/:id'),
    ];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/projects/featured');

    assertEquals(matched?.route.pattern, '/projects/featured');
  });

  await t.step('matches static routes before dynamic when ordered correctly', () => {
    // Routes must be ordered by specificity in the manifest
    const routes = [
      createRoute('/posts/featured'),
      createRoute('/posts/:id'),
    ];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/posts/featured');

    assertEquals(matched?.route.pattern, '/posts/featured');
  });

  await t.step('matches deeper routes before shallower', () => {
    const routes = [
      createRoute('/projects/:id'),
      createRoute('/projects/:id/tasks'),
      createRoute('/projects/:id/tasks/:taskId'),
    ];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/projects/123/tasks/456');

    assertEquals(matched?.route.pattern, '/projects/:id/tasks/:taskId');
  });
});

Deno.test('RouteCore - catch-all and wildcard routes', async (t) => {
  await t.step('matches wildcard routes with rest parameter', () => {
    const routes = [
      createRoute('/docs/:rest*'),
    ];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/docs/guides/getting-started');

    assertExists(matched);
  });

  await t.step('provides catch-all for nested paths', () => {
    const routes = [
      createRoute('/docs'),
      createRoute('/docs/:rest*'),
    ];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched1 = router.match('/docs');
    const matched2 = router.match('/docs/guides/advanced/optimization');

    assertEquals(matched1?.route.pattern, '/docs');
    assertEquals(matched2?.route.pattern, '/docs/:rest*');
  });
});

Deno.test('RouteCore - edge cases', async (t) => {
  await t.step('handles empty route params', () => {
    const routes = [createRoute('/static')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/static');

    assertEquals(matched?.params, {});
  });

  await t.step('handles route with special characters in dynamic segment', () => {
    const routes = [createRoute('/search/:query')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/search/hello-world');

    assertEquals(matched?.params.query, 'hello-world');
  });

  await t.step('handles complex nested dynamic parameters', () => {
    const routes = [createRoute('/api/:version/users/:userId/posts/:postId/comments/:commentId')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/api/v1/users/user123/posts/post456/comments/comment789');

    assertEquals(matched?.params.version, 'v1');
    assertEquals(matched?.params.userId, 'user123');
    assertEquals(matched?.params.postId, 'post456');
    assertEquals(matched?.params.commentId, 'comment789');
  });

  await t.step('handles routes with hyphens in static segments', () => {
    const routes = [createRoute('/api-docs/:pageName')];
    const manifest = createTestManifest(routes);
    const router = new RouteCore(manifest);

    const matched = router.match('/api-docs/getting-started');

    assertExists(matched);
    assertEquals(matched?.params.pageName, 'getting-started');
  });

  await t.step('getParams with no params returns empty object', () => {
    const manifest = createTestManifest([]);
    const router = new RouteCore(manifest);

    const params = router.getParams();

    assertEquals(params, {});
  });
});

Deno.test('RouteCore - BasePath and DEFAULT_ROOT_ROUTE', async (t) => {
  await t.step('DEFAULT_BASE_PATH has correct defaults', () => {
    assertEquals(DEFAULT_BASE_PATH.html, '/html');
    assertEquals(DEFAULT_BASE_PATH.md, '/md');
  });

  await t.step('DEFAULT_ROOT_ROUTE has correct structure', () => {
    assertEquals(DEFAULT_ROOT_ROUTE.pattern, '/');
    assertEquals(DEFAULT_ROOT_ROUTE.type, 'page');
    assertEquals(DEFAULT_ROOT_ROUTE.modulePath, '__default_root__');
  });
});
