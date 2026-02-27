/**
 * Unit tests for Hash Router
 *
 * Tests cover:
 * - Internal route tree building from inline route definitions
 * - RouteCore matching with hash-derived URLs (no basePath)
 * - Parameter extraction from hash patterns
 * - Route hierarchy building for nested hash routes
 * - Module loading via inline loaders
 * - Context provider integration
 * - Event emission
 */

import { test, expect, describe } from 'bun:test';
import { RouteCore } from '../../src/route/route.core.ts';
import { PageComponent } from '../../src/component/page.component.ts';
import type { ComponentContext, ContextProvider } from '../../src/component/abstract.component.ts';
import { createResolver } from './test.util.ts';
import type { RouteResolver } from '../../src/route/route.resolver.ts';

// deno-lint-ignore no-explicit-any
const asAny = (v: unknown): any => v;

/** Build a RouteResolver + moduleLoaders from inline hash route definitions. */
function buildHashResolver(
  routes: { pattern: string; loader: () => Promise<unknown> }[],
): { resolver: RouteResolver; moduleLoaders: Record<string, () => Promise<unknown>> } {
  const routeConfigs = routes.map((r) => ({
    pattern: r.pattern,
    type: 'page' as const,
    modulePath: r.pattern,
    files: { ts: r.pattern },
  }));
  return {
    resolver: createResolver(routeConfigs),
    moduleLoaders: Object.fromEntries(routes.map((r) => [r.pattern, r.loader])),
  };
}

/** Create a RouteCore from hash route definitions. */
function createHashCore(
  routes: { pattern: string; loader: () => Promise<unknown> }[],
  options?: { extendContext?: ContextProvider },
) {
  const { resolver, moduleLoaders } = buildHashResolver(routes);
  return new RouteCore(resolver, { moduleLoaders, ...options });
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

// -- Route Tree Building --

test('HashRouter route tree - resolver matches built routes', () => {
  const loader = () => Promise.resolve({ default: new TestPage('test', '<h1>Test</h1>') });
  const { resolver } = buildHashResolver([
    { pattern: '/', loader },
    { pattern: '/settings', loader },
    { pattern: '/users/:id', loader },
  ]);

  expect(resolver.match('/')).toBeDefined();
  expect(resolver.match('/settings')).toBeDefined();
  expect(resolver.match('/users/42')).toBeDefined();
  expect(resolver.match('/users/42')!.params).toEqual({ id: '42' });
});

test('HashRouter route tree - moduleLoaders use pattern as key', () => {
  const loader1 = () => Promise.resolve({ default: 'a' });
  const loader2 = () => Promise.resolve({ default: 'b' });
  const { moduleLoaders } = buildHashResolver([
    { pattern: '/foo', loader: loader1 },
    { pattern: '/bar', loader: loader2 },
  ]);

  expect(typeof moduleLoaders['/foo']).toEqual('function');
  expect(typeof moduleLoaders['/bar']).toEqual('function');
  expect(moduleLoaders['/foo']).toEqual(loader1);
  expect(moduleLoaders['/bar']).toEqual(loader2);
});

test('HashRouter route tree - no error boundaries', () => {
  const { resolver } = buildHashResolver([
    { pattern: '/', loader: () => Promise.resolve({}) },
  ]);

  // Error boundary search returns undefined for routes without boundaries
  expect(resolver.findErrorBoundary('/missing')).toEqual(undefined);
});

// -- Route Matching (no basePath) --

test('HashRouter matching - static routes', () => {
  const core = createHashCore([
    { pattern: '/', loader: () => Promise.resolve({}) },
    { pattern: '/settings', loader: () => Promise.resolve({}) },
    { pattern: '/about', loader: () => Promise.resolve({}) },
  ]);

  const root = core.match(new URL('/', 'http://localhost'));
  expect(root).toBeDefined();
  expect(root!.route.pattern).toEqual('/');

  const settings = core.match(new URL('/settings', 'http://localhost'));
  expect(settings).toBeDefined();
  expect(settings!.route.pattern).toEqual('/settings');

  const about = core.match(new URL('/about', 'http://localhost'));
  expect(about).toBeDefined();
  expect(about!.route.pattern).toEqual('/about');
});

test('HashRouter matching - dynamic segments', () => {
  const core = createHashCore([
    { pattern: '/users/:id', loader: () => Promise.resolve({}) },
    { pattern: '/projects/:pid/tasks/:tid', loader: () => Promise.resolve({}) },
  ]);

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
  const core = createHashCore([
    { pattern: '/settings', loader: () => Promise.resolve({}) },
  ]);

  const result = core.match(new URL('/nonexistent', 'http://localhost'));
  expect(result).toEqual(undefined);
});

test('HashRouter matching - no basePath prefix', () => {
  const core = createHashCore([
    { pattern: '/settings', loader: () => Promise.resolve({}) },
  ]);

  const withPrefix = core.match(new URL('/html/settings', 'http://localhost'));
  expect(withPrefix).toEqual(undefined);

  const bare = core.match(new URL('/settings', 'http://localhost'));
  expect(bare).toBeDefined();
});

// -- Route Hierarchy --

test('HashRouter hierarchy - flat routes', () => {
  const core = createHashCore([
    { pattern: '/settings', loader: () => Promise.resolve({}) },
  ]);

  const hierarchy = core.buildRouteHierarchy('/settings');
  expect(hierarchy).toEqual(['/', '/settings']);
});

test('HashRouter hierarchy - nested routes', () => {
  const core = createHashCore([
    { pattern: '/settings', loader: () => Promise.resolve({}) },
    { pattern: '/settings/account', loader: () => Promise.resolve({}) },
  ]);

  const hierarchy = core.buildRouteHierarchy('/settings/account');
  expect(hierarchy).toEqual(['/', '/settings', '/settings/account']);
});

test('HashRouter hierarchy - root route', () => {
  const core = createHashCore([
    { pattern: '/', loader: () => Promise.resolve({}) },
  ]);

  const hierarchy = core.buildRouteHierarchy('/');
  expect(hierarchy).toEqual(['/']);
});

// -- Module Loading --

test('HashRouter module loading - uses inline loader', async () => {
  const page = new TestPage('test', '<h1>Test</h1>');
  const core = createHashCore([
    { pattern: '/test', loader: () => Promise.resolve({ default: page }) },
  ]);

  const mod = await core.loadModule<{ default: TestPage }>('/test');
  expect(mod.default).toEqual(page);
});

test('HashRouter module loading - caches loaded modules', async () => {
  let callCount = 0;
  const page = new TestPage('test', '<h1>Test</h1>');
  const core = createHashCore([
    {
      pattern: '/test',
      loader: () => {
        callCount++;
        return Promise.resolve({ default: page });
      },
    },
  ]);

  await core.loadModule('/test');
  await core.loadModule('/test');
  expect(callCount).toEqual(1);
});

// -- toRouteInfo --

test('HashRouter toRouteInfo - builds correct route info', () => {
  const core = createHashCore([
    { pattern: '/users/:id', loader: () => Promise.resolve({}) },
  ]);

  const matched = core.match(new URL('/users/99', 'http://localhost'));
  expect(matched).toBeDefined();

  const info = core.toRouteInfo(matched!, new URL('/users/99', 'http://localhost'));
  expect(info.url.pathname).toEqual('/users/99');
  expect(info.params).toEqual({ id: '99' });
});

// -- Context Provider --

test('HashRouter context - extends context via provider', async () => {
  const extendContext: ContextProvider = (base) => ({
    ...base,
    custom: 'value',
  });
  const core = createHashCore(
    [{ pattern: '/test', loader: () => Promise.resolve({}) }],
    { extendContext },
  );

  const matched = core.match(new URL('/test', 'http://localhost'));
  expect(matched).toBeDefined();

  const routeInfo = core.toRouteInfo(matched!, new URL('/test', 'http://localhost'));
  const context = await core.buildComponentContext(routeInfo, matched!.route);
  expect((context as ComponentContext & { custom: string }).custom).toEqual('value');
});

test('HashRouter context - no basePath in context', async () => {
  const core = createHashCore([
    { pattern: '/test', loader: () => Promise.resolve({}) },
  ]);

  const matched = core.match(new URL('/test', 'http://localhost'));
  expect(matched).toBeDefined();

  const routeInfo = core.toRouteInfo(matched!, new URL('/test', 'http://localhost'));
  const context = await core.buildComponentContext(routeInfo, matched!.route);
  expect(asAny(context).basePath).toEqual(undefined);
});

// -- Event Emission --

test('HashRouter events - emits to listeners', () => {
  const core = createHashCore([]);

  const events: { type: string; pathname: string }[] = [];
  core.addEventListener((e) => events.push({ type: e.type, pathname: e.pathname }));

  core.emit({ type: 'navigate', pathname: '/test', params: {} });
  core.emit({ type: 'load', pathname: '/test', params: {} });

  expect(events.length).toEqual(2);
  expect(events[0].type).toEqual('navigate');
  expect(events[1].type).toEqual('load');
});

test('HashRouter events - removeListener stops emission', () => {
  const core = createHashCore([]);

  const events: string[] = [];
  const remove = core.addEventListener((e) => events.push(e.type));

  core.emit({ type: 'navigate', pathname: '/', params: {} });
  remove();
  core.emit({ type: 'navigate', pathname: '/', params: {} });

  expect(events.length).toEqual(1);
});

// -- buildComponentContext with no files --

test('HashRouter context - no file fetching for hash routes', async () => {
  const core = createHashCore([
    { pattern: '/test', loader: () => Promise.resolve({}) },
  ]);

  const matched = core.match(new URL('/test', 'http://localhost'));
  expect(matched).toBeDefined();

  const routeInfo = core.toRouteInfo(matched!, new URL('/test', 'http://localhost'));
  const context = await core.buildComponentContext(routeInfo, matched!.route);

  expect(context.files?.html).toEqual(undefined);
  expect(context.files?.md).toEqual(undefined);
  expect(context.files?.css).toEqual(undefined);
});

// -- Wildcard and catch-all patterns --

test('HashRouter matching - wildcard catch-all', () => {
  const core = createHashCore([
    { pattern: '/docs/:rest*', loader: () => Promise.resolve({}) },
  ]);

  const shallow = core.match(new URL('/docs/intro', 'http://localhost'));
  expect(shallow).toBeDefined();
  expect(shallow!.params.rest).toEqual('intro');

  const deep = core.match(new URL('/docs/guide/getting-started', 'http://localhost'));
  expect(deep).toBeDefined();
  expect(deep!.params.rest).toEqual('guide/getting-started');
});

// -- Query string preservation --

test('HashRouter matching - preserves search params', () => {
  const core = createHashCore([
    { pattern: '/search', loader: () => Promise.resolve({}) },
  ]);

  const url = new URL('/search?q=hello&page=2', 'http://localhost');
  const matched = core.match(url);
  expect(matched).toBeDefined();
  // Search params come from the URL, not the match result
  expect(url.searchParams.get('q')).toEqual('hello');
  expect(url.searchParams.get('page')).toEqual('2');
});
