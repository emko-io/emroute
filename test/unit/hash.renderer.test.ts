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

import { assertEquals, assertExists } from '@std/assert';
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

// ── Manifest Building ──────────────────────────────────────────────

Deno.test('HashRouter manifest — routes are mapped correctly', () => {
  const loader = () => Promise.resolve({ default: new TestPage('test', '<h1>Test</h1>') });
  const manifest = buildHashManifest([
    { pattern: '/', loader },
    { pattern: '/settings', loader },
    { pattern: '/users/:id', loader },
  ]);

  assertEquals(manifest.routes.length, 3);
  assertEquals(manifest.routes[0].pattern, '/');
  assertEquals(manifest.routes[1].pattern, '/settings');
  assertEquals(manifest.routes[2].pattern, '/users/:id');

  // All routes are pages with ts files pointing to pattern
  for (const route of manifest.routes) {
    assertEquals(route.type, 'page');
    assertEquals(route.modulePath, route.pattern);
    assertEquals(route.files?.ts, route.pattern);
  }
});

Deno.test('HashRouter manifest — moduleLoaders use pattern as key', () => {
  const loader1 = () => Promise.resolve({ default: 'a' });
  const loader2 = () => Promise.resolve({ default: 'b' });
  const manifest = buildHashManifest([
    { pattern: '/foo', loader: loader1 },
    { pattern: '/bar', loader: loader2 },
  ]);

  assertEquals(typeof manifest.moduleLoaders!['/foo'], 'function');
  assertEquals(typeof manifest.moduleLoaders!['/bar'], 'function');
  // Loaders are the originals
  assertEquals(manifest.moduleLoaders!['/foo'], loader1);
  assertEquals(manifest.moduleLoaders!['/bar'], loader2);
});

Deno.test('HashRouter manifest — no error boundaries or status pages', () => {
  const manifest = buildHashManifest([
    { pattern: '/', loader: () => Promise.resolve({}) },
  ]);

  assertEquals(manifest.errorBoundaries.length, 0);
  assertEquals(manifest.statusPages.size, 0);
});

// ── Route Matching (no basePath) ───────────────────────────────────

Deno.test('HashRouter matching — static routes', () => {
  const manifest = buildHashManifest([
    { pattern: '/', loader: () => Promise.resolve({}) },
    { pattern: '/settings', loader: () => Promise.resolve({}) },
    { pattern: '/about', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  // '#/' → match '/'
  const root = core.match(new URL('/', 'http://localhost'));
  assertExists(root);
  assertEquals(root.route.pattern, '/');

  // '#/settings' → match '/settings'
  const settings = core.match(new URL('/settings', 'http://localhost'));
  assertExists(settings);
  assertEquals(settings.route.pattern, '/settings');

  // '#/about' → match '/about'
  const about = core.match(new URL('/about', 'http://localhost'));
  assertExists(about);
  assertEquals(about.route.pattern, '/about');
});

Deno.test('HashRouter matching — dynamic segments', () => {
  const manifest = buildHashManifest([
    { pattern: '/users/:id', loader: () => Promise.resolve({}) },
    { pattern: '/projects/:pid/tasks/:tid', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const user = core.match(new URL('/users/42', 'http://localhost'));
  assertExists(user);
  assertEquals(user.route.pattern, '/users/:id');
  assertEquals(user.params, { id: '42' });

  const task = core.match(new URL('/projects/p1/tasks/t2', 'http://localhost'));
  assertExists(task);
  assertEquals(task.route.pattern, '/projects/:pid/tasks/:tid');
  assertEquals(task.params, { pid: 'p1', tid: 't2' });
});

Deno.test('HashRouter matching — unmatched path returns undefined', () => {
  const manifest = buildHashManifest([
    { pattern: '/settings', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const result = core.match(new URL('/nonexistent', 'http://localhost'));
  assertEquals(result, undefined);
});

Deno.test('HashRouter matching — no basePath prefix', () => {
  const manifest = buildHashManifest([
    { pattern: '/settings', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  // Should NOT match with /html prefix
  const withPrefix = core.match(new URL('/html/settings', 'http://localhost'));
  assertEquals(withPrefix, undefined);

  // Should match bare path
  const bare = core.match(new URL('/settings', 'http://localhost'));
  assertExists(bare);
});

// ── Route Hierarchy ────────────────────────────────────────────────

Deno.test('HashRouter hierarchy — flat routes', () => {
  const manifest = buildHashManifest([
    { pattern: '/settings', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const hierarchy = core.buildRouteHierarchy('/settings');
  assertEquals(hierarchy, ['/', '/settings']);
});

Deno.test('HashRouter hierarchy — nested routes', () => {
  const manifest = buildHashManifest([
    { pattern: '/settings', loader: () => Promise.resolve({}) },
    { pattern: '/settings/account', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const hierarchy = core.buildRouteHierarchy('/settings/account');
  assertEquals(hierarchy, ['/', '/settings', '/settings/account']);
});

Deno.test('HashRouter hierarchy — root route', () => {
  const manifest = buildHashManifest([
    { pattern: '/', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const hierarchy = core.buildRouteHierarchy('/');
  assertEquals(hierarchy, ['/']);
});

// ── Module Loading ─────────────────────────────────────────────────

Deno.test('HashRouter module loading — uses inline loader', async () => {
  const page = new TestPage('test', '<h1>Test</h1>');
  const manifest = buildHashManifest([
    { pattern: '/test', loader: () => Promise.resolve({ default: page }) },
  ]);
  const core = new RouteCore(manifest);

  // loadModule uses the moduleLoaders map, keyed by pattern
  const mod = await core.loadModule<{ default: TestPage }>('/test');
  assertEquals(mod.default, page);
});

Deno.test('HashRouter module loading — caches loaded modules', async () => {
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
  assertEquals(callCount, 1, 'loader should only be called once');
});

// ── toRouteInfo ────────────────────────────────────────────────────

Deno.test('HashRouter toRouteInfo — builds correct route info', () => {
  const manifest = buildHashManifest([
    { pattern: '/users/:id', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const matched = core.match(new URL('/users/99', 'http://localhost'));
  assertExists(matched);

  const info = core.toRouteInfo(matched, '/users/99');
  assertEquals(info.pathname, '/users/99');
  assertEquals(info.pattern, '/users/:id');
  assertEquals(info.params, { id: '99' });
});

// ── Context Provider ───────────────────────────────────────────────

Deno.test('HashRouter context — extends context via provider', async () => {
  const manifest = buildHashManifest([
    { pattern: '/test', loader: () => Promise.resolve({}) },
  ]);
  const extendContext: ContextProvider = (base) => ({
    ...base,
    custom: 'value',
  });
  const core = new RouteCore(manifest, { extendContext });

  const matched = core.match(new URL('/test', 'http://localhost'));
  assertExists(matched);

  const routeInfo = core.toRouteInfo(matched, '/test');
  const context = await core.buildComponentContext(routeInfo, matched.route);
  assertEquals((context as ComponentContext & { custom: string }).custom, 'value');
});

Deno.test('HashRouter context — no basePath in context', async () => {
  const manifest = buildHashManifest([
    { pattern: '/test', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const matched = core.match(new URL('/test', 'http://localhost'));
  assertExists(matched);

  const routeInfo = core.toRouteInfo(matched, '/test');
  const context = await core.buildComponentContext(routeInfo, matched.route);
  // No basePath set → context.basePath is undefined
  assertEquals(context.basePath, undefined);
});

// ── Event Emission ─────────────────────────────────────────────────

Deno.test('HashRouter events — emits to listeners', () => {
  const manifest = buildHashManifest([]);
  const core = new RouteCore(manifest);

  const events: { type: string; pathname: string }[] = [];
  core.addEventListener((e) => events.push({ type: e.type, pathname: e.pathname }));

  core.emit({ type: 'navigate', pathname: '/test', params: {} });
  core.emit({ type: 'load', pathname: '/test', params: {} });

  assertEquals(events.length, 2);
  assertEquals(events[0].type, 'navigate');
  assertEquals(events[1].type, 'load');
});

Deno.test('HashRouter events — removeListener stops emission', () => {
  const manifest = buildHashManifest([]);
  const core = new RouteCore(manifest);

  const events: string[] = [];
  const remove = core.addEventListener((e) => events.push(e.type));

  core.emit({ type: 'navigate', pathname: '/', params: {} });
  remove();
  core.emit({ type: 'navigate', pathname: '/', params: {} });

  assertEquals(events.length, 1);
});

// ── buildComponentContext with no files ─────────────────────────────

Deno.test('HashRouter context — no file fetching for hash routes', async () => {
  const manifest = buildHashManifest([
    { pattern: '/test', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const matched = core.match(new URL('/test', 'http://localhost'));
  assertExists(matched);

  const routeInfo = core.toRouteInfo(matched, '/test');
  // files.ts = '/test' but html, md, css are undefined → no fetch attempts
  const context = await core.buildComponentContext(routeInfo, matched.route);

  // Files should have ts but no html/md/css content
  assertEquals(context.files?.html, undefined);
  assertEquals(context.files?.md, undefined);
  assertEquals(context.files?.css, undefined);
});

// ── Wildcard and catch-all patterns ─────────────────────────────────

Deno.test('HashRouter matching — wildcard catch-all', () => {
  const manifest = buildHashManifest([
    { pattern: '/docs/:rest*', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const shallow = core.match(new URL('/docs/intro', 'http://localhost'));
  assertExists(shallow);
  assertEquals(shallow.params.rest, 'intro');

  const deep = core.match(new URL('/docs/guide/getting-started', 'http://localhost'));
  assertExists(deep);
  assertEquals(deep.params.rest, 'guide/getting-started');
});

// ── Query string preservation ───────────────────────────────────────

Deno.test('HashRouter matching — preserves search params', () => {
  const manifest = buildHashManifest([
    { pattern: '/search', loader: () => Promise.resolve({}) },
  ]);
  const core = new RouteCore(manifest);

  const url = new URL('/search?q=hello&page=2', 'http://localhost');
  const matched = core.match(url);
  assertExists(matched);
  assertEquals(matched.searchParams?.get('q'), 'hello');
  assertEquals(matched.searchParams?.get('page'), '2');
});
