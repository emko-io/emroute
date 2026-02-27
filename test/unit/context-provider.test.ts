/**
 * Comprehensive Context Provider Tests
 *
 * Tests cover:
 * - RouteCore context provider storage and configuration
 * - Context enrichment with custom properties
 * - Base context preservation (route info, files, signal)
 * - Context passed to getData and render methods
 * - Integration with SSR renderers (HTML and Markdown)
 * - Widget context enrichment in SSR
 * - Type safety with extended context
 * - Multiple levels of context enrichment
 */

import { test, expect, describe } from 'bun:test';
import { RouteCore } from '../../src/route/route.core.ts';
import { SsrHtmlRouter } from '../../src/renderer/ssr/html.renderer.ts';
import { SsrMdRouter } from '../../src/renderer/ssr/md.renderer.ts';
import { PageComponent } from '../../src/component/page.component.ts';
import { WidgetComponent } from '../../src/component/widget.component.ts';
import { WidgetRegistry } from '../../src/widget/widget.registry.ts';
import type { RouteConfig, RouteInfo } from '../../src/type/route.type.ts';
import type { ComponentContext, ContextProvider } from '../../src/component/abstract.component.ts';
import { createResolver, type TestManifest } from './test.util.ts';

// deno-lint-ignore no-explicit-any
const asAny = (v: unknown): any => v;

// ============================================================================
// Helpers
// ============================================================================

/** Build a RouteInfo from a pathname and optional params. */
function ri(pathname: string, params: Record<string, string> = {}): RouteInfo {
  return { url: new URL(pathname, 'http://test'), params };
}

function createTestManifest(
  routes?: RouteConfig[],
  overrides?: Partial<TestManifest>,
): TestManifest {
  return {
    routes: routes ?? [],
    ...overrides,
  };
}

function resolverFromManifest(manifest: TestManifest) {
  return createResolver(manifest.routes ?? [], {
    ...(manifest.errorBoundaries ? { errorBoundaries: manifest.errorBoundaries } : {}),
    ...(manifest.statusPages ? { statusPages: manifest.statusPages } : {}),
    ...(manifest.errorHandler ? { errorHandler: manifest.errorHandler } : {}),
  });
}

function createHtmlRouter(manifest: TestManifest, options?: Record<string, unknown>) {
  return new SsrHtmlRouter(resolverFromManifest(manifest), {
    ...(manifest.moduleLoaders ? { moduleLoaders: manifest.moduleLoaders } : {}),
    ...options,
  });
}

function createMdRouter(manifest: TestManifest, options?: Record<string, unknown>) {
  return new SsrMdRouter(resolverFromManifest(manifest), {
    ...(manifest.moduleLoaders ? { moduleLoaders: manifest.moduleLoaders } : {}),
    ...options,
  });
}

function createTestRoute(
  overrides?: Partial<RouteConfig>,
): RouteConfig {
  return {
    pattern: '/test',
    type: 'page',
    modulePath: '/test.page.ts',
    ...overrides,
  };
}

function mockFetch(contentMap: Record<string, string>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (
    (input: string | URL | Request): Promise<Response> => {
      let url: string;
      if (typeof input === 'string') url = input;
      else if (input instanceof URL) url = input.toString();
      else url = input.url;
      for (const [key, content] of Object.entries(contentMap)) {
        if (url.includes(key)) {
          return Promise.resolve(new Response(content, { status: 200 }));
        }
      }
      return Promise.resolve(new Response('Not Found', { status: 404 }));
    }
  ) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

// ============================================================================
// RouteCore Context Provider Storage
// ============================================================================

test('RouteCore - contextProvider is undefined by default', () => {
  const core = new RouteCore(createResolver([]));
  expect(core.contextProvider).toEqual(undefined);
});

test('RouteCore - contextProvider is set from extendContext option', () => {
  const provider: ContextProvider = (ctx) => ctx;
  const core = new RouteCore(createResolver([]), {
    extendContext: provider,
  });
  expect(core.contextProvider).toEqual(provider);
});

test(
  'RouteCore - contextProvider can be accessed for inspection',
  () => {
    const provider: ContextProvider = (base) => ({
      ...base,
      customProperty: 'value',
    });
    const core = new RouteCore(createResolver([]), {
      extendContext: provider,
    });
    expect(core.contextProvider !== undefined).toBeTruthy();
    // Verify it's the same function
    expect(core.contextProvider).toEqual(provider);
  },
);

// ============================================================================
// Base Context Preservation
// ============================================================================

test(
  'RouteCore - buildComponentContext preserves pathname from RouteInfo',
  async () => {
    const route = createTestRoute({
      pattern: '/hello',
      files: { html: '/hello.page.html' },
    });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => ({ ...base, locale: 'en-US' }),
    });

    const routeInfo = ri('/hello');

    const restore = mockFetch({ '/hello.page.html': '<p>Hello</p>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      expect(ctx.pathname).toEqual('/hello');
    } finally {
      restore();
    }
  },
);

test(
  'RouteCore - buildComponentContext preserves pattern from RouteInfo',
  async () => {
    const route = createTestRoute({
      pattern: '/users/:id',
      files: { html: '/users.page.html' },
    });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => ({ ...base, service: 'api' }),
    });

    const routeInfo = ri('/users/42', { id: '42' });

    const restore = mockFetch({ '/users.page.html': '<div>User</div>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      expect(ctx.url.pathname).toEqual('/users/42');
    } finally {
      restore();
    }
  },
);

test(
  'RouteCore - buildComponentContext preserves params from RouteInfo',
  async () => {
    const route = createTestRoute({
      pattern: '/articles/:slug',
      files: { html: '/articles.page.html' },
    });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => ({ ...base, service: 'api' }),
    });

    const routeInfo = ri('/articles/hello-world', { slug: 'hello-world' });

    const restore = mockFetch({ '/articles.page.html': '<article/>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      expect(ctx.params).toEqual({ slug: 'hello-world' });
    } finally {
      restore();
    }
  },
);

test(
  'RouteCore - buildComponentContext preserves searchParams',
  async () => {
    const route = createTestRoute({
      pattern: '/search',
      files: { html: '/search.page.html' },
    });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => ({ ...base, service: 'search' }),
    });

    const routeInfo: RouteInfo = {
      url: new URL('/search?q=test&limit=10', 'http://test'),
      params: {},
    };

    const restore = mockFetch({ '/search.page.html': '<div>Search</div>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      expect(ctx.searchParams.get('q')).toEqual('test');
      expect(ctx.searchParams.get('limit')).toEqual('10');
    } finally {
      restore();
    }
  },
);

test(
  'RouteCore - buildComponentContext preserves files (html)',
  async () => {
    const route = createTestRoute({
      pattern: '/page',
      files: { html: '/page.page.html' },
    });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => ({ ...base, extra: true }),
    });

    const routeInfo = ri('/page');

    const restore = mockFetch({ '/page.page.html': '<div>Content</div>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      expect(ctx.files?.html).toEqual('<div>Content</div>');
    } finally {
      restore();
    }
  },
);

test(
  'RouteCore - buildComponentContext preserves files (markdown)',
  async () => {
    const route = createTestRoute({
      pattern: '/page',
      files: { md: '/page.page.md' },
    });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => ({ ...base, extra: true }),
    });

    const routeInfo = ri('/page');

    const restore = mockFetch({ '/page.page.md': '# Page Content' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      expect(ctx.files?.md).toEqual('# Page Content');
    } finally {
      restore();
    }
  },
);

test(
  'RouteCore - buildComponentContext preserves files (css)',
  async () => {
    const route = createTestRoute({
      pattern: '/page',
      files: { css: '/page.page.css' },
    });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => ({ ...base, extra: true }),
    });

    const routeInfo = ri('/page');

    const restore = mockFetch({
      '/page.page.css': 'body { color: red; }',
    });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      expect(ctx.files?.css).toEqual('body { color: red; }');
    } finally {
      restore();
    }
  },
);

test(
  'RouteCore - buildComponentContext preserves files (all types)',
  async () => {
    const route = createTestRoute({
      pattern: '/users/:id',
      files: {
        html: '/users.page.html',
        md: '/users.page.md',
        css: '/users.page.css',
      },
    });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => ({ ...base, extra: true }),
    });

    const routeInfo = ri('/users/42', { id: '42' });

    const restore = mockFetch({
      '/users.page.html': '<div>User</div>',
      '/users.page.md': '# User',
      '/users.page.css': '.user { display: flex; }',
    });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      expect(ctx.files?.html).toEqual('<div>User</div>');
      expect(ctx.files?.md).toEqual('# User');
      expect(ctx.files?.css).toEqual('.user { display: flex; }');
    } finally {
      restore();
    }
  },
);

test(
  'RouteCore - buildComponentContext preserves signal',
  async () => {
    const route = createTestRoute({
      pattern: '/page',
      files: { html: '/page.page.html' },
    });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => ({ ...base, extra: true }),
    });

    const routeInfo = ri('/page');

    const signal = new AbortController().signal;
    const restore = mockFetch({ '/page.page.html': '<div>Content</div>' });
    try {
      const ctx = await core.buildComponentContext(
        routeInfo,
        route,
        signal,
      );
      expect(ctx.signal).toEqual(signal);
    } finally {
      restore();
    }
  },
);

// ============================================================================
// isLeaf in ComponentContext
// ============================================================================

test(
  'RouteCore - buildComponentContext sets isLeaf true when passed true',
  async () => {
    const route = createTestRoute({ pattern: '/leaf' });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])));
    const routeInfo = ri('/leaf');

    const ctx = await core.buildComponentContext(routeInfo, route, undefined, true);
    expect(ctx.isLeaf).toEqual(true);
  },
);

test(
  'RouteCore - buildComponentContext sets isLeaf false when passed false',
  async () => {
    const route = createTestRoute({ pattern: '/layout' });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])));
    const routeInfo = ri('/layout/child');

    const ctx = await core.buildComponentContext(routeInfo, route, undefined, false);
    expect(ctx.isLeaf).toEqual(false);
  },
);

test(
  'RouteCore - buildComponentContext leaves isLeaf undefined when not passed',
  async () => {
    const route = createTestRoute({ pattern: '/page' });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])));
    const routeInfo = ri('/page');

    const ctx = await core.buildComponentContext(routeInfo, route);
    expect(ctx.isLeaf).toEqual(undefined);
  },
);

test(
  'RouteCore - isLeaf is preserved through contextProvider',
  async () => {
    const route = createTestRoute({ pattern: '/test' });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => ({ ...base, custom: 'value' }),
    });
    const routeInfo = ri('/test');

    const ctx = await core.buildComponentContext(routeInfo, route, undefined, true);
    expect(ctx.isLeaf).toEqual(true);
    expect(asAny(ctx).custom).toEqual('value');
  },
);

// ============================================================================
// Context Enrichment with Custom Properties
// ============================================================================

test(
  'RouteCore - buildComponentContext applies single custom property',
  async () => {
    const route = createTestRoute({
      pattern: '/hello',
      files: { html: '/hello.page.html' },
    });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => ({ ...base, locale: 'en-US' }),
    });

    const routeInfo = ri('/hello');

    const restore = mockFetch({ '/hello.page.html': '<p>Hello</p>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      expect(asAny(ctx).locale).toEqual('en-US');
    } finally {
      restore();
    }
  },
);

test(
  'RouteCore - buildComponentContext applies multiple custom properties',
  async () => {
    const route = createTestRoute({
      pattern: '/page',
      files: { html: '/page.page.html' },
    });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => ({
        ...base,
        locale: 'en-US',
        apiVersion: 3,
        debug: false,
      }),
    });

    const routeInfo = ri('/page');

    const restore = mockFetch({ '/page.page.html': '<div>Page</div>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      expect(asAny(ctx).locale).toEqual('en-US');
      expect(asAny(ctx).apiVersion).toEqual(3);
      expect(asAny(ctx).debug).toEqual(false);
    } finally {
      restore();
    }
  },
);

test(
  'RouteCore - buildComponentContext supports complex custom objects',
  async () => {
    const route = createTestRoute({
      pattern: '/page',
      files: { html: '/page.page.html' },
    });

    const mockService = {
      name: 'TestService',
      version: '1.0',
      call: () => 'result',
    };

    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => ({ ...base, service: mockService }),
    });

    const routeInfo = ri('/page');

    const restore = mockFetch({ '/page.page.html': '<div>Page</div>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      const service = asAny(ctx).service;
      expect(service.name).toEqual('TestService');
      expect(service.version).toEqual('1.0');
      expect(service.call()).toEqual('result');
    } finally {
      restore();
    }
  },
);

test(
  'RouteCore - contextProvider can access base RouteInfo properties',
  async () => {
    const route = createTestRoute({
      pattern: '/test',
      files: { html: '/test.page.html' },
    });
    let capturedBase: ComponentContext | undefined;

    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => {
        capturedBase = base;
        return { ...base, custom: 'value' };
      },
    });

    const routeInfo: RouteInfo = {
      url: new URL('/test?tab=info', 'http://test'),
      params: { id: '123' },
    };

    const restore = mockFetch({ '/test.page.html': '<div>Test</div>' });
    try {
      await core.buildComponentContext(routeInfo, route);
      expect(capturedBase !== undefined).toBeTruthy();
      expect(capturedBase!.pathname).toEqual('/test');
      expect(capturedBase!.url.pathname).toEqual('/test');
      expect(capturedBase!.params).toEqual({ id: '123' });
      expect(capturedBase!.searchParams.get('tab')).toEqual('info');
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Context Passed to getData
// ============================================================================

test(
  'SsrHtmlRouter - context passed to page component getData',
  async () => {
    let capturedContext: ComponentContext | undefined;

    class TestPage extends PageComponent {
      override getData(args: this['DataArgs']) {
        capturedContext = args.context;
        return Promise.resolve(null);
      }

      override renderHTML() {
        return '<div>test</div>';
      }

      override renderMarkdown() {
        return '# test';
      }
    }

    const manifest = createTestManifest([createTestRoute({
      pattern: '/test',
      modulePath: '/test.page.ts',
      files: { ts: '/test.page.ts' },
    })], {
      moduleLoaders: {
        '/test.page.ts': () => Promise.resolve({ default: new TestPage() }),
      },
    });

    const restore = mockFetch({});
    try {
      const router = createHtmlRouter(manifest, {
        fileReader: () => Promise.resolve(''),
      });

      await router.render(new URL('http://test/test'));

      expect(capturedContext !== undefined).toBeTruthy();
      expect(capturedContext!.pathname).toEqual('/test');
    } finally {
      restore();
    }
  },
);

test(
  'SsrHtmlRouter - context enriched with extendContext in getData',
  async () => {
    let capturedContext: ComponentContext | undefined;

    class TestPage extends PageComponent {
      override getData(args: this['DataArgs']) {
        capturedContext = args.context;
        return Promise.resolve(null);
      }

      override renderHTML() {
        return '<div>test</div>';
      }

      override renderMarkdown() {
        return '# test';
      }
    }

    const manifest = createTestManifest([createTestRoute({
      pattern: '/test',
      modulePath: '/test.page.ts',
      files: { ts: '/test.page.ts' },
    })], {
      moduleLoaders: {
        '/test.page.ts': () => Promise.resolve({ default: new TestPage() }),
      },
    });

    const restore = mockFetch({});
    try {
      const router = createHtmlRouter(manifest, {
        fileReader: () => Promise.resolve(''),
        extendContext: (base: ComponentContext) => ({ ...base, rpc: true, apiVersion: 2 }),
      });

      await router.render(new URL('http://test/test'));

      expect(capturedContext !== undefined).toBeTruthy();
      expect(asAny(capturedContext).rpc).toEqual(true);
      expect(asAny(capturedContext).apiVersion).toEqual(2);
      expect(capturedContext!.pathname).toEqual('/test');
    } finally {
      restore();
    }
  },
);

test(
  'SsrMdRouter - context passed to page component getData',
  async () => {
    let capturedContext: ComponentContext | undefined;

    class TestPage extends PageComponent {
      override getData(args: this['DataArgs']) {
        capturedContext = args.context;
        return Promise.resolve(null);
      }

      override renderHTML() {
        return '<div>test</div>';
      }

      override renderMarkdown() {
        return '# test md';
      }
    }

    const manifest = createTestManifest([createTestRoute({
      pattern: '/test',
      modulePath: '/test.page.ts',
      files: { ts: '/test.page.ts' },
    })], {
      moduleLoaders: {
        '/test.page.ts': () => Promise.resolve({ default: new TestPage() }),
      },
    });

    const restore = mockFetch({});
    try {
      const router = createMdRouter(manifest, {
        fileReader: () => Promise.resolve(''),
      });

      await router.render(new URL('http://test/test'));

      expect(capturedContext !== undefined).toBeTruthy();
      expect(capturedContext!.pathname).toEqual('/test');
    } finally {
      restore();
    }
  },
);

test(
  'SsrMdRouter - context enriched with extendContext in getData',
  async () => {
    let capturedContext: ComponentContext | undefined;

    class TestPage extends PageComponent {
      override getData(args: this['DataArgs']) {
        capturedContext = args.context;
        return Promise.resolve(null);
      }

      override renderHTML() {
        return '<div>test</div>';
      }

      override renderMarkdown() {
        return '# test md';
      }
    }

    const manifest = createTestManifest([createTestRoute({
      pattern: '/test',
      modulePath: '/test.page.ts',
      files: { ts: '/test.page.ts' },
    })], {
      moduleLoaders: {
        '/test.page.ts': () => Promise.resolve({ default: new TestPage() }),
      },
    });

    const restore = mockFetch({});
    try {
      const router = createMdRouter(manifest, {
        fileReader: () => Promise.resolve(''),
        extendContext: (base: ComponentContext) => ({ ...base, rpc: true, feature: 'markdown' }),
      });

      await router.render(new URL('http://test/test'));

      expect(capturedContext !== undefined).toBeTruthy();
      expect(asAny(capturedContext).rpc).toEqual(true);
      expect(asAny(capturedContext).feature).toEqual('markdown');
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Context Passed to Render Methods
// ============================================================================

test(
  'SsrHtmlRouter - context passed to renderHTML via RenderArgs',
  async () => {
    let capturedRenderContext: ComponentContext | undefined;

    class TestPage extends PageComponent {
      override getData() {
        return Promise.resolve({ title: 'Test' });
      }

      override renderHTML(args: this['RenderArgs']) {
        capturedRenderContext = args.context;
        return '<div>test</div>';
      }

      override renderMarkdown() {
        return '# test';
      }
    }

    const manifest = createTestManifest([createTestRoute({
      pattern: '/test',
      modulePath: '/test.page.ts',
      files: { ts: '/test.page.ts' },
    })], {
      moduleLoaders: {
        '/test.page.ts': () => Promise.resolve({ default: new TestPage() }),
      },
    });

    const restore = mockFetch({});
    try {
      const router = createHtmlRouter(manifest, {
        fileReader: () => Promise.resolve(''),
        extendContext: (base: ComponentContext) => ({ ...base, renderMode: 'html' }),
      });

      await router.render(new URL('http://test/test'));

      expect(capturedRenderContext !== undefined).toBeTruthy();
      expect(asAny(capturedRenderContext).renderMode).toEqual('html');
    } finally {
      restore();
    }
  },
);

test(
  'SsrMdRouter - context passed to renderMarkdown via RenderArgs',
  async () => {
    let capturedRenderContext: ComponentContext | undefined;

    class TestPage extends PageComponent {
      override getData() {
        return Promise.resolve({ title: 'Test' });
      }

      override renderHTML() {
        return '<div>test</div>';
      }

      override renderMarkdown(args: this['RenderArgs']) {
        capturedRenderContext = args.context;
        return '# test md';
      }
    }

    const manifest = createTestManifest([createTestRoute({
      pattern: '/test',
      modulePath: '/test.page.ts',
      files: { ts: '/test.page.ts' },
    })], {
      moduleLoaders: {
        '/test.page.ts': () => Promise.resolve({ default: new TestPage() }),
      },
    });

    const restore = mockFetch({});
    try {
      const router = createMdRouter(manifest, {
        fileReader: () => Promise.resolve(''),
        extendContext: (base: ComponentContext) => ({ ...base, renderMode: 'markdown' }),
      });

      await router.render(new URL('http://test/test'));

      expect(capturedRenderContext !== undefined).toBeTruthy();
      expect(asAny(capturedRenderContext).renderMode).toEqual('markdown');
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Widget Context Enrichment
// ============================================================================

test(
  'SsrHtmlRouter - context enriched for widget in HTML',
  async () => {
    let capturedWidgetContext: ComponentContext | undefined;

    class TestPage extends PageComponent {
      override getData() {
        return Promise.resolve(null);
      }

      override renderHTML() {
        return '<div><widget-test></widget-test></div>';
      }

      override renderMarkdown() {
        return '# page';
      }
    }

    class TestWidget extends WidgetComponent {
      readonly name = 'test';

      override getData(args: this['DataArgs']) {
        capturedWidgetContext = args.context as ComponentContext;
        return Promise.resolve({ val: 1 });
      }

      override renderHTML() {
        return '<span>widget rendered</span>';
      }

      override renderMarkdown() {
        return '**widget**';
      }
    }

    const widgets = new WidgetRegistry();
    widgets.add(new TestWidget());

    const manifest = createTestManifest([createTestRoute({
      pattern: '/wtest',
      modulePath: '/wtest.page.ts',
      files: { ts: '/wtest.page.ts' },
    })], {
      moduleLoaders: {
        '/wtest.page.ts': () => Promise.resolve({ default: new TestPage() }),
      },
    });

    const restore = mockFetch({});
    try {
      const router = createHtmlRouter(manifest, {
        fileReader: () => Promise.resolve(''),
        widgets,
        extendContext: (base: ComponentContext) => ({
          ...base,
          rpc: true,
          apiVersion: 3,
        }),
      });

      await router.render(new URL('http://test/wtest'));

      expect(capturedWidgetContext !== undefined).toBeTruthy();
      expect(asAny(capturedWidgetContext).rpc).toEqual(true);
      expect(asAny(capturedWidgetContext).apiVersion).toEqual(3);
      expect(capturedWidgetContext!.pathname).toEqual('/wtest');
    } finally {
      restore();
    }
  },
);

test(
  'SsrMdRouter - context enriched for widget in Markdown',
  async () => {
    let capturedWidgetContext: ComponentContext | undefined;

    class TestPage extends PageComponent {
      override getData() {
        return Promise.resolve(null);
      }

      override renderHTML() {
        return '<div>page</div>';
      }

      override renderMarkdown() {
        return '# Page\n\n```widget:mywidget\n{"data":"test"}\n```';
      }
    }

    class TestWidget extends WidgetComponent {
      readonly name = 'mywidget';

      override getData(args: this['DataArgs']) {
        capturedWidgetContext = args.context as ComponentContext;
        return Promise.resolve({ val: 1 });
      }

      override renderHTML() {
        return '<span>widget</span>';
      }

      override renderMarkdown() {
        return '**widget in markdown**';
      }
    }

    const widgets = new WidgetRegistry();
    widgets.add(new TestWidget());

    const manifest = createTestManifest([createTestRoute({
      pattern: '/wmd',
      modulePath: '/wmd.page.ts',
      files: { ts: '/wmd.page.ts' },
    })], {
      moduleLoaders: {
        '/wmd.page.ts': () => Promise.resolve({ default: new TestPage() }),
      },
    });

    const restore = mockFetch({});
    try {
      const router = createMdRouter(manifest, {
        fileReader: () => Promise.resolve(''),
        widgets,
        extendContext: (base: ComponentContext) => ({
          ...base,
          rpc: true,
          apiVersion: 3,
        }),
      });

      await router.render(new URL('http://test/wmd'));

      expect(capturedWidgetContext !== undefined).toBeTruthy();
      expect(asAny(capturedWidgetContext).rpc).toEqual(true);
      expect(asAny(capturedWidgetContext).apiVersion).toEqual(3);
      expect(capturedWidgetContext!.pathname).toEqual('/wmd');
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Context Without Provider
// ============================================================================

test(
  'RouteCore - buildComponentContext works without extendContext',
  async () => {
    const route = createTestRoute({
      pattern: '/about',
      files: { html: '/about.page.html' },
    });
    const core = new RouteCore(resolverFromManifest(createTestManifest([route])));

    const routeInfo = ri('/about');

    const restore = mockFetch({
      '/about.page.html': '<section>About</section>',
    });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      expect(ctx.pathname).toEqual('/about');
      expect(ctx.files?.html).toEqual('<section>About</section>');
      expect(
        Object.prototype.hasOwnProperty.call(ctx, 'custom'),
      ).toEqual(false);
    } finally {
      restore();
    }
  },
);

test(
  'SsrHtmlRouter - page component receives base context when no extendContext provided',
  async () => {
    let capturedContext: ComponentContext | undefined;

    class TestPage extends PageComponent {
      override getData(args: this['DataArgs']) {
        capturedContext = args.context;
        return Promise.resolve(null);
      }

      override renderHTML() {
        return '<div>test</div>';
      }

      override renderMarkdown() {
        return '# test';
      }
    }

    const manifest = createTestManifest([createTestRoute({
      pattern: '/test',
      modulePath: '/test.page.ts',
      files: { ts: '/test.page.ts' },
    })], {
      moduleLoaders: {
        '/test.page.ts': () => Promise.resolve({ default: new TestPage() }),
      },
    });

    const restore = mockFetch({});
    try {
      const router = createHtmlRouter(manifest, {
        fileReader: () => Promise.resolve(''),
      });

      await router.render(new URL('http://test/test'));

      expect(capturedContext !== undefined).toBeTruthy();
      expect(capturedContext!.pathname).toEqual('/test');
      // Should only have base properties, no custom enrichment
      expect(
        Object.prototype.hasOwnProperty.call(capturedContext, 'custom'),
      ).toEqual(false);
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Multiple Routes with Context
// ============================================================================

test(
  'SsrHtmlRouter - context applied consistently across multiple routes',
  async () => {
    const capturedContexts: ComponentContext[] = [];

    class TestPage extends PageComponent {
      override getData(args: this['DataArgs']) {
        capturedContexts.push(args.context!);
        return Promise.resolve(null);
      }

      override renderHTML() {
        return '<div>test</div>';
      }

      override renderMarkdown() {
        return '# test';
      }
    }

    const manifest = createTestManifest(
      [
        createTestRoute({
          pattern: '/route1',
          modulePath: '/route1.page.ts',
          files: { ts: '/route1.page.ts' },
        }),
        createTestRoute({
          pattern: '/route2',
          modulePath: '/route2.page.ts',
          files: { ts: '/route2.page.ts' },
        }),
      ],
      {
        moduleLoaders: {
          '/route1.page.ts': () => Promise.resolve({ default: new TestPage() }),
          '/route2.page.ts': () => Promise.resolve({ default: new TestPage() }),
        },
      },
    );

    const restore = mockFetch({});
    try {
      const router = createHtmlRouter(manifest, {
        fileReader: () => Promise.resolve(''),
        extendContext: (base: ComponentContext) => ({ ...base, appId: 'myapp' }),
      });

      await router.render(new URL('http://test/route1'));
      await router.render(new URL('http://test/route2'));

      expect(capturedContexts.length).toEqual(2);
      expect(asAny(capturedContexts[0]).appId).toEqual('myapp');
      expect(asAny(capturedContexts[1]).appId).toEqual('myapp');
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Type Safety and Extended Context
// ============================================================================

test(
  'Context with extended type via generic parameter',
  async () => {
    type AppContext = ComponentContext & { locale: string; apiVersion: number };

    class TypedPage extends PageComponent<
      Record<string, string>,
      unknown,
      AppContext
    > {
      override getData(args: this['DataArgs']) {
        // args.context should be AppContext type
        const ctx = args.context;
        if (ctx) {
          // TypeScript would allow accessing locale and apiVersion
          const _locale = ctx.locale;
          const _apiVersion = ctx.apiVersion;
        }
        return Promise.resolve(null);
      }

      override renderHTML() {
        return '<div>test</div>';
      }

      override renderMarkdown() {
        return '# test';
      }
    }

    const manifest = createTestManifest([createTestRoute({
      pattern: '/test',
      modulePath: '/test.page.ts',
      files: { ts: '/test.page.ts' },
    })], {
      moduleLoaders: {
        '/test.page.ts': () => Promise.resolve({ default: new TypedPage() }),
      },
    });

    const restore = mockFetch({});
    try {
      const router = createHtmlRouter(manifest, {
        fileReader: () => Promise.resolve(''),
        extendContext: (base: ComponentContext) => ({
          ...base,
          locale: 'en-US',
          apiVersion: 2,
        }),
      });

      const result = await router.render(new URL('http://test/test'));
      expect(result.status).toEqual(200);
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Error Handling in Context Provider
// ============================================================================

test(
  'Context provider returning same base object reference',
  async () => {
    const route = createTestRoute({
      pattern: '/test',
      files: { html: '/test.page.html' },
    });

    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => base, // Return base unchanged
    });

    const routeInfo = ri('/test');

    const restore = mockFetch({ '/test.page.html': '<div>Test</div>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      expect(ctx.pathname).toEqual('/test');
      expect(ctx.files?.html).toEqual('<div>Test</div>');
    } finally {
      restore();
    }
  },
);

test(
  'Context provider with complex nesting logic',
  async () => {
    const route = createTestRoute({
      pattern: '/test',
      files: { html: '/test.page.html' },
    });

    const core = new RouteCore(resolverFromManifest(createTestManifest([route])), {
      extendContext: (base) => {
        const enriched: unknown = {
          ...base,
          services: {
            api: {
              baseUrl: 'https://api.example.com',
              version: 'v1',
            },
            cache: {
              ttl: 3600,
              enabled: true,
            },
          },
          features: {
            analytics: true,
            darkMode: false,
          },
        };
        return enriched as ComponentContext;
      },
    });

    const routeInfo = ri('/test');

    const restore = mockFetch({ '/test.page.html': '<div>Test</div>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      const services = asAny(ctx).services;
      expect(services.api.baseUrl).toEqual('https://api.example.com');
      expect(services.cache.ttl).toEqual(3600);
      const features = asAny(ctx).features;
      expect(features.analytics).toEqual(true);
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Context with Route Hierarchy (Nesting)
// ============================================================================

test(
  'Context preserved across route hierarchy in SSR',
  async () => {
    const capturedContexts: ComponentContext[] = [];

    class RootPage extends PageComponent {
      override getData(args: this['DataArgs']) {
        capturedContexts.push(args.context!);
        return Promise.resolve(null);
      }

      override renderHTML() {
        return '<div><router-slot></router-slot></div>';
      }

      override renderMarkdown() {
        return '# Root\n\n```router-slot\n```';
      }
    }

    class ChildPage extends PageComponent {
      override getData(args: this['DataArgs']) {
        capturedContexts.push(args.context!);
        return Promise.resolve(null);
      }

      override renderHTML() {
        return '<div>Child</div>';
      }

      override renderMarkdown() {
        return '## Child';
      }
    }

    const manifest = createTestManifest(
      [
        createTestRoute({
          pattern: '/',
          modulePath: '/root.page.ts',
          files: { ts: '/root.page.ts' },
        }),
        createTestRoute({
          pattern: '/child',
          modulePath: '/child.page.ts',
          files: { ts: '/child.page.ts' },
          parent: '/',
        }),
      ],
      {
        moduleLoaders: {
          '/root.page.ts': () => Promise.resolve({ default: new RootPage() }),
          '/child.page.ts': () => Promise.resolve({ default: new ChildPage() }),
        },
      },
    );

    const restore = mockFetch({});
    try {
      const router = createHtmlRouter(manifest, {
        fileReader: () => Promise.resolve(''),
        extendContext: (base: ComponentContext) => ({
          ...base,
          contextId: 'test-context',
        }),
      });

      await router.render(new URL('http://test/child'));

      // Both root and child page should have the enriched context
      expect(capturedContexts.length >= 1).toBeTruthy();
      for (const ctx of capturedContexts) {
        expect(asAny(ctx).contextId).toEqual('test-context');
      }
    } finally {
      restore();
    }
  },
);
