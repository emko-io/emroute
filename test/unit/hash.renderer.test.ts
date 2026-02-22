/**
 * Unit tests for Hash Router
 *
 * Tests cover:
 * - Internal manifest building from inline route definitions
 * - RouteCore matching with hash-derived URLs (no basePath)
 * - Parameter extraction from hash patterns
 * - Route hierarchy building for nested hash routes
 * - Module loading via inline loaders
 * - Context provider integration
 * - Event emission
 */

import { test, expect, describe } from 'bun:test';
import { RouteCore } from '../../src/route/route.core.ts';
import type { RoutesManifest } from '../../src/type/route.type.ts';
import { PageComponent } from '../../src/component/page.component.ts';
import type { ComponentContext, ContextProvider } from '../../src/component/abstract.component.ts';

/** Build a mini-manifest the same way HashRouter.buildManifest does internally. */
function buildHashManifest(
  routes: { pattern: string; loader: () => Promise<unknown> }[],
): RoutesManifest {
  return {
    routes: routes.map((r) => ({
      pattern: r.pattern,
      type: 'page' as const,
      modulePath: r.pattern,
      files: { ts: r.pattern },
    })),
    errorBoundaries: [],
    statusPages: new Map(),
    moduleLoaders: Object.fromEntries(
      routes.map((r) => [r.pattern, r.loader]),
    ),
  };
}

/** Minimal PageComponent for testing. */
class TestPage extends PageComponent {
  override readonly name: string;
  private html: string;
  private title: string | undefined;

  constructor(name: string, html: string, title?: string) {
    super();
    this.name = name;
    this.html = html;
    this.title = title;
  }

  override renderHTML() {
    return this.html;
  }

  override getTitle() {
    return this.title;
  }
}

// -- Manifest Building --

test('HashRouter manifest - routes are mapped correctly', () => {
  const loader = () => Promise.resolve({ default: new TestPage('test', '<h1>Test</h1>') });
  const manifest = buildHashManifest([
    { pattern: '/', loader },
    { pattern: '/settings', loader },
    { pattern: '/users/:id', loader },
  ]);

  expect(manifest.routes.length).toEqual(3);
  expect(manifest.routes[0].pattern).toEqual('/');
  expect(manifest.routes[1].pattern).toEqual('/settings');
  expect(manifest.routes[2].pattern).toEqual('/users/:id');

  // All routes are pages with ts files pointing to pattern
  for (const route of manifest.routes) {
    expect(route.type).toEqual('page');
    expect(route.modulePath).toEqual(route.pattern);
    expect(route.files?.ts).toEqual(route.pattern);
  }
});

test('HashRouter manifest - moduleLoaders use pattern as key', () => {
  const loader1 = () => Promise.resolve({ default: 'a' });
  const loader2 = () => Promise.resolve({ default: 'b' });
  const manifest = buildHashManifest([
    { pattern: '/foo', loader: loader1 },
    { pattern: '/bar', loader: loader2 },
  ]);

  expect(typeof manifest.moduleLoaders!['/foo']).toEqual('function');
  expect(typeof manifest.moduleLoaders!['/bar']).toEqual('function');
  // Loaders are the originals
  expect(manifest.moduleLoaders!['/foo']).toEqual(loader1);
  expect(manifest.moduleLoaders!['/bar']).toEqual(loader2);
});

test('HashRouter manifest - no error boundaries or status pages', () => {
  const manifest = buildHashManifest([
    { pattern: '/', loader: () => Promise.resolve({}) },
  ]);

  expect(manifest.errorBoundaries.length).toEqual(0);
  expect(manifest.statusPages.size).toEqual(0);
});

// -- Route Matching (no basePath) --

test('HashRouter matching - static routes', () => {
  const manifest = buildHashManifest([
    { pattern: '/', loader: () => Promise.resolve({}) },
    { pattern: '/settings', loader: () => Promise.resolve({}) },
    { pattern: '/about', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  // '#/' -> match '/'
  const root = core.match(new URL('/', 'http://localhost'));
  expect(root).toBeDefined();
  expect(root!.route.pattern).toEqual('/');

  // '#/settings' -> match '/settings'
  const settings = core.match(new URL('/settings', 'http://localhost'));
  expect(settings).toBeDefined();
  expect(settings!.route.pattern).toEqual('/settings');

  // '#/about' -> match '/about'
  const about = core.match(new URL('/about', 'http://localhost'));
  expect(about).toBeDefined();
  expect(about!.route.pattern).toEqual('/about');
});

test('HashRouter matching - dynamic segments', () => {
  const manifest = buildHashManifest([
    { pattern: '/users/:id', loader: () => Promise.resolve({}) },
    { pattern: '/projects/:pid/tasks/:tid', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const user = core.match(new URL('/users/42', 'http://localhost'));
  expect(user).toBeDefined();
  expect(user!.route.pattern).toEqual('/users/:id');
  expect(user!.params).toEqual({ id: '42' });

  const task = core.match(new URL('/projects/p1/tasks/t2', 'http://localhost'));
  expect(task).toBeDefined();
  expect(task!.route.pattern).toEqual('/projects/:pid/tasks/:tid');
  expect(task!.params).toEqual({ pid: 'p1', tid: 't2' });
});

test('HashRouter matching - unmatched path returns undefined', () => {
  const manifest = buildHashManifest([
    { pattern: '/settings', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const result = core.match(new URL('/nonexistent', 'http://localhost'));
  expect(result).toEqual(undefined);
});

test('HashRouter matching - no basePath prefix', () => {
  const manifest = buildHashManifest([
    { pattern: '/settings', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  // Should NOT match with /html prefix
  const withPrefix = core.match(new URL('/html/settings', 'http://localhost'));
  expect(withPrefix).toEqual(undefined);

  // Should match bare path
  const bare = core.match(new URL('/settings', 'http://localhost'));
  expect(bare).toBeDefined();
});

// -- Route Hierarchy --

test('HashRouter hierarchy - flat routes', () => {
  const manifest = buildHashManifest([
    { pattern: '/settings', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const hierarchy = core.buildRouteHierarchy('/settings');
  expect(hierarchy).toEqual(['/', '/settings']);
});

test('HashRouter hierarchy - nested routes', () => {
  const manifest = buildHashManifest([
    { pattern: '/settings', loader: () => Promise.resolve({}) },
    { pattern: '/settings/account', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const hierarchy = core.buildRouteHierarchy('/settings/account');
  expect(hierarchy).toEqual(['/', '/settings', '/settings/account']);
});

test('HashRouter hierarchy - root route', () => {
  const manifest = buildHashManifest([
    { pattern: '/', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const hierarchy = core.buildRouteHierarchy('/');
  expect(hierarchy).toEqual(['/']);
});

// -- Module Loading --

test('HashRouter module loading - uses inline loader', async () => {
  const page = new TestPage('test', '<h1>Test</h1>');
  const manifest = buildHashManifest([
    { pattern: '/test', loader: () => Promise.resolve({ default: page }) },
  ]);
  const core = new RouteCore(manifest);

  // loadModule uses the moduleLoaders map, keyed by pattern
  const mod = await core.loadModule<{ default: TestPage }>('/test');
  expect(mod.default).toEqual(page);
});

test('HashRouter module loading - caches loaded modules', async () => {
  let callCount = 0;
  const page = new TestPage('test', '<h1>Test</h1>');
  const manifest = buildHashManifest([
    {
      pattern: '/test',
      loader: () => {
        callCount++;
        return Promise.resolve({ default: page });
      },
    },
  ]);
  const core = new RouteCore(manifest);

  await core.loadModule('/test');
  await core.loadModule('/test');
  expect(callCount).toEqual(1);
});

// -- toRouteInfo --

test('HashRouter toRouteInfo - builds correct route info', () => {
  const manifest = buildHashManifest([
    { pattern: '/users/:id', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const matched = core.match(new URL('/users/99', 'http://localhost'));
  expect(matched).toBeDefined();

  const info = core.toRouteInfo(matched!, '/users/99');
  expect(info.pathname).toEqual('/users/99');
  expect(info.pattern).toEqual('/users/:id');
  expect(info.params).toEqual({ id: '99' });
});

// -- Context Provider --

test('HashRouter context - extends context via provider', async () => {
  const manifest = buildHashManifest([
    { pattern: '/test', loader: () => Promise.resolve({}) },
  ]);
  const extendContext: ContextProvider = (base) => ({
    ...base,
    custom: 'value',
  });
  const core = new RouteCore(manifest, { extendContext });

  const matched = core.match(new URL('/test', 'http://localhost'));
  expect(matched).toBeDefined();

  const routeInfo = core.toRouteInfo(matched!, '/test');
  const context = await core.buildComponentContext(routeInfo, matched!.route);
  expect((context as ComponentContext & { custom: string }).custom).toEqual('value');
});

test('HashRouter context - no basePath in context', async () => {
  const manifest = buildHashManifest([
    { pattern: '/test', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const matched = core.match(new URL('/test', 'http://localhost'));
  expect(matched).toBeDefined();

  const routeInfo = core.toRouteInfo(matched!, '/test');
  const context = await core.buildComponentContext(routeInfo, matched!.route);
  // No basePath set -> context.basePath is undefined
  expect(context.basePath).toEqual(undefined);
});

// -- Event Emission --

test('HashRouter events - emits to listeners', () => {
  const manifest = buildHashManifest([]);
  const core = new RouteCore(manifest);

  const events: { type: string; pathname: string }[] = [];
  core.addEventListener((e) => events.push({ type: e.type, pathname: e.pathname }));

  core.emit({ type: 'navigate', pathname: '/test', params: {} });
  core.emit({ type: 'load', pathname: '/test', params: {} });

  expect(events.length).toEqual(2);
  expect(events[0].type).toEqual('navigate');
  expect(events[1].type).toEqual('load');
});

test('HashRouter events - removeListener stops emission', () => {
  const manifest = buildHashManifest([]);
  const core = new RouteCore(manifest);

  const events: string[] = [];
  const remove = core.addEventListener((e) => events.push(e.type));

  core.emit({ type: 'navigate', pathname: '/', params: {} });
  remove();
  core.emit({ type: 'navigate', pathname: '/', params: {} });

  expect(events.length).toEqual(1);
});

// -- buildComponentContext with no files --

test('HashRouter context - no file fetching for hash routes', async () => {
  const manifest = buildHashManifest([
    { pattern: '/test', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const matched = core.match(new URL('/test', 'http://localhost'));
  expect(matched).toBeDefined();

  const routeInfo = core.toRouteInfo(matched!, '/test');
  // files.ts = '/test' but html, md, css are undefined -> no fetch attempts
  const context = await core.buildComponentContext(routeInfo, matched!.route);

  // Files should have ts but no html/md/css content
  expect(context.files?.html).toEqual(undefined);
  expect(context.files?.md).toEqual(undefined);
  expect(context.files?.css).toEqual(undefined);
});

// -- Wildcard and catch-all patterns --

test('HashRouter matching - wildcard catch-all', () => {
  const manifest = buildHashManifest([
    { pattern: '/docs/:rest*', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const shallow = core.match(new URL('/docs/intro', 'http://localhost'));
  expect(shallow).toBeDefined();
  expect(shallow!.params.rest).toEqual('intro');

  const deep = core.match(new URL('/docs/guide/getting-started', 'http://localhost'));
  expect(deep).toBeDefined();
  expect(deep!.params.rest).toEqual('guide/getting-started');
});

// -- Query string preservation --

test('HashRouter matching - preserves search params', () => {
  const manifest = buildHashManifest([
    { pattern: '/search', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const url = new URL('/search?q=hello&page=2', 'http://localhost');
  const matched = core.match(url);
  expect(matched).toBeDefined();
  expect(matched!.searchParams?.get('q')).toEqual('hello');
  expect(matched!.searchParams?.get('page')).toEqual('2');
});
