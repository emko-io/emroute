/**
 * Pipeline Tests
 *
 * Unit tests for Pipeline (core/pipeline/pipeline.ts):
 * - match() — route resolution, params, 404, default root
 * - buildRouteHierarchy() — ancestor chain from pattern segments
 * - loadModule() — moduleLoaders map, runtime fallback, caching
 * - getModuleFiles() — inlined __files from cached modules
 * - loadFiles() — companion file reading via runtime
 * - buildContext() — base context construction, contextProvider wiring
 * - toRouteInfo() — MatchedRoute + URL → RouteInfo
 * - findRoute() — direct pattern lookup
 * - getStatusPage() — registered status pages
 * - findErrorBoundary() — error boundary by path prefix
 * - getErrorHandler() — root-level error handler
 * - Edge cases: trailing slashes, query params, dynamic segments, wildcards
 */

import { test, expect } from 'bun:test';
import { Pipeline, DEFAULT_ROOT_ROUTE } from '../../core/pipeline/pipeline.ts';
import type { RouteConfig } from '../../core/type/route.type.ts';
import type { ComponentContext } from '../../core/type/component.type.ts';
import { Runtime } from '../../core/runtime/abstract.runtime.ts';
import { createResolver, url } from './test.util.ts';

// ============================================================================
// Test Infrastructure
// ============================================================================

/** In-memory Runtime for testing — stores files and modules as strings. */
class MockRuntime extends Runtime {
  private files = new Map<string, string>();
  private modules = new Map<string, unknown>();

  set(path: string, content: string): void {
    const abs = path.startsWith('/') ? path : '/' + path;
    this.files.set(abs, content);
  }

  setModule(path: string, mod: unknown): void {
    const abs = path.startsWith('/') ? path : '/' + path;
    this.modules.set(abs, mod);
  }

  handle(): ReturnType<typeof fetch> {
    throw new Error('Not implemented');
  }

  query(resource: Parameters<typeof fetch>[0], options?: Record<string, unknown>): Promise<Response>;
  query(resource: Parameters<typeof fetch>[0], options: Record<string, unknown> & { as: 'text' }): Promise<string>;
  query(resource: Parameters<typeof fetch>[0], options?: Record<string, unknown>): Promise<Response | string> {
    const path = typeof resource === 'string' ? resource : resource instanceof URL ? resource.pathname : resource.url;
    const content = this.files.get(path);
    if (content === undefined) {
      if (options && 'as' in options && options.as === 'text') {
        return Promise.reject(new Error(`Not found: ${path}`));
      }
      return Promise.resolve(new Response('Not Found', { status: 404 }));
    }
    if (options && 'as' in options && options.as === 'text') {
      return Promise.resolve(content);
    }
    return Promise.resolve(new Response(content, { status: 200 }));
  }

  command(): ReturnType<typeof fetch> {
    throw new Error('Not implemented');
  }

  override loadModule(path: string): Promise<unknown> {
    const mod = this.modules.get(path);
    if (mod === undefined) return Promise.reject(new Error(`Module not found: ${path}`));
    return Promise.resolve(mod);
  }
}

function createTestRoute(overrides?: Partial<RouteConfig>): RouteConfig {
  return {
    pattern: '/test',
    type: 'page',
    modulePath: '/test.page.ts',
    ...overrides,
  };
}

// ============================================================================
// match() Tests
// ============================================================================

test('Pipeline.match - resolves a static route', () => {
  const routes = [createTestRoute({ pattern: '/about', modulePath: '/about.page.ts', files: { ts: '/about.page.ts' } })];
  const resolver = createResolver(routes);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.match(url('/about'));

  expect(result).toBeDefined();
  expect(result!.route.pattern).toEqual('/about');
  expect(result!.params).toEqual({});
});

test('Pipeline.match - returns params for dynamic segments', () => {
  const routes = [createTestRoute({ pattern: '/user/:id', modulePath: '/user.page.ts', files: { ts: '/user.page.ts' } })];
  const resolver = createResolver(routes);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.match(url('/user/42'));

  expect(result).toBeDefined();
  expect(result!.params).toEqual({ id: '42' });
  expect(result!.route.pattern).toEqual('/user/:id');
});

test('Pipeline.match - returns params for multiple dynamic segments', () => {
  const routes = [createTestRoute({ pattern: '/org/:orgId/repo/:repoId', modulePath: '/repo.page.ts', files: { ts: '/repo.page.ts' } })];
  const resolver = createResolver(routes);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.match(url('/org/acme/repo/widgets'));

  expect(result).toBeDefined();
  expect(result!.params).toEqual({ orgId: 'acme', repoId: 'widgets' });
});

test('Pipeline.match - returns undefined for unmatched path (404)', () => {
  const routes = [createTestRoute({ pattern: '/about', modulePath: '/about.page.ts', files: { ts: '/about.page.ts' } })];
  const resolver = createResolver(routes);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.match(url('/nonexistent'));

  expect(result).toBeUndefined();
});

test('Pipeline.match - returns default root route for "/" when no explicit root defined', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.match(url('/'));

  expect(result).toBeDefined();
  expect(result!.route).toEqual(DEFAULT_ROOT_ROUTE);
  expect(result!.params).toEqual({});
});

test('Pipeline.match - returns explicit root route when defined', () => {
  const routes = [createTestRoute({ pattern: '/', modulePath: '/index.page.ts', files: { ts: '/index.page.ts' } })];
  const resolver = createResolver(routes);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.match(url('/'));

  expect(result).toBeDefined();
  expect(result!.route.modulePath).toEqual('/index.page.ts');
});

test('Pipeline.match - ignores query params during matching', () => {
  const routes = [createTestRoute({ pattern: '/search', modulePath: '/search.page.ts', files: { ts: '/search.page.ts' } })];
  const resolver = createResolver(routes);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.match(url('/search?q=test&limit=10'));

  expect(result).toBeDefined();
  expect(result!.route.pattern).toEqual('/search');
});

test('Pipeline.match - sets type to redirect for redirect routes', () => {
  const routes = [createTestRoute({ pattern: '/old', type: 'redirect', modulePath: '/new' })];
  const resolver = createResolver(routes);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.match(url('/old'));

  expect(result).toBeDefined();
  expect(result!.route.type).toEqual('redirect');
  expect(result!.route.modulePath).toEqual('/new');
});

test('Pipeline.match - returns default root for empty pathname', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  // URL with empty pathname (rare but valid)
  const result = pipeline.match(new URL('http://test'));

  expect(result).toBeDefined();
  expect(result!.route).toEqual(DEFAULT_ROOT_ROUTE);
});

// ============================================================================
// findRoute() Tests
// ============================================================================

test('Pipeline.findRoute - finds a route by exact pattern', () => {
  const routes = [createTestRoute({ pattern: '/docs', modulePath: '/docs.page.ts', files: { ts: '/docs.page.ts' } })];
  const resolver = createResolver(routes);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.findRoute('/docs');

  expect(result).toBeDefined();
  expect(result!.pattern).toEqual('/docs');
  expect(result!.type).toEqual('page');
});

test('Pipeline.findRoute - returns undefined for non-existent pattern', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.findRoute('/nonexistent');

  expect(result).toBeUndefined();
});

// ============================================================================
// buildRouteHierarchy() Tests
// ============================================================================

test('Pipeline.buildRouteHierarchy - root pattern returns ["/"]', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  expect(pipeline.buildRouteHierarchy('/')).toEqual(['/']);
});

test('Pipeline.buildRouteHierarchy - single segment returns root + segment', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  expect(pipeline.buildRouteHierarchy('/about')).toEqual(['/', '/about']);
});

test('Pipeline.buildRouteHierarchy - multi-segment builds full ancestor chain', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  expect(pipeline.buildRouteHierarchy('/docs/guide/intro')).toEqual([
    '/',
    '/docs',
    '/docs/guide',
    '/docs/guide/intro',
  ]);
});

test('Pipeline.buildRouteHierarchy - dynamic segments are preserved', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  expect(pipeline.buildRouteHierarchy('/user/:id/settings')).toEqual([
    '/',
    '/user',
    '/user/:id',
    '/user/:id/settings',
  ]);
});

test('Pipeline.buildRouteHierarchy - deeply nested path builds complete chain', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.buildRouteHierarchy('/a/b/c/d/e');
  expect(result).toHaveLength(6);
  expect(result[0]).toEqual('/');
  expect(result[5]).toEqual('/a/b/c/d/e');
});

// ============================================================================
// loadModule() Tests
// ============================================================================

test('Pipeline.loadModule - loads from moduleLoaders map', async () => {
  const resolver = createResolver([]);
  const exported = { default: { name: 'test' } };
  const pipeline = new Pipeline({
    runtime: new MockRuntime(),
    resolver,
    moduleLoaders: {
      '/page.ts': () => Promise.resolve(exported),
    },
  });

  const result = await pipeline.loadModule('/page.ts');

  expect(result).toEqual(exported);
});

test('Pipeline.loadModule - falls back to runtime.loadModule when no loader exists', async () => {
  const runtime = new MockRuntime();
  const exported = { default: { name: 'runtime-loaded' } };
  runtime.setModule('/page.ts', exported);

  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime, resolver });

  const result = await pipeline.loadModule('/page.ts');

  expect(result).toEqual(exported);
});

test('Pipeline.loadModule - normalizes path to absolute before runtime call', async () => {
  const runtime = new MockRuntime();
  const exported = { default: 'ok' };
  runtime.setModule('/relative.ts', exported);

  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime, resolver });

  const result = await pipeline.loadModule('relative.ts');

  expect(result).toEqual(exported);
});

test('Pipeline.loadModule - caches modules after first load', async () => {
  let callCount = 0;
  const resolver = createResolver([]);
  const pipeline = new Pipeline({
    runtime: new MockRuntime(),
    resolver,
    moduleLoaders: {
      '/counted.ts': () => {
        callCount++;
        return Promise.resolve({ default: 'cached' });
      },
    },
  });

  await pipeline.loadModule('/counted.ts');
  await pipeline.loadModule('/counted.ts');
  await pipeline.loadModule('/counted.ts');

  expect(callCount).toEqual(1);
});

test('Pipeline.loadModule - rejects when module not found in runtime', async () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  await expect(pipeline.loadModule('/missing.ts')).rejects.toThrow('Module not found');
});

// ============================================================================
// getModuleFiles() Tests
// ============================================================================

test('Pipeline.getModuleFiles - returns __files from cached module', async () => {
  const resolver = createResolver([]);
  const files = { html: '<p>hello</p>', css: 'p { color: red; }' };
  const pipeline = new Pipeline({
    runtime: new MockRuntime(),
    resolver,
    moduleLoaders: {
      '/merged.ts': () => Promise.resolve({ default: {}, __files: files }),
    },
  });

  await pipeline.loadModule('/merged.ts');
  const result = pipeline.getModuleFiles('/merged.ts');

  expect(result).toEqual(files);
});

test('Pipeline.getModuleFiles - returns undefined for uncached module', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  expect(pipeline.getModuleFiles('/never-loaded.ts')).toBeUndefined();
});

test('Pipeline.getModuleFiles - returns undefined when module has no __files', async () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({
    runtime: new MockRuntime(),
    resolver,
    moduleLoaders: {
      '/no-files.ts': () => Promise.resolve({ default: {} }),
    },
  });

  await pipeline.loadModule('/no-files.ts');
  expect(pipeline.getModuleFiles('/no-files.ts')).toBeUndefined();
});

test('Pipeline.getModuleFiles - returns undefined when cached value is not an object', async () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({
    runtime: new MockRuntime(),
    resolver,
    moduleLoaders: {
      '/primitive.ts': () => Promise.resolve('just a string'),
    },
  });

  await pipeline.loadModule('/primitive.ts');
  expect(pipeline.getModuleFiles('/primitive.ts')).toBeUndefined();
});

// ============================================================================
// loadFiles() Tests
// ============================================================================

test('Pipeline.loadFiles - loads all companion files from runtime', async () => {
  const runtime = new MockRuntime();
  runtime.set('/page.html', '<h1>Hello</h1>');
  runtime.set('/page.md', '# Hello');
  runtime.set('/page.css', 'h1 { color: blue; }');

  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime, resolver });

  const files = await pipeline.loadFiles({ html: '/page.html', md: '/page.md', css: '/page.css' });

  expect(files.html).toEqual('<h1>Hello</h1>');
  expect(files.md).toEqual('# Hello');
  expect(files.css).toEqual('h1 { color: blue; }');
});

test('Pipeline.loadFiles - loads only specified files', async () => {
  const runtime = new MockRuntime();
  runtime.set('/page.html', '<p>Content</p>');

  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime, resolver });

  const files = await pipeline.loadFiles({ html: '/page.html' });

  expect(files.html).toEqual('<p>Content</p>');
  expect(files.md).toBeUndefined();
  expect(files.css).toBeUndefined();
});

test('Pipeline.loadFiles - returns empty object when no files specified', async () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const files = await pipeline.loadFiles({});

  expect(files).toEqual({});
});

test('Pipeline.loadFiles - gracefully handles missing files', async () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const files = await pipeline.loadFiles({ html: '/missing.html' });

  expect(files.html).toBeUndefined();
});

test('Pipeline.loadFiles - caches loaded files across calls', async () => {
  const runtime = new MockRuntime();
  runtime.set('/cached.html', '<p>cached</p>');

  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime, resolver });

  const first = await pipeline.loadFiles({ html: '/cached.html' });
  // Remove from runtime to prove it uses cache
  runtime.set('/cached.html', '<p>CHANGED</p>');
  const second = await pipeline.loadFiles({ html: '/cached.html' });

  expect(first.html).toEqual('<p>cached</p>');
  expect(second.html).toEqual('<p>cached</p>');
});

test('Pipeline.loadFiles - normalizes relative paths to absolute', async () => {
  const runtime = new MockRuntime();
  runtime.set('/relative.html', '<p>relative</p>');

  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime, resolver });

  const files = await pipeline.loadFiles({ html: 'relative.html' });

  expect(files.html).toEqual('<p>relative</p>');
});

// ============================================================================
// toRouteInfo() Tests
// ============================================================================

test('Pipeline.toRouteInfo - builds RouteInfo from MatchedRoute and URL', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const matched = {
    route: createTestRoute({ pattern: '/user/:id' }),
    params: { id: '7' },
  };
  const testUrl = url('/user/7?tab=profile');
  const info = pipeline.toRouteInfo(matched, testUrl);

  expect(info.url).toBe(testUrl);
  expect(info.params).toEqual({ id: '7' });
});

// ============================================================================
// buildContext() Tests
// ============================================================================

test('Pipeline.buildContext - constructs base context with url, params, pathname, searchParams', async () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const testUrl = url('/page?q=hello');
  const routeInfo = { url: testUrl, params: { id: '1' } };
  const route = createTestRoute({ pattern: '/page' });

  const ctx = await pipeline.buildContext(routeInfo, route);

  expect(ctx.url).toBe(testUrl);
  expect(ctx.params).toEqual({ id: '1' });
  expect(ctx.pathname).toEqual('/page');
  expect(ctx.searchParams.get('q')).toEqual('hello');
});

test('Pipeline.buildContext - includes files from route companion files', async () => {
  const runtime = new MockRuntime();
  runtime.set('/page.html', '<p>html</p>');
  runtime.set('/page.css', 'p {}');

  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime, resolver });

  const route = createTestRoute({
    pattern: '/page',
    files: { html: '/page.html', css: '/page.css' },
  });
  const routeInfo = { url: url('/page'), params: {} };

  const ctx = await pipeline.buildContext(routeInfo, route);

  expect(ctx.files?.html).toEqual('<p>html</p>');
  expect(ctx.files?.css).toEqual('p {}');
});

test('Pipeline.buildContext - uses inlined __files from merged module when available', async () => {
  const resolver = createResolver([]);
  const inlinedFiles = { html: '<p>inlined</p>', md: '# inlined' };
  const pipeline = new Pipeline({
    runtime: new MockRuntime(),
    resolver,
    moduleLoaders: {
      '/merged.ts': () => Promise.resolve({ default: {}, __files: inlinedFiles }),
    },
  });

  // Pre-load so module is cached
  await pipeline.loadModule('/merged.ts');

  const route = createTestRoute({
    pattern: '/page',
    modulePath: '/merged.ts',
    files: { ts: '/merged.ts', html: '/should-not-load.html' },
  });
  const routeInfo = { url: url('/page'), params: {} };

  const ctx = await pipeline.buildContext(routeInfo, route);

  expect(ctx.files).toEqual(inlinedFiles);
});

test('Pipeline.buildContext - returns empty files when route has no files property', async () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const route = createTestRoute({ pattern: '/bare', files: undefined });
  const routeInfo = { url: url('/bare'), params: {} };

  const ctx = await pipeline.buildContext(routeInfo, route);

  expect(ctx.files).toEqual({});
});

test('Pipeline.buildContext - passes signal when provided', async () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const controller = new AbortController();
  const route = createTestRoute({ pattern: '/sig' });
  const routeInfo = { url: url('/sig'), params: {} };

  const ctx = await pipeline.buildContext(routeInfo, route, controller.signal);

  expect(ctx.signal).toBe(controller.signal);
});

test('Pipeline.buildContext - omits signal when not provided', async () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const route = createTestRoute({ pattern: '/no-sig' });
  const routeInfo = { url: url('/no-sig'), params: {} };

  const ctx = await pipeline.buildContext(routeInfo, route);

  expect(ctx.signal).toBeUndefined();
});

test('Pipeline.buildContext - passes isLeaf when provided', async () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const route = createTestRoute({ pattern: '/leaf' });
  const routeInfo = { url: url('/leaf'), params: {} };

  const ctxLeaf = await pipeline.buildContext(routeInfo, route, undefined, true);
  const ctxNonLeaf = await pipeline.buildContext(routeInfo, route, undefined, false);

  expect(ctxLeaf.isLeaf).toEqual(true);
  expect(ctxNonLeaf.isLeaf).toEqual(false);
});

test('Pipeline.buildContext - omits isLeaf when not provided', async () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const route = createTestRoute({ pattern: '/no-leaf' });
  const routeInfo = { url: url('/no-leaf'), params: {} };

  const ctx = await pipeline.buildContext(routeInfo, route);

  expect(ctx.isLeaf).toBeUndefined();
});

// ============================================================================
// contextProvider Tests
// ============================================================================

test('Pipeline.buildContext - contextProvider enriches base context', async () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({
    runtime: new MockRuntime(),
    resolver,
    contextProvider: (base) => ({ ...base, custom: 'enriched' }) as ComponentContext & { custom: string },
  });

  const route = createTestRoute({ pattern: '/enriched' });
  const routeInfo = { url: url('/enriched'), params: {} };

  const ctx = await pipeline.buildContext(routeInfo, route) as ComponentContext & { custom: string };

  expect(ctx.custom).toEqual('enriched');
  expect(ctx.pathname).toEqual('/enriched');
});

test('Pipeline.contextProvider - is undefined when not provided', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  expect(pipeline.contextProvider).toBeUndefined();
});

test('Pipeline.contextProvider - is set when provided', () => {
  const provider = (base: ComponentContext) => base;
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver, contextProvider: provider });

  expect(pipeline.contextProvider).toBe(provider);
});

// ============================================================================
// getStatusPage() Tests
// ============================================================================

test('Pipeline.getStatusPage - returns registered status page', () => {
  const statusPageRoute = createTestRoute({
    pattern: '/404',
    modulePath: '/404.page.ts',
    files: { ts: '/404.page.ts' },
  });
  const resolver = createResolver([], { statusPages: new Map([[404, statusPageRoute]]) });
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.getStatusPage(404);

  expect(result).toBeDefined();
  expect(result!.pattern).toEqual('/404');
  expect(result!.modulePath).toEqual('/404.page.ts');
});

test('Pipeline.getStatusPage - returns undefined for unregistered status', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  expect(pipeline.getStatusPage(404)).toBeUndefined();
  expect(pipeline.getStatusPage(500)).toBeUndefined();
});

test('Pipeline.getStatusPage - supports 500 status page', () => {
  const statusPageRoute = createTestRoute({
    pattern: '/500',
    modulePath: '/500.page.ts',
    files: { ts: '/500.page.ts' },
  });
  const resolver = createResolver([], { statusPages: new Map([[500, statusPageRoute]]) });
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.getStatusPage(500);

  expect(result).toBeDefined();
  expect(result!.pattern).toEqual('/500');
});

// ============================================================================
// findErrorBoundary() Tests
// ============================================================================

test('Pipeline.findErrorBoundary - finds error boundary for matching path', () => {
  const resolver = createResolver([], {
    errorBoundaries: [{ pattern: '/admin', modulePath: '/admin.error.ts' }],
  });
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.findErrorBoundary('/admin/users');

  expect(result).toBeDefined();
  expect(result!.modulePath).toEqual('/admin.error.ts');
});

test('Pipeline.findErrorBoundary - returns undefined when no boundary matches', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  expect(pipeline.findErrorBoundary('/any/path')).toBeUndefined();
});

// ============================================================================
// getErrorHandler() Tests
// ============================================================================

test('Pipeline.getErrorHandler - returns root error handler when registered', () => {
  const errorHandler = createTestRoute({ pattern: '/', type: 'error', modulePath: '/root.error.ts' });
  const resolver = createResolver([], { errorHandler });
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.getErrorHandler();

  expect(result).toBeDefined();
  expect(result!.type).toEqual('error');
  expect(result!.modulePath).toEqual('/root.error.ts');
});

test('Pipeline.getErrorHandler - returns undefined when no root error handler', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  expect(pipeline.getErrorHandler()).toBeUndefined();
});

// ============================================================================
// DEFAULT_ROOT_ROUTE Tests
// ============================================================================

test('DEFAULT_ROOT_ROUTE - has correct shape', () => {
  expect(DEFAULT_ROOT_ROUTE.pattern).toEqual('/');
  expect(DEFAULT_ROOT_ROUTE.type).toEqual('page');
  expect(DEFAULT_ROOT_ROUTE.modulePath).toEqual('__default_root__');
});

// ============================================================================
// Edge Cases
// ============================================================================

test('Pipeline.match - handles route with files containing all companion types', () => {
  const routes = [createTestRoute({
    pattern: '/full',
    modulePath: '/full.page.ts',
    files: { ts: '/full.page.ts', html: '/full.page.html', md: '/full.page.md', css: '/full.page.css' },
  })];
  const resolver = createResolver(routes);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.match(url('/full'));

  expect(result).toBeDefined();
  expect(result!.route.files?.ts).toEqual('/full.page.ts');
  expect(result!.route.files?.html).toEqual('/full.page.html');
  expect(result!.route.files?.md).toEqual('/full.page.md');
  expect(result!.route.files?.css).toEqual('/full.page.css');
});

test('Pipeline.match - handles URL with hash fragment', () => {
  const routes = [createTestRoute({ pattern: '/docs', modulePath: '/docs.page.ts', files: { ts: '/docs.page.ts' } })];
  const resolver = createResolver(routes);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const result = pipeline.match(url('/docs#section'));

  expect(result).toBeDefined();
  expect(result!.route.pattern).toEqual('/docs');
});

test('Pipeline.loadModule - moduleLoaders take precedence over runtime', async () => {
  const runtime = new MockRuntime();
  runtime.setModule('/page.ts', { default: 'from-runtime' });

  const resolver = createResolver([]);
  const pipeline = new Pipeline({
    runtime,
    resolver,
    moduleLoaders: {
      '/page.ts': () => Promise.resolve({ default: 'from-loader' }),
    },
  });

  const result = await pipeline.loadModule<{ default: string }>('/page.ts');

  expect(result.default).toEqual('from-loader');
});

test('Pipeline - constructor defaults moduleLoaders to empty object', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  // Should not throw when trying to load (will fall through to runtime)
  expect(pipeline.loadModule('/anything.ts')).rejects.toThrow();
});

test('Pipeline.buildContext - searchParams are accessible from context', async () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  const testUrl = url('/search?q=hello&page=2&sort=desc');
  const routeInfo = { url: testUrl, params: {} };
  const route = createTestRoute({ pattern: '/search' });

  const ctx = await pipeline.buildContext(routeInfo, route);

  expect(ctx.searchParams.get('q')).toEqual('hello');
  expect(ctx.searchParams.get('page')).toEqual('2');
  expect(ctx.searchParams.get('sort')).toEqual('desc');
});

test('Pipeline.buildRouteHierarchy - two segments return root plus both', () => {
  const resolver = createResolver([]);
  const pipeline = new Pipeline({ runtime: new MockRuntime(), resolver });

  expect(pipeline.buildRouteHierarchy('/foo/bar')).toEqual(['/', '/foo', '/foo/bar']);
});
