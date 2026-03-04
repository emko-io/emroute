/**
 * SSR HTML Renderer Tests
 *
 * Unit tests for SsrHtmlRenderer (core/renderer/html.renderer.ts):
 * - Slot injection (<router-slot> replacement)
 * - Nested slot injection (multiple levels)
 * - Widget resolution and rendering with SSR data
 * - Status page rendering (404, 500, etc.)
 * - Error boundary handling
 * - Redirect handling with meta refresh
 * - CSS companion injection and scoping
 * - Route hierarchy composition
 * - Markdown expansion via MarkdownRenderer
 * - HTML escaping and security
 * - Edge cases and integration scenarios
 */

import { test, expect } from 'bun:test';
import { SsrHtmlRenderer, type SsrHtmlRendererOptions } from '../../core/renderer/html.renderer.ts';
import { Pipeline } from '../../core/pipeline/pipeline.ts';
import type { RouteConfig } from '../../core/type/route.type.ts';
import type { MarkdownRenderer } from '../../core/type/markdown.type.ts';
import { WidgetRegistry } from '../../core/widget/widget.registry.ts';
import { WidgetComponent } from '../../core/component/widget.component.ts';
import { Runtime } from '../../core/runtime/abstract.runtime.ts';
import { writeManifest, url, type TestManifest } from './test.util.ts';

// ============================================================================
// Test Infrastructure
// ============================================================================

/** In-memory Runtime for testing — stores files as strings. */
class MockRuntime extends Runtime {
  private files = new Map<string, string>();

  set(path: string, content: string): void {
    const abs = path.startsWith('/') ? path : '/' + path;
    this.files.set(abs, content);
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
}

/** Build an SsrHtmlRenderer from the old manifest shape. */
function createRenderer(
  manifest: TestManifest,
  runtime: MockRuntime,
  options?: Omit<SsrHtmlRendererOptions, 'widgets'> & { widgets?: WidgetRegistry },
): SsrHtmlRenderer {
  writeManifest(runtime, manifest.routes ?? [], {
    ...(manifest.errorBoundaries ? { errorBoundaries: manifest.errorBoundaries } : {}),
    ...(manifest.statusPages ? { statusPages: manifest.statusPages } : {}),
    ...(manifest.errorHandler ? { errorHandler: manifest.errorHandler } : {}),
  });
  const pipeline = new Pipeline({
    runtime,
    ...(manifest.moduleLoaders ? { moduleLoaders: manifest.moduleLoaders } : {}),
  });
  return new SsrHtmlRenderer(pipeline, options);
}

function createTestManifest(overrides?: TestManifest): TestManifest {
  return { routes: [], ...overrides };
}

function createTestRoute(overrides?: Partial<RouteConfig>): RouteConfig {
  return {
    pattern: '/test',
    type: 'page',
    modulePath: '/test.page.ts',
    ...overrides,
  };
}

function stubComponent(overrides: {
  name?: string;
  getData?: () => Promise<unknown>;
  renderHTML?: (args: unknown) => string;
  renderMarkdown?: (args: unknown) => string;
  getTitle?: (args: unknown) => string | undefined;
} = {}) {
  return {
    name: overrides.name ?? 'stub',
    getData: overrides.getData ?? (() => Promise.resolve(null)),
    renderHTML: overrides.renderHTML ?? (() => '<p>stub</p>'),
    renderMarkdown: overrides.renderMarkdown ?? (() => 'stub'),
    getTitle: overrides.getTitle ?? (() => undefined),
    renderError: () => '<div>error</div>',
    renderMarkdownError: () => '> error',
  };
}

// ============================================================================
// Constructor Initialization Tests
// ============================================================================

test('SsrHtmlRenderer - constructor initializes without markdown renderer', () => {
  const runtime = new MockRuntime();
  const renderer = createRenderer(createTestManifest(), runtime);
  expect(renderer instanceof SsrHtmlRenderer).toEqual(true);
});

test('SsrHtmlRenderer - constructor initializes with markdown renderer', () => {
  const markdownRenderer: MarkdownRenderer = { render: (md) => `<p>${md}</p>` };
  const runtime = new MockRuntime();
  const renderer = createRenderer(createTestManifest(), runtime, { markdownRenderer });
  expect(renderer instanceof SsrHtmlRenderer).toEqual(true);
});

test('SsrHtmlRenderer - constructor with widget registry', () => {
  const registry = new WidgetRegistry();
  const runtime = new MockRuntime();
  const renderer = createRenderer(createTestManifest(), runtime, { widgets: registry });
  expect(renderer instanceof SsrHtmlRenderer).toEqual(true);
});

// ============================================================================
// Slot Injection Tests (Single Level)
// ============================================================================

test('SsrHtmlRenderer - injectSlot replaces <router-slot> with child content', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/', modulePath: '/layout.page.html', files: { html: '/layout.page.html' } }),
    createTestRoute({ pattern: '/page', modulePath: '/page.page.html', files: { html: '/page.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/layout.page.html', '<header>Navigation</header><router-slot></router-slot><footer>Footer</footer>');
  runtime.set('/page.page.html', '<main>Page Content</main>');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('http://localhost/page'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Navigation');
  expect(result.content).toContain('Page Content');
  expect(result.content).toContain('Footer');
  expect(result.content.includes('<router-slot>')).toEqual(false);
});

test('SsrHtmlRenderer - stripSlots removes unconsumed <router-slot> tags', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/leaf', modulePath: '/leaf.page.html', files: { html: '/leaf.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/leaf.page.html', '<div>Leaf Page<router-slot></router-slot></div>');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('http://localhost/leaf'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Leaf Page');
  expect(result.content.includes('<router-slot')).toEqual(false);
});

// ============================================================================
// Nested Slot Injection Tests (Multiple Levels)
// ============================================================================

test('SsrHtmlRenderer - nested slots inject correctly through hierarchy', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/', modulePath: '/root.page.html', files: { html: '/root.page.html' } }),
    createTestRoute({ pattern: '/docs', modulePath: '/docs.page.html', files: { html: '/docs.page.html' } }),
    createTestRoute({ pattern: '/docs/guide', modulePath: '/docs/guide.page.html', files: { html: '/docs/guide.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/root.page.html', '<html><body><router-slot></router-slot></body></html>');
  runtime.set('/docs.page.html', '<section class="docs"><nav>Docs Nav</nav><router-slot></router-slot></section>');
  runtime.set('/docs/guide.page.html', '<article><h1>Guide</h1><p>Content</p></article>');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('http://localhost/docs/guide'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('<html>');
  expect(result.content).toContain('Docs Nav');
  expect(result.content).toContain('<h1>Guide</h1>');
  expect(result.content).toContain('</body></html>');
  expect(result.content.includes('<router-slot>')).toEqual(false);
});

test('SsrHtmlRenderer - deeply nested slots (4 levels) compose correctly', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/', modulePath: '/l0.page.html', files: { html: '/l0.page.html' } }),
    createTestRoute({ pattern: '/l1', modulePath: '/l1.page.html', files: { html: '/l1.page.html' } }),
    createTestRoute({ pattern: '/l1/l2', modulePath: '/l2.page.html', files: { html: '/l2.page.html' } }),
    createTestRoute({ pattern: '/l1/l2/l3', modulePath: '/l3.page.html', files: { html: '/l3.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/l0.page.html', '<div>L0<router-slot></router-slot></div>');
  runtime.set('/l1.page.html', '<div>L1<router-slot></router-slot></div>');
  runtime.set('/l2.page.html', '<div>L2<router-slot></router-slot></div>');
  runtime.set('/l3.page.html', '<div>L3</div>');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('http://localhost/l1/l2/l3'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('L0');
  expect(result.content).toContain('L1');
  expect(result.content).toContain('L2');
  expect(result.content).toContain('L3');
  expect(result.content.includes('<router-slot>')).toEqual(false);
});

// ============================================================================
// Widget Resolution and Rendering Tests
// ============================================================================

class TestWidget extends WidgetComponent<Record<string, unknown>, { value: string }> {
  override readonly name = 'test-widget';

  override getData(args: this['DataArgs']): Promise<{ value: string }> {
    return Promise.resolve({ value: String(args.params.name ?? 'default') });
  }

  override renderHTML(args: this['RenderArgs']): string {
    return `<span>Widget: ${args.data!.value}</span>`;
  }

  override renderMarkdown(args: this['RenderArgs']): string {
    return `**Widget**: ${args.data!.value}`;
  }
}

test('SsrHtmlRenderer - widget resolution calls getData and renderHTML', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/widgets', modulePath: '/widgets.page.html', files: { html: '/widgets.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/widgets.page.html', '<div><widget-test-widget name="hello"></widget-test-widget></div>');

  const registry = new WidgetRegistry();
  registry.add(new TestWidget());

  const renderer = createRenderer(createTestManifest({ routes }), runtime, { widgets: registry });
  const result = await renderer.render(url('http://localhost/widgets'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Widget: hello');
});

test('SsrHtmlRenderer - widget renders with SSR data attribute', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/widgets', modulePath: '/widgets.page.html', files: { html: '/widgets.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/widgets.page.html', '<widget-test-widget name="ssr"></widget-test-widget>');

  const registry = new WidgetRegistry();
  registry.add(new TestWidget());

  const renderer = createRenderer(createTestManifest({ routes }), runtime, { widgets: registry });
  const result = await renderer.render(url('http://localhost/widgets'));

  expect(result.status).toEqual(200);
  expect(result.content.includes(' ssr ') || result.content.includes(' ssr>')).toBeTruthy();
  expect(result.content).toContain('Widget: ssr');
});

test('SsrHtmlRenderer - multiple widgets on same page resolve concurrently', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/multi-widgets', modulePath: '/multi-widgets.page.html', files: { html: '/multi-widgets.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/multi-widgets.page.html', `
    <div>
      <widget-test-widget name="first"></widget-test-widget>
      <widget-test-widget name="second"></widget-test-widget>
    </div>
  `);

  const registry = new WidgetRegistry();
  registry.add(new TestWidget());

  const renderer = createRenderer(createTestManifest({ routes }), runtime, { widgets: registry });
  const result = await renderer.render(url('http://localhost/multi-widgets'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Widget: first');
  expect(result.content).toContain('Widget: second');
});

// ============================================================================
// Status Page Rendering Tests
// ============================================================================

test('SsrHtmlRenderer - 404 status page includes status and pathname', async () => {
  const runtime = new MockRuntime();
  const renderer = createRenderer(createTestManifest(), runtime);
  const result = await renderer.render(url('http://localhost/missing/page'));

  expect(result.status).toEqual(404);
  expect(result.content).toContain('<h1>');
  expect(result.content).toContain('Not Found');
  expect(result.content).toContain('Path:');
  expect(result.content).toContain('/missing/page');
});

test('SsrHtmlRenderer - 500 error status page renders', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/crash', modulePath: '/crash.page.ts', files: { ts: '/crash.page.ts' } }),
  ];
  const runtime = new MockRuntime();
  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('http://localhost/crash'));

  expect(result.status).toEqual(500);
  expect(result.content).toContain('<h1>Error</h1>');
  expect(result.content).toContain('Path:');
});

test('SsrHtmlRenderer - custom status page used when registered', async () => {
  const statusPageRoute = createTestRoute({
    pattern: '/404',
    modulePath: '/404.page.ts',
    files: { ts: '/404.page.ts' },
    statusCode: 404,
  });

  const manifest = createTestManifest({
    routes: [],
    statusPages: new Map([[404, statusPageRoute]]),
    moduleLoaders: {
      '/404.page.ts': () => Promise.resolve({
        default: stubComponent({ renderHTML: () => '<h1>Custom 404 Page</h1><p>Page not found</p>' }),
      }),
    },
  });

  const runtime = new MockRuntime();
  const renderer = createRenderer(manifest, runtime);
  const result = await renderer.render(url('http://localhost/anything'));

  expect(result.status).toEqual(404);
  expect(result.content).toContain('Custom 404 Page');
});

// ============================================================================
// Error Boundary Handling Tests
// ============================================================================

test('SsrHtmlRenderer - error boundary catches 500 errors in scoped path', async () => {
  const manifest = createTestManifest({
    routes: [createTestRoute({ pattern: '/admin/crash', modulePath: '/admin/crash.page.ts', files: { ts: '/admin/crash.page.ts' } })],
    errorBoundaries: [{ pattern: '/admin', modulePath: '/admin.error.ts' }],
    moduleLoaders: {
      '/admin/crash.page.ts': () => Promise.resolve({
        default: stubComponent({ getData: () => { throw new Error('admin error'); } }),
      }),
      '/admin.error.ts': () => Promise.resolve({
        default: stubComponent({ renderHTML: () => '<h1>Admin Error Boundary</h1>' }),
      }),
    },
  });

  const runtime = new MockRuntime();
  const renderer = createRenderer(manifest, runtime);
  const result = await renderer.render(url('http://localhost/admin/crash'));

  expect(result.status).toEqual(500);
  expect(result.content).toContain('Admin Error Boundary');
});

test('SsrHtmlRenderer - error boundary takes precedence over root handler', async () => {
  const manifest = createTestManifest({
    routes: [createTestRoute({ pattern: '/api/fail', modulePath: '/api/fail.page.ts', files: { ts: '/api/fail.page.ts' } })],
    errorBoundaries: [{ pattern: '/api', modulePath: '/api.error.ts' }],
    errorHandler: { pattern: '/', type: 'error', modulePath: '/root.error.ts' },
    moduleLoaders: {
      '/api/fail.page.ts': () => Promise.resolve({
        default: stubComponent({ getData: () => { throw new Error('api failure'); } }),
      }),
      '/api.error.ts': () => Promise.resolve({
        default: stubComponent({ renderHTML: () => '<h1>API Error Boundary</h1>' }),
      }),
      '/root.error.ts': () => Promise.resolve({
        default: stubComponent({ renderHTML: () => '<h1>Root Error Handler</h1>' }),
      }),
    },
  });

  const runtime = new MockRuntime();
  const renderer = createRenderer(manifest, runtime);
  const result = await renderer.render(url('http://localhost/api/fail'));

  expect(result.status).toEqual(500);
  expect(result.content).toContain('API Error Boundary');
});

// ============================================================================
// Redirect Handling Tests
// ============================================================================

test('SsrHtmlRenderer - renderRedirect returns meta refresh tag', async () => {
  const manifest = createTestManifest({
    routes: [createTestRoute({ pattern: '/old-path', type: 'redirect', modulePath: '/old-path.redirect.ts' })],
    moduleLoaders: {
      '/old-path.redirect.ts': () => Promise.resolve({ default: { to: '/new-path', status: 301 } }),
    },
  });

  const runtime = new MockRuntime();
  const renderer = createRenderer(manifest, runtime);
  const result = await renderer.render(url('http://localhost/old-path'));

  expect(result.status).toEqual(301);
  expect(result.content).toContain('<meta http-equiv="refresh"');
  expect(result.content).toContain('/new-path');
});

test('SsrHtmlRenderer - redirect escapes URL in meta refresh', async () => {
  const manifest = createTestManifest({
    routes: [createTestRoute({ pattern: '/old', type: 'redirect', modulePath: '/old.redirect.ts' })],
    moduleLoaders: {
      '/old.redirect.ts': () => Promise.resolve({ default: { to: '/new?param=<script>' } }),
    },
  });

  const runtime = new MockRuntime();
  const renderer = createRenderer(manifest, runtime);
  const result = await renderer.render(url('http://localhost/old'));

  expect(result.status).toEqual(301);
  expect(result.content.includes('<script>')).toEqual(false);
});

// ============================================================================
// CSS Companion Injection Tests
// ============================================================================

test('SsrHtmlRenderer - CSS from context is injected as <style> tag', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/styled', modulePath: '/styled.page.html', files: { html: '/styled.page.html', css: '/styled.page.css' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/styled.page.html', '<div>Styled Page</div>');
  runtime.set('/styled.page.css', 'div { color: red; }');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('http://localhost/styled'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('<style>');
  expect(result.content).toContain('color: red');
});

test('SsrHtmlRenderer - CSS is only injected when present', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/no-css', modulePath: '/no-css.page.html', files: { html: '/no-css.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/no-css.page.html', '<div>No CSS</div>');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('http://localhost/no-css'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('No CSS');
  expect(result.content.includes('<style>')).toEqual(false);
});

// ============================================================================
// Route Hierarchy Composition Tests
// ============================================================================

test('SsrHtmlRenderer - route hierarchy is built from pattern path segments', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/', modulePath: '/index.page.html', files: { html: '/index.page.html' } }),
    createTestRoute({ pattern: '/shop', modulePath: '/shop.page.html', files: { html: '/shop.page.html' } }),
    createTestRoute({ pattern: '/shop/products', modulePath: '/shop/products.page.html', files: { html: '/shop/products.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/index.page.html', '<html><body><router-slot></router-slot></body></html>');
  runtime.set('/shop.page.html', '<div>Shop<router-slot></router-slot></div>');
  runtime.set('/shop/products.page.html', '<section>Products</section>');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('http://localhost/shop/products'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('<html>');
  expect(result.content).toContain('Shop');
  expect(result.content).toContain('Products');
  expect(result.content.includes('<router-slot>')).toEqual(false);
});

test('SsrHtmlRenderer - dynamic route parameters are passed through hierarchy', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/', modulePath: '/index.page.html', files: { html: '/index.page.html' } }),
    createTestRoute({ pattern: '/user/:id', modulePath: '/user/[id].page.html', files: { html: '/user/[id].page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/index.page.html', '<div><router-slot></router-slot></div>');
  runtime.set('/user/[id].page.html', '<p>User Page</p>');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('http://localhost/user/42'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('User Page');
});

// ============================================================================
// Markdown Expansion Tests
// ============================================================================

test('SsrHtmlRenderer - markdown is expanded via MarkdownRenderer', async () => {
  const markdownRenderer: MarkdownRenderer = { render: (md) => `<div class="markdown">${md}</div>` };
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/docs', modulePath: '/docs.page.html', files: { html: '/docs.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/docs.page.html', '<mark-down>**Bold Text**</mark-down>');

  const renderer = createRenderer(createTestManifest({ routes }), runtime, { markdownRenderer });
  const result = await renderer.render(url('http://localhost/docs'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Bold Text');
  expect(result.content).toContain('markdown');
});

test('SsrHtmlRenderer - markdown without renderer leaves <mark-down> tags', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/docs', modulePath: '/docs.page.html', files: { html: '/docs.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/docs.page.html', '<mark-down>**Text**</mark-down>');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('http://localhost/docs'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('<mark-down>');
});

test('SsrHtmlRenderer - multiple <mark-down> tags in single page are expanded', async () => {
  const markdownRenderer: MarkdownRenderer = { render: (md) => `<p>${md}</p>` };
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/multi-md', modulePath: '/multi-md.page.html', files: { html: '/multi-md.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/multi-md.page.html', '<div><mark-down>First</mark-down><mark-down>Second</mark-down></div>');

  const renderer = createRenderer(createTestManifest({ routes }), runtime, { markdownRenderer });
  const result = await renderer.render(url('http://localhost/multi-md'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('<p>First</p>');
  expect(result.content).toContain('<p>Second</p>');
});

test('SsrHtmlRenderer - HTML entities in markdown are unescaped before rendering', async () => {
  const markdownRenderer: MarkdownRenderer = { render: (md) => `[rendered]${md}[/rendered]` };
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/escape', modulePath: '/escape.page.html', files: { html: '/escape.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/escape.page.html', '<mark-down>&lt;tag&gt;</mark-down>');

  const renderer = createRenderer(createTestManifest({ routes }), runtime, { markdownRenderer });
  const result = await renderer.render(url('http://localhost/escape'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('[rendered]<tag>[/rendered]');
});

// ============================================================================
// HTML Escaping and Security Tests
// ============================================================================

test('SsrHtmlRenderer - error page escapes pathname to prevent XSS', async () => {
  const runtime = new MockRuntime();
  const renderer = createRenderer(createTestManifest(), runtime);
  const result = await renderer.render(url('http://localhost/<script>alert("xss")</script>'));

  expect(result.status).toEqual(404);
  expect(result.content.includes('<script>')).toEqual(false);
});

test('SsrHtmlRenderer - error page escapes error message to prevent XSS', async () => {
  const manifest = createTestManifest({
    routes: [createTestRoute({ pattern: '/xss-test', modulePath: '/xss-test.page.ts', files: { ts: '/xss-test.page.ts' } })],
    moduleLoaders: {
      '/xss-test.page.ts': () => Promise.resolve({
        default: stubComponent({ getData: () => { throw new Error('<img src=x onerror="alert(1)">'); } }),
      }),
    },
  });

  const runtime = new MockRuntime();
  const renderer = createRenderer(manifest, runtime);
  const result = await renderer.render(url('http://localhost/xss-test'));

  expect(result.status).toEqual(500);
  expect(result.content).toContain('&lt;img');
  expect(result.content.includes('"alert')).toEqual(false);
});

// ============================================================================
// Edge Case and Integration Tests
// ============================================================================

test('SsrHtmlRenderer - handles page with HTML + MD + CSS all present', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/full', modulePath: '/full.page.html', files: { html: '/full.page.html', md: '/full.page.md', css: '/full.page.css' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/full.page.html', '<div>HTML Content</div>');
  runtime.set('/full.page.md', '# Markdown');
  runtime.set('/full.page.css', 'body { margin: 0; }');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('http://localhost/full'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('<style>');
  expect(result.content).toContain('margin: 0');
  expect(result.content).toContain('HTML Content');
});

test('SsrHtmlRenderer - markdown with <mark-down> placeholder in HTML', async () => {
  const markdownRenderer: MarkdownRenderer = { render: (md) => `<section>${md}</section>` };
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/page-with-md', modulePath: '/page-with-md.page.html', files: { html: '/page-with-md.page.html', md: '/page-with-md.page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page-with-md.page.html', '<main><h1>Title</h1><mark-down></mark-down></main>');
  runtime.set('/page-with-md.page.md', '**Content**');

  const renderer = createRenderer(createTestManifest({ routes }), runtime, { markdownRenderer });
  const result = await renderer.render(url('http://localhost/page-with-md'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('<h1>Title</h1>');
  expect(result.content).toContain('<section>');
  expect(result.content).toContain('Content');
});

test('SsrHtmlRenderer - leaf route with no files renders empty content', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/empty', modulePath: '/empty.page.ts', files: {} }),
  ];
  const runtime = new MockRuntime();
  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('http://localhost/empty'));

  expect(result.status).toEqual(200);
  expect(result.content).toEqual('');
});

test('SsrHtmlRenderer - URL with query params is handled', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/search', modulePath: '/search.page.html', files: { html: '/search.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/search.page.html', '<div>Search</div>');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('http://localhost/search?q=test&limit=10'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Search');
});

test('SsrHtmlRenderer - URL with hash is handled', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/docs', modulePath: '/docs.page.html', files: { html: '/docs.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/docs.page.html', '<div>Docs</div>');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('http://localhost/docs#section-1'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Docs');
});

test('SsrHtmlRenderer - pathname-only URL (no host) is handled', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/simple', modulePath: '/simple.page.html', files: { html: '/simple.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/simple.page.html', '<div>Simple</div>');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/simple'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Simple');
});

test('SsrHtmlRenderer - widget with no params uses default values', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/widget-default', modulePath: '/widget-default.page.html', files: { html: '/widget-default.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/widget-default.page.html', '<widget-test-widget></widget-test-widget>');

  const registry = new WidgetRegistry();
  registry.add(new TestWidget());

  const renderer = createRenderer(createTestManifest({ routes }), runtime, { widgets: registry });
  const result = await renderer.render(url('http://localhost/widget-default'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Widget: default');
});

test('SsrHtmlRenderer - unknown widget tag is left unchanged', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/unknown-widget', modulePath: '/unknown-widget.page.html', files: { html: '/unknown-widget.page.html' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/unknown-widget.page.html', '<widget-unknown></widget-unknown>');

  const registry = new WidgetRegistry();
  const renderer = createRenderer(createTestManifest({ routes }), runtime, { widgets: registry });
  const result = await renderer.render(url('http://localhost/unknown-widget'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('<widget-unknown>');
});

// ============================================================================
// Return Value Structure Tests
// ============================================================================

test('SsrHtmlRenderer - render returns object with content, status, and optional title', async () => {
  const manifest = createTestManifest({
    routes: [createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { ts: '/page.page.ts' } })],
    moduleLoaders: {
      '/page.page.ts': () => Promise.resolve({ default: stubComponent({ getTitle: () => 'Page Title' }) }),
    },
  });

  const runtime = new MockRuntime();
  const renderer = createRenderer(manifest, runtime);
  const result = await renderer.render(url('http://localhost/page'));

  expect(typeof result.content).toEqual('string');
  expect(typeof result.status).toEqual('number');
  expect(result.title).toEqual('Page Title');
});
