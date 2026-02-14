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

import { assert, assertEquals } from '@std/assert';
import { RouteCore } from '../../src/route/route.core.ts';
import { SsrHtmlRouter } from '../../src/renderer/ssr/html.renderer.ts';
import { SsrMdRouter } from '../../src/renderer/ssr/md.renderer.ts';
import { PageComponent } from '../../src/component/page.component.ts';
import { WidgetComponent } from '../../src/component/widget.component.ts';
import { WidgetRegistry } from '../../src/widget/widget.registry.ts';
import type { RouteConfig, RouteInfo, RoutesManifest } from '../../src/type/route.type.ts';
import type { ComponentContext, ContextProvider } from '../../src/component/abstract.component.ts';

// deno-lint-ignore no-explicit-any
const asAny = (v: unknown): any => v;

// ============================================================================
// Helpers
// ============================================================================

function createTestManifest(
  routes?: RouteConfig[],
  overrides?: Partial<RoutesManifest>,
): RoutesManifest {
  return {
    routes: routes ?? [],
    errorBoundaries: [],
    statusPages: new Map(),
    ...overrides,
  };
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

Deno.test('RouteCore - contextProvider is undefined by default', () => {
  const core = new RouteCore(createTestManifest([]));
  assertEquals(core.contextProvider, undefined);
});

Deno.test('RouteCore - contextProvider is set from extendContext option', () => {
  const provider: ContextProvider = (ctx) => ctx;
  const core = new RouteCore(createTestManifest([]), {
    extendContext: provider,
  });
  assertEquals(core.contextProvider, provider);
});

Deno.test(
  'RouteCore - contextProvider can be accessed for inspection',
  () => {
    const provider: ContextProvider = (base) => ({
      ...base,
      customProperty: 'value',
    });
    const core = new RouteCore(createTestManifest([]), {
      extendContext: provider,
    });
    assert(core.contextProvider !== undefined);
    // Verify it's the same function
    assertEquals(core.contextProvider, provider);
  },
);

// ============================================================================
// Base Context Preservation
// ============================================================================

Deno.test(
  'RouteCore - buildComponentContext preserves pathname from RouteInfo',
  async () => {
    const route = createTestRoute({
      pattern: '/hello',
      files: { html: '/hello.page.html' },
    });
    const core = new RouteCore(createTestManifest([route]), {
      extendContext: (base) => ({ ...base, locale: 'en-US' }),
    });

    const routeInfo: RouteInfo = {
      pathname: '/hello',
      pattern: '/hello',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const restore = mockFetch({ '/hello.page.html': '<p>Hello</p>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      assertEquals(ctx.pathname, '/hello');
    } finally {
      restore();
    }
  },
);

Deno.test(
  'RouteCore - buildComponentContext preserves pattern from RouteInfo',
  async () => {
    const route = createTestRoute({
      pattern: '/users/:id',
      files: { html: '/users.page.html' },
    });
    const core = new RouteCore(createTestManifest([route]), {
      extendContext: (base) => ({ ...base, service: 'api' }),
    });

    const routeInfo: RouteInfo = {
      pathname: '/users/42',
      pattern: '/users/:id',
      params: { id: '42' },
      searchParams: new URLSearchParams(),
    };

    const restore = mockFetch({ '/users.page.html': '<div>User</div>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      assertEquals(ctx.pattern, '/users/:id');
    } finally {
      restore();
    }
  },
);

Deno.test(
  'RouteCore - buildComponentContext preserves params from RouteInfo',
  async () => {
    const route = createTestRoute({
      pattern: '/articles/:slug',
      files: { html: '/articles.page.html' },
    });
    const core = new RouteCore(createTestManifest([route]), {
      extendContext: (base) => ({ ...base, service: 'api' }),
    });

    const routeInfo: RouteInfo = {
      pathname: '/articles/hello-world',
      pattern: '/articles/:slug',
      params: { slug: 'hello-world' },
      searchParams: new URLSearchParams(),
    };

    const restore = mockFetch({ '/articles.page.html': '<article/>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      assertEquals(ctx.params, { slug: 'hello-world' });
    } finally {
      restore();
    }
  },
);

Deno.test(
  'RouteCore - buildComponentContext preserves searchParams',
  async () => {
    const route = createTestRoute({
      pattern: '/search',
      files: { html: '/search.page.html' },
    });
    const core = new RouteCore(createTestManifest([route]), {
      extendContext: (base) => ({ ...base, service: 'search' }),
    });

    const searchParams = new URLSearchParams('q=test&limit=10');
    const routeInfo: RouteInfo = {
      pathname: '/search',
      pattern: '/search',
      params: {},
      searchParams,
    };

    const restore = mockFetch({ '/search.page.html': '<div>Search</div>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      assertEquals(ctx.searchParams.get('q'), 'test');
      assertEquals(ctx.searchParams.get('limit'), '10');
    } finally {
      restore();
    }
  },
);

Deno.test(
  'RouteCore - buildComponentContext preserves files (html)',
  async () => {
    const route = createTestRoute({
      pattern: '/page',
      files: { html: '/page.page.html' },
    });
    const core = new RouteCore(createTestManifest([route]), {
      extendContext: (base) => ({ ...base, extra: true }),
    });

    const routeInfo: RouteInfo = {
      pathname: '/page',
      pattern: '/page',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const restore = mockFetch({ '/page.page.html': '<div>Content</div>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      assertEquals(ctx.files?.html, '<div>Content</div>');
    } finally {
      restore();
    }
  },
);

Deno.test(
  'RouteCore - buildComponentContext preserves files (markdown)',
  async () => {
    const route = createTestRoute({
      pattern: '/page',
      files: { md: '/page.page.md' },
    });
    const core = new RouteCore(createTestManifest([route]), {
      extendContext: (base) => ({ ...base, extra: true }),
    });

    const routeInfo: RouteInfo = {
      pathname: '/page',
      pattern: '/page',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const restore = mockFetch({ '/page.page.md': '# Page Content' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      assertEquals(ctx.files?.md, '# Page Content');
    } finally {
      restore();
    }
  },
);

Deno.test(
  'RouteCore - buildComponentContext preserves files (css)',
  async () => {
    const route = createTestRoute({
      pattern: '/page',
      files: { css: '/page.page.css' },
    });
    const core = new RouteCore(createTestManifest([route]), {
      extendContext: (base) => ({ ...base, extra: true }),
    });

    const routeInfo: RouteInfo = {
      pathname: '/page',
      pattern: '/page',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const restore = mockFetch({
      '/page.page.css': 'body { color: red; }',
    });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      assertEquals(ctx.files?.css, 'body { color: red; }');
    } finally {
      restore();
    }
  },
);

Deno.test(
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
    const core = new RouteCore(createTestManifest([route]), {
      extendContext: (base) => ({ ...base, extra: true }),
    });

    const routeInfo: RouteInfo = {
      pathname: '/users/42',
      pattern: '/users/:id',
      params: { id: '42' },
      searchParams: new URLSearchParams(),
    };

    const restore = mockFetch({
      '/users.page.html': '<div>User</div>',
      '/users.page.md': '# User',
      '/users.page.css': '.user { display: flex; }',
    });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      assertEquals(ctx.files?.html, '<div>User</div>');
      assertEquals(ctx.files?.md, '# User');
      assertEquals(ctx.files?.css, '.user { display: flex; }');
    } finally {
      restore();
    }
  },
);

Deno.test(
  'RouteCore - buildComponentContext preserves signal',
  async () => {
    const route = createTestRoute({
      pattern: '/page',
      files: { html: '/page.page.html' },
    });
    const core = new RouteCore(createTestManifest([route]), {
      extendContext: (base) => ({ ...base, extra: true }),
    });

    const routeInfo: RouteInfo = {
      pathname: '/page',
      pattern: '/page',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const signal = new AbortController().signal;
    const restore = mockFetch({ '/page.page.html': '<div>Content</div>' });
    try {
      const ctx = await core.buildComponentContext(
        routeInfo,
        route,
        signal,
      );
      assertEquals(ctx.signal, signal);
    } finally {
      restore();
    }
  },
);

// ============================================================================
// isLeaf in ComponentContext
// ============================================================================

Deno.test(
  'RouteCore - buildComponentContext sets isLeaf true when passed true',
  async () => {
    const route = createTestRoute({ pattern: '/leaf' });
    const core = new RouteCore(createTestManifest([route]));
    const routeInfo: RouteInfo = {
      pathname: '/leaf',
      pattern: '/leaf',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const ctx = await core.buildComponentContext(routeInfo, route, undefined, true);
    assertEquals(ctx.isLeaf, true);
  },
);

Deno.test(
  'RouteCore - buildComponentContext sets isLeaf false when passed false',
  async () => {
    const route = createTestRoute({ pattern: '/layout' });
    const core = new RouteCore(createTestManifest([route]));
    const routeInfo: RouteInfo = {
      pathname: '/layout/child',
      pattern: '/layout/child',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const ctx = await core.buildComponentContext(routeInfo, route, undefined, false);
    assertEquals(ctx.isLeaf, false);
  },
);

Deno.test(
  'RouteCore - buildComponentContext leaves isLeaf undefined when not passed',
  async () => {
    const route = createTestRoute({ pattern: '/page' });
    const core = new RouteCore(createTestManifest([route]));
    const routeInfo: RouteInfo = {
      pathname: '/page',
      pattern: '/page',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const ctx = await core.buildComponentContext(routeInfo, route);
    assertEquals(ctx.isLeaf, undefined);
  },
);

Deno.test(
  'RouteCore - isLeaf is preserved through contextProvider',
  async () => {
    const route = createTestRoute({ pattern: '/test' });
    const core = new RouteCore(createTestManifest([route]), {
      extendContext: (base) => ({ ...base, custom: 'value' }),
    });
    const routeInfo: RouteInfo = {
      pathname: '/test',
      pattern: '/test',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const ctx = await core.buildComponentContext(routeInfo, route, undefined, true);
    assertEquals(ctx.isLeaf, true);
    assertEquals(asAny(ctx).custom, 'value');
  },
);

// ============================================================================
// Context Enrichment with Custom Properties
// ============================================================================

Deno.test(
  'RouteCore - buildComponentContext applies single custom property',
  async () => {
    const route = createTestRoute({
      pattern: '/hello',
      files: { html: '/hello.page.html' },
    });
    const core = new RouteCore(createTestManifest([route]), {
      extendContext: (base) => ({ ...base, locale: 'en-US' }),
    });

    const routeInfo: RouteInfo = {
      pathname: '/hello',
      pattern: '/hello',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const restore = mockFetch({ '/hello.page.html': '<p>Hello</p>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      assertEquals(asAny(ctx).locale, 'en-US');
    } finally {
      restore();
    }
  },
);

Deno.test(
  'RouteCore - buildComponentContext applies multiple custom properties',
  async () => {
    const route = createTestRoute({
      pattern: '/page',
      files: { html: '/page.page.html' },
    });
    const core = new RouteCore(createTestManifest([route]), {
      extendContext: (base) => ({
        ...base,
        locale: 'en-US',
        apiVersion: 3,
        debug: false,
      }),
    });

    const routeInfo: RouteInfo = {
      pathname: '/page',
      pattern: '/page',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const restore = mockFetch({ '/page.page.html': '<div>Page</div>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      assertEquals(asAny(ctx).locale, 'en-US');
      assertEquals(asAny(ctx).apiVersion, 3);
      assertEquals(asAny(ctx).debug, false);
    } finally {
      restore();
    }
  },
);

Deno.test(
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

    const core = new RouteCore(createTestManifest([route]), {
      extendContext: (base) => ({ ...base, service: mockService }),
    });

    const routeInfo: RouteInfo = {
      pathname: '/page',
      pattern: '/page',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const restore = mockFetch({ '/page.page.html': '<div>Page</div>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      const service = asAny(ctx).service;
      assertEquals(service.name, 'TestService');
      assertEquals(service.version, '1.0');
      assertEquals(service.call(), 'result');
    } finally {
      restore();
    }
  },
);

Deno.test(
  'RouteCore - contextProvider can access base RouteInfo properties',
  async () => {
    const route = createTestRoute({
      pattern: '/test',
      files: { html: '/test.page.html' },
    });
    let capturedBase: ComponentContext | undefined;

    const core = new RouteCore(createTestManifest([route]), {
      extendContext: (base) => {
        capturedBase = base;
        return { ...base, custom: 'value' };
      },
    });

    const routeInfo: RouteInfo = {
      pathname: '/test',
      pattern: '/test',
      params: { id: '123' },
      searchParams: new URLSearchParams('tab=info'),
    };

    const restore = mockFetch({ '/test.page.html': '<div>Test</div>' });
    try {
      await core.buildComponentContext(routeInfo, route);
      assert(capturedBase !== undefined);
      assertEquals(capturedBase.pathname, '/test');
      assertEquals(capturedBase.pattern, '/test');
      assertEquals(capturedBase.params, { id: '123' });
      assertEquals(capturedBase.searchParams.get('tab'), 'info');
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Context Passed to getData
// ============================================================================

Deno.test(
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
      const router = new SsrHtmlRouter(manifest, {
        baseUrl: 'http://test',
      });

      await router.render('http://test/test');

      assert(capturedContext !== undefined);
      assertEquals(capturedContext.pathname, '/test');
    } finally {
      restore();
    }
  },
);

Deno.test(
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
      const router = new SsrHtmlRouter(manifest, {
        baseUrl: 'http://test',
        extendContext: (base) => ({ ...base, rpc: true, apiVersion: 2 }),
      });

      await router.render('http://test/test');

      assert(capturedContext !== undefined);
      assertEquals(asAny(capturedContext).rpc, true);
      assertEquals(asAny(capturedContext).apiVersion, 2);
      assertEquals(capturedContext.pathname, '/test');
    } finally {
      restore();
    }
  },
);

Deno.test(
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
      const router = new SsrMdRouter(manifest, {
        baseUrl: 'http://test',
      });

      await router.render('http://test/test');

      assert(capturedContext !== undefined);
      assertEquals(capturedContext.pathname, '/test');
    } finally {
      restore();
    }
  },
);

Deno.test(
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
      const router = new SsrMdRouter(manifest, {
        baseUrl: 'http://test',
        extendContext: (base) => ({ ...base, rpc: true, feature: 'markdown' }),
      });

      await router.render('http://test/test');

      assert(capturedContext !== undefined);
      assertEquals(asAny(capturedContext).rpc, true);
      assertEquals(asAny(capturedContext).feature, 'markdown');
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Context Passed to Render Methods
// ============================================================================

Deno.test(
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
      const router = new SsrHtmlRouter(manifest, {
        baseUrl: 'http://test',
        extendContext: (base) => ({ ...base, renderMode: 'html' }),
      });

      await router.render('http://test/test');

      assert(capturedRenderContext !== undefined);
      assertEquals(asAny(capturedRenderContext).renderMode, 'html');
    } finally {
      restore();
    }
  },
);

Deno.test(
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
      const router = new SsrMdRouter(manifest, {
        baseUrl: 'http://test',
        extendContext: (base) => ({ ...base, renderMode: 'markdown' }),
      });

      await router.render('http://test/test');

      assert(capturedRenderContext !== undefined);
      assertEquals(asAny(capturedRenderContext).renderMode, 'markdown');
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Widget Context Enrichment
// ============================================================================

Deno.test(
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
      const router = new SsrHtmlRouter(manifest, {
        baseUrl: 'http://test',
        widgets,
        extendContext: (base) => ({
          ...base,
          rpc: true,
          apiVersion: 3,
        }),
      });

      await router.render('http://test/wtest');

      assert(capturedWidgetContext !== undefined);
      assertEquals(asAny(capturedWidgetContext).rpc, true);
      assertEquals(asAny(capturedWidgetContext).apiVersion, 3);
      assertEquals(capturedWidgetContext.pathname, '/wtest');
    } finally {
      restore();
    }
  },
);

Deno.test(
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
      const router = new SsrMdRouter(manifest, {
        baseUrl: 'http://test',
        widgets,
        extendContext: (base) => ({
          ...base,
          rpc: true,
          apiVersion: 3,
        }),
      });

      await router.render('http://test/wmd');

      assert(capturedWidgetContext !== undefined);
      assertEquals(asAny(capturedWidgetContext).rpc, true);
      assertEquals(asAny(capturedWidgetContext).apiVersion, 3);
      assertEquals(capturedWidgetContext.pathname, '/wmd');
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Context Without Provider
// ============================================================================

Deno.test(
  'RouteCore - buildComponentContext works without extendContext',
  async () => {
    const route = createTestRoute({
      pattern: '/about',
      files: { html: '/about.page.html' },
    });
    const core = new RouteCore(createTestManifest([route]));

    const routeInfo: RouteInfo = {
      pathname: '/about',
      pattern: '/about',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const restore = mockFetch({
      '/about.page.html': '<section>About</section>',
    });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      assertEquals(ctx.pathname, '/about');
      assertEquals(ctx.files?.html, '<section>About</section>');
      assertEquals(
        Object.prototype.hasOwnProperty.call(ctx, 'custom'),
        false,
      );
    } finally {
      restore();
    }
  },
);

Deno.test(
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
      const router = new SsrHtmlRouter(manifest, {
        baseUrl: 'http://test',
      });

      await router.render('http://test/test');

      assert(capturedContext !== undefined);
      assertEquals(capturedContext.pathname, '/test');
      // Should only have base properties, no custom enrichment
      assertEquals(
        Object.prototype.hasOwnProperty.call(capturedContext, 'custom'),
        false,
      );
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Multiple Routes with Context
// ============================================================================

Deno.test(
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
      const router = new SsrHtmlRouter(manifest, {
        baseUrl: 'http://test',
        extendContext: (base) => ({ ...base, appId: 'myapp' }),
      });

      await router.render('http://test/route1');
      await router.render('http://test/route2');

      assertEquals(capturedContexts.length, 2);
      assertEquals(asAny(capturedContexts[0]).appId, 'myapp');
      assertEquals(asAny(capturedContexts[1]).appId, 'myapp');
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Type Safety and Extended Context
// ============================================================================

Deno.test(
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
      const router = new SsrHtmlRouter(manifest, {
        baseUrl: 'http://test',
        extendContext: (base) => ({
          ...base,
          locale: 'en-US',
          apiVersion: 2,
        }),
      });

      const result = await router.render('http://test/test');
      assertEquals(result.status, 200);
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Error Handling in Context Provider
// ============================================================================

Deno.test(
  'Context provider returning same base object reference',
  async () => {
    const route = createTestRoute({
      pattern: '/test',
      files: { html: '/test.page.html' },
    });

    const core = new RouteCore(createTestManifest([route]), {
      extendContext: (base) => base, // Return base unchanged
    });

    const routeInfo: RouteInfo = {
      pathname: '/test',
      pattern: '/test',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const restore = mockFetch({ '/test.page.html': '<div>Test</div>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      assertEquals(ctx.pathname, '/test');
      assertEquals(ctx.files?.html, '<div>Test</div>');
    } finally {
      restore();
    }
  },
);

Deno.test(
  'Context provider with complex nesting logic',
  async () => {
    const route = createTestRoute({
      pattern: '/test',
      files: { html: '/test.page.html' },
    });

    const core = new RouteCore(createTestManifest([route]), {
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

    const routeInfo: RouteInfo = {
      pathname: '/test',
      pattern: '/test',
      params: {},
      searchParams: new URLSearchParams(),
    };

    const restore = mockFetch({ '/test.page.html': '<div>Test</div>' });
    try {
      const ctx = await core.buildComponentContext(routeInfo, route);
      const services = asAny(ctx).services;
      assertEquals(services.api.baseUrl, 'https://api.example.com');
      assertEquals(services.cache.ttl, 3600);
      const features = asAny(ctx).features;
      assertEquals(features.analytics, true);
    } finally {
      restore();
    }
  },
);

// ============================================================================
// Context with Route Hierarchy (Nesting)
// ============================================================================

Deno.test(
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
      const router = new SsrHtmlRouter(manifest, {
        baseUrl: 'http://test',
        extendContext: (base) => ({
          ...base,
          contextId: 'test-context',
        }),
      });

      await router.render('http://test/child');

      // Both root and child page should have the enriched context
      assert(capturedContexts.length >= 1);
      for (const ctx of capturedContexts) {
        assertEquals(asAny(ctx).contextId, 'test-context');
      }
    } finally {
      restore();
    }
  },
);
