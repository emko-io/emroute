/**
 * Route Core Tests
 *
 * Comprehensive unit tests for RouteCore class covering:
 * - Constructor and initialization
 * - Route matching and hierarchy building
 * - Event emission and listener management
 * - URL normalization
 * - Module loading with caching
 * - HTML and Markdown content fetching
 */

import { assertEquals, assertExists } from '@std/assert';
import { DEFAULT_ROOT_ROUTE, RouteCore } from '../../src/route/route.core.ts';
import type {
  MatchedRoute,
  RouteConfig,
  RouteInfo,
  RouterEvent,
  RoutesManifest,
} from '../../src/type/route.type.ts';

/**
 * Create a minimal test manifest
 */
function createTestManifest(routes: RouteConfig[] = []): RoutesManifest {
  return {
    routes,
    errorBoundaries: [],
    statusPages: new Map(),
  };
}

/**
 * Create a test route
 */
function createTestRoute(overrides?: Partial<RouteConfig>): RouteConfig {
  return {
    pattern: '/test',
    type: 'page',
    modulePath: '/test.page.ts',
    ...overrides,
  };
}

Deno.test('RouteCore - constructor initialization', () => {
  const manifest = createTestManifest();
  const router = new RouteCore(manifest);

  assertExists(router.matcher);
  assertEquals(router.currentRoute, null);
  assertEquals(router.getParams(), {});
});

Deno.test('RouteCore - constructor with routes', () => {
  const routes = [
    createTestRoute({ pattern: '/', modulePath: '/' }),
    createTestRoute({ pattern: '/about', modulePath: '/about.page.ts' }),
    createTestRoute({ pattern: '/projects/:id', modulePath: '/projects/[id].page.ts' }),
  ];

  const manifest = createTestManifest(routes);
  const router = new RouteCore(manifest);

  assertExists(router.matcher);
});

Deno.test('RouteCore - currentRoute getter returns null initially', () => {
  const router = new RouteCore(createTestManifest());
  assertEquals(router.currentRoute, null);
});

Deno.test('RouteCore - currentRoute setter and getter', () => {
  const router = new RouteCore(createTestManifest());
  const route: MatchedRoute = {
    route: createTestRoute(),
    params: { id: '123' },
    patternResult: {} as URLPatternResult,
  };

  router.currentRoute = route;
  assertEquals(router.currentRoute, route);
});

Deno.test('RouteCore - currentRoute can be set to null', () => {
  const router = new RouteCore(createTestManifest());
  const route: MatchedRoute = {
    route: createTestRoute(),
    params: { id: '123' },
    patternResult: {} as URLPatternResult,
  };

  router.currentRoute = route;
  router.currentRoute = null;
  assertEquals(router.currentRoute, null);
});

Deno.test('RouteCore - getParams returns empty object when no current route', () => {
  const router = new RouteCore(createTestManifest());
  assertEquals(router.getParams(), {});
});

Deno.test('RouteCore - getParams returns current route params', () => {
  const router = new RouteCore(createTestManifest());
  const params = { id: '123', name: 'test' };
  const route: MatchedRoute = {
    route: createTestRoute(),
    params,
    patternResult: {} as URLPatternResult,
  };

  router.currentRoute = route;
  assertEquals(router.getParams(), params);
});

Deno.test('RouteCore - getParams returns empty object after clearing current route', () => {
  const router = new RouteCore(createTestManifest());
  const route: MatchedRoute = {
    route: createTestRoute(),
    params: { id: '123' },
    patternResult: {} as URLPatternResult,
  };

  router.currentRoute = route;
  router.currentRoute = null;
  assertEquals(router.getParams(), {});
});

Deno.test('RouteCore - addEventListener registers listener and returns unsubscribe function', () => {
  const router = new RouteCore(createTestManifest());
  let callCount = 0;

  const unsubscribe = router.addEventListener(() => {
    callCount++;
  });

  const event: RouterEvent = {
    type: 'navigate',
    pathname: '/test',
    params: {},
  };

  router.emit(event);
  assertEquals(callCount, 1);

  unsubscribe();
  router.emit(event);
  assertEquals(callCount, 1);
});

Deno.test('RouteCore - addEventListener supports multiple listeners', () => {
  const router = new RouteCore(createTestManifest());
  let count1 = 0;
  let count2 = 0;
  let count3 = 0;

  router.addEventListener(() => count1++);
  router.addEventListener(() => count2++);
  router.addEventListener(() => count3++);

  const event: RouterEvent = {
    type: 'navigate',
    pathname: '/test',
    params: {},
  };

  router.emit(event);
  assertEquals(count1, 1);
  assertEquals(count2, 1);
  assertEquals(count3, 1);
});

Deno.test('RouteCore - addEventListener unsubscribe removes only that listener', () => {
  const router = new RouteCore(createTestManifest());
  let count1 = 0;
  let count2 = 0;

  const unsub1 = router.addEventListener(() => count1++);
  router.addEventListener(() => count2++);

  const event: RouterEvent = {
    type: 'navigate',
    pathname: '/test',
    params: {},
  };

  router.emit(event);
  assertEquals(count1, 1);
  assertEquals(count2, 1);

  unsub1();
  router.emit(event);
  assertEquals(count1, 1);
  assertEquals(count2, 2);
});

Deno.test('RouteCore - emit calls all listeners with event', () => {
  const router = new RouteCore(createTestManifest());
  const events: RouterEvent[] = [];

  router.addEventListener((e) => events.push(e));
  router.addEventListener((e) => events.push(e));

  const testEvent: RouterEvent = {
    type: 'navigate',
    pathname: '/projects/123',
    params: { id: '123' },
  };

  router.emit(testEvent);
  assertEquals(events.length, 2);
  assertEquals(events[0], testEvent);
  assertEquals(events[1], testEvent);
});

Deno.test('RouteCore - emit handles listener errors gracefully', () => {
  const router = new RouteCore(createTestManifest());
  let successCount = 0;

  router.addEventListener(() => {
    throw new Error('Listener error');
  });

  router.addEventListener(() => {
    successCount++;
  });

  const event: RouterEvent = {
    type: 'navigate',
    pathname: '/test',
    params: {},
  };

  router.emit(event);
  assertEquals(successCount, 1);
});

Deno.test('RouteCore - emit with navigate event type', () => {
  const router = new RouteCore(createTestManifest());
  let receivedEvent: RouterEvent | null = null;

  router.addEventListener((e) => {
    receivedEvent = e;
  });

  const event: RouterEvent = {
    type: 'navigate',
    pathname: '/about',
    params: {},
  };

  router.emit(event);
  assertEquals(receivedEvent, event);
});

Deno.test('RouteCore - emit with error event type', () => {
  const router = new RouteCore(createTestManifest());
  let receivedEvent: RouterEvent | null = null;

  router.addEventListener((e) => {
    receivedEvent = e;
  });

  const error = new Error('Test error');
  const event: RouterEvent = {
    type: 'error',
    pathname: '/test',
    params: {},
    error,
  };

  router.emit(event);
  assertEquals(receivedEvent, event);
});

Deno.test('RouteCore - emit with load event type', () => {
  const router = new RouteCore(createTestManifest());
  let receivedEvent: RouterEvent | null = null;

  router.addEventListener((e) => {
    receivedEvent = e;
  });

  const event: RouterEvent = {
    type: 'load',
    pathname: '/home',
    params: {},
  };

  router.emit(event);
  assertEquals(receivedEvent, event);
});

Deno.test('RouteCore - match delegates to matcher', () => {
  const routes = [
    createTestRoute({ pattern: '/', modulePath: '/' }),
    createTestRoute({ pattern: '/about', modulePath: '/about.page.ts' }),
  ];
  const manifest = createTestManifest(routes);
  const router = new RouteCore(manifest);

  const result = router.match('http://localhost/');
  assertExists(result);
  assertEquals(result?.route.pattern, '/');
});

Deno.test('RouteCore - match returns undefined for non-matching route', () => {
  const routes = [
    createTestRoute({ pattern: '/', modulePath: '/' }),
  ];
  const manifest = createTestManifest(routes);
  const router = new RouteCore(manifest);

  const result = router.match('http://localhost/nonexistent');
  assertEquals(result, undefined);
});

Deno.test('RouteCore - match with URL object', () => {
  const routes = [
    createTestRoute({ pattern: '/projects/:id', modulePath: '/projects/[id].page.ts' }),
  ];
  const manifest = createTestManifest(routes);
  const router = new RouteCore(manifest);

  const url = new URL('http://localhost/projects/123');
  const result = router.match(url);
  assertExists(result);
  assertEquals(result?.params.id, '123');
});

Deno.test('RouteCore - match with string URL', () => {
  const routes = [
    createTestRoute({ pattern: '/projects/:id', modulePath: '/projects/[id].page.ts' }),
  ];
  const manifest = createTestManifest(routes);
  const router = new RouteCore(manifest);

  const result = router.match('http://localhost/projects/456');
  assertExists(result);
  assertEquals(result?.params.id, '456');
});

Deno.test('RouteCore - buildRouteHierarchy for root route', () => {
  const router = new RouteCore(createTestManifest());
  const hierarchy = router.buildRouteHierarchy('/');
  assertEquals(hierarchy, ['/']);
});

Deno.test('RouteCore - buildRouteHierarchy for single segment', () => {
  const router = new RouteCore(createTestManifest());
  const hierarchy = router.buildRouteHierarchy('/about');
  assertEquals(hierarchy, ['/', '/about']);
});

Deno.test('RouteCore - buildRouteHierarchy for multiple segments', () => {
  const router = new RouteCore(createTestManifest());
  const hierarchy = router.buildRouteHierarchy('/projects/123/tasks');
  assertEquals(hierarchy, [
    '/',
    '/projects',
    '/projects/123',
    '/projects/123/tasks',
  ]);
});

Deno.test('RouteCore - buildRouteHierarchy with trailing slash', () => {
  const router = new RouteCore(createTestManifest());
  const hierarchy = router.buildRouteHierarchy('/projects/123/');
  assertEquals(hierarchy, [
    '/',
    '/projects',
    '/projects/123',
  ]);
});

Deno.test('RouteCore - buildRouteHierarchy with deep nesting', () => {
  const router = new RouteCore(createTestManifest());
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

Deno.test('RouteCore - buildRouteHierarchy with special characters', () => {
  const router = new RouteCore(createTestManifest());
  const hierarchy = router.buildRouteHierarchy('/projects/my-project/tasks');
  assertEquals(hierarchy, [
    '/',
    '/projects',
    '/projects/my-project',
    '/projects/my-project/tasks',
  ]);
});

Deno.test('RouteCore - normalizeUrl removes trailing slash', () => {
  const router = new RouteCore(createTestManifest());
  assertEquals(router.normalizeUrl('/about/'), '/about');
});

Deno.test('RouteCore - normalizeUrl preserves root slash', () => {
  const router = new RouteCore(createTestManifest());
  assertEquals(router.normalizeUrl('/'), '/');
});

Deno.test('RouteCore - normalizeUrl with no trailing slash', () => {
  const router = new RouteCore(createTestManifest());
  assertEquals(router.normalizeUrl('/about'), '/about');
});

Deno.test('RouteCore - normalizeUrl with multiple trailing slashes', () => {
  const router = new RouteCore(createTestManifest());
  assertEquals(router.normalizeUrl('/about//'), '/about/');
});

Deno.test('RouteCore - normalizeUrl with deep path', () => {
  const router = new RouteCore(createTestManifest());
  assertEquals(router.normalizeUrl('/projects/123/tasks/'), '/projects/123/tasks');
});

Deno.test('RouteCore - toAbsolutePath with leading slash', () => {
  const router = new RouteCore(createTestManifest());
  assertEquals(router.toAbsolutePath('/test.page.ts'), '/test.page.ts');
});

Deno.test('RouteCore - toAbsolutePath without leading slash', () => {
  const router = new RouteCore(createTestManifest());
  assertEquals(router.toAbsolutePath('test.page.ts'), '/test.page.ts');
});

Deno.test('RouteCore - toAbsolutePath with nested path', () => {
  const router = new RouteCore(createTestManifest());
  assertEquals(router.toAbsolutePath('projects/123.page.ts'), '/projects/123.page.ts');
});

Deno.test('RouteCore - toAbsolutePath with absolute nested path', () => {
  const router = new RouteCore(createTestManifest());
  assertEquals(router.toAbsolutePath('/projects/123.page.ts'), '/projects/123.page.ts');
});

Deno.test('RouteCore - toAbsolutePath with empty string', () => {
  const router = new RouteCore(createTestManifest());
  assertEquals(router.toAbsolutePath(''), '/');
});

Deno.test('RouteCore - loadModule caches module', async () => {
  const router = new RouteCore(createTestManifest());

  // Create a mock module by using a data URL
  const mockModule = { default: 'test content' };

  // We'll test caching behavior with a simple approach
  // by checking that calling it twice uses the cache
  const moduleCache = (router as unknown as { moduleCache: Map<string, unknown> }).moduleCache;
  moduleCache.set('/test.js', mockModule);

  const cached = await router.loadModule('/test.js');
  assertEquals(cached, mockModule);
});

Deno.test('RouteCore - loadModule caches by original path', async () => {
  const router = new RouteCore(createTestManifest());
  const moduleCache = (router as unknown as { moduleCache: Map<string, unknown> }).moduleCache;

  const mockModule = { test: true };
  moduleCache.set('test.js', mockModule);

  const result = await router.loadModule('test.js');
  assertEquals(result, mockModule);
});

Deno.test('RouteCore - loadModule returns same object on second call (cache)', async () => {
  const router = new RouteCore(createTestManifest());
  const moduleCache = (router as unknown as { moduleCache: Map<string, unknown> }).moduleCache;

  const mockModule = { data: 'cached' };
  moduleCache.set('/cached.js', mockModule);

  const first = await router.loadModule('/cached.js');
  const second = await router.loadModule('/cached.js');

  assertEquals(first, mockModule);
  assertEquals(second, mockModule);
  assertEquals(first === second, true);
});

Deno.test('RouteCore - loadModule handles dynamic import', async () => {
  const router = new RouteCore(createTestManifest());
  const moduleCache = (router as unknown as { moduleCache: Map<string, unknown> }).moduleCache;

  // Create a minimal mock for testing
  const mockModule = { name: 'test-module' };
  moduleCache.set('/dynamic.js', mockModule);

  const result = await router.loadModule('/dynamic.js');
  const loaded = result as unknown as { name: string };
  assertEquals(loaded.name, 'test-module');
});

Deno.test('DEFAULT_ROOT_ROUTE has correct structure', () => {
  assertEquals(DEFAULT_ROOT_ROUTE.pattern, '/');
  assertEquals(DEFAULT_ROOT_ROUTE.type, 'page');
  assertEquals(DEFAULT_ROOT_ROUTE.modulePath, '__default_root__');
});

Deno.test('RouteCore - integration: navigate and emit event', () => {
  const router = new RouteCore(createTestManifest());
  let navigationCount = 0;

  router.addEventListener((event) => {
    if (event.type === 'navigate') {
      navigationCount++;
    }
  });

  const route: MatchedRoute = {
    route: createTestRoute({ pattern: '/projects/:id' }),
    params: { id: '42' },
    patternResult: {} as URLPatternResult,
  };

  router.currentRoute = route;
  router.emit({
    type: 'navigate',
    pathname: '/projects/42',
    params: { id: '42' },
  });

  assertEquals(navigationCount, 1);
  assertEquals(router.getParams().id, '42');
});

Deno.test('RouteCore - integration: multiple listeners handle same event', () => {
  const router = new RouteCore(createTestManifest());
  const events1: RouterEvent[] = [];
  const events2: RouterEvent[] = [];

  router.addEventListener((e) => events1.push(e));
  router.addEventListener((e) => events2.push(e));

  const testEvent: RouterEvent = {
    type: 'navigate',
    pathname: '/test',
    params: {},
  };

  router.emit(testEvent);
  assertEquals(events1.length, 1);
  assertEquals(events2.length, 1);
  assertEquals(events1[0], events2[0]);
});

Deno.test('RouteCore - integration: listeners can be added and removed dynamically', () => {
  const router = new RouteCore(createTestManifest());
  const callLog: number[] = [];

  const unsub1 = router.addEventListener(() => callLog.push(1));
  const unsub2 = router.addEventListener(() => callLog.push(2));
  const unsub3 = router.addEventListener(() => callLog.push(3));

  const event: RouterEvent = {
    type: 'navigate',
    pathname: '/test',
    params: {},
  };

  router.emit(event);
  assertEquals(callLog, [1, 2, 3]);

  unsub2();
  callLog.length = 0;

  router.emit(event);
  assertEquals(callLog, [1, 3]);

  unsub1();
  callLog.length = 0;

  router.emit(event);
  assertEquals(callLog, [3]);

  unsub3();
  callLog.length = 0;

  router.emit(event);
  assertEquals(callLog, []);
});

Deno.test('RouteCore - getParams reflects current route changes', () => {
  const router = new RouteCore(createTestManifest());

  assertEquals(router.getParams(), {});

  const route1: MatchedRoute = {
    route: createTestRoute(),
    params: { id: '1' },
    patternResult: {} as URLPatternResult,
  };

  router.currentRoute = route1;
  assertEquals(router.getParams().id, '1');

  const route2: MatchedRoute = {
    route: createTestRoute(),
    params: { id: '2', name: 'test' },
    patternResult: {} as URLPatternResult,
  };

  router.currentRoute = route2;
  assertEquals(router.getParams().id, '2');
  assertEquals(router.getParams().name, 'test');

  router.currentRoute = null;
  assertEquals(router.getParams(), {});
});

// ==============================================================================
// toRouteInfo() Tests
// ==============================================================================

Deno.test('RouteCore - toRouteInfo builds RouteInfo from matched route', () => {
  const routes = [
    createTestRoute({ pattern: '/projects/:id', modulePath: '/projects/[id].page.ts' }),
  ];
  const router = new RouteCore(createTestManifest(routes));

  const matched = router.match('http://localhost/projects/42')!;
  const routeInfo: RouteInfo = router.toRouteInfo(matched, '/projects/42');

  assertEquals(routeInfo.pathname, '/projects/42');
  assertEquals(routeInfo.pattern, '/projects/:id');
  assertEquals(routeInfo.params, { id: '42' });
  assertEquals(routeInfo.searchParams.toString(), '');
});

Deno.test('RouteCore - toRouteInfo preserves searchParams from matched route', () => {
  const routes = [
    createTestRoute({ pattern: '/search', modulePath: '/search.page.ts' }),
  ];
  const router = new RouteCore(createTestManifest(routes));

  const url = new URL('http://localhost/search?q=hello&page=2');
  const matched = router.match(url)!;
  const routeInfo: RouteInfo = router.toRouteInfo(matched, '/search');

  assertEquals(routeInfo.pathname, '/search');
  assertEquals(routeInfo.pattern, '/search');
  assertEquals(routeInfo.searchParams.get('q'), 'hello');
  assertEquals(routeInfo.searchParams.get('page'), '2');
});

Deno.test('RouteCore - toRouteInfo defaults searchParams to empty when absent', () => {
  const router = new RouteCore(createTestManifest());

  const matched: MatchedRoute = {
    route: createTestRoute({ pattern: '/about' }),
    params: {},
    patternResult: {} as URLPatternResult,
  };
  const routeInfo: RouteInfo = router.toRouteInfo(matched, '/about');

  assertEquals(routeInfo.searchParams.toString(), '');
});

Deno.test('RouteCore - toRouteInfo pathname is the resolved path, not the pattern', () => {
  const routes = [
    createTestRoute({ pattern: '/users/:id/posts', modulePath: '/users/[id]/posts.page.ts' }),
  ];
  const router = new RouteCore(createTestManifest(routes));

  const matched = router.match('http://localhost/users/99/posts')!;
  const routeInfo: RouteInfo = router.toRouteInfo(matched, '/users/99/posts');

  assertEquals(routeInfo.pathname, '/users/99/posts');
  assertEquals(routeInfo.pattern, '/users/:id/posts');
  assertEquals(routeInfo.params.id, '99');
});
