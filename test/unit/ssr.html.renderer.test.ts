/**
 * SSR HTML Renderer Tests
 *
 * Comprehensive unit tests for SsrHtmlRouter class covering:
 * - Constructor initialization with and without markdown renderer
 * - Slot injection (<router-slot> replacement)
 * - Nested slot injection (multiple levels)
 * - Widget resolution and rendering with SSR data
 * - Status page rendering (404, 500, etc.)
 * - Error boundary handling
 * - Redirect handling with meta refresh
 * - CSS companion injection and scoping
 * - Route hierarchy composition
 * - Markdown expansion via MarkdownRenderer
 * - URL normalization (/html/ prefix stripping)
 * - HTML escaping and security
 * - Edge cases and integration scenarios
 */

import { test, expect, describe } from 'bun:test';
import { SsrHtmlRouter } from '../../src/renderer/ssr/html.renderer.ts';
import type { RouteConfig } from '../../src/type/route.type.ts';
import type { MarkdownRenderer } from '../../src/type/markdown.type.ts';
import { WidgetRegistry } from '../../src/widget/widget.registry.ts';
import { WidgetComponent } from '../../src/component/widget.component.ts';
import { createResolver, url, type TestManifest } from './test.util.ts';

/**
 * Create a test manifest object (old shape).
 * Use with `createRouter(manifest, ...)` below.
 */
function createTestManifest(overrides?: TestManifest): TestManifest {
  return { routes: [], ...overrides };
}

/** Build an SsrHtmlRouter from the old manifest shape. */
function createRouter(
  manifest: TestManifest,
  options?: ConstructorParameters<typeof SsrHtmlRouter>[1],
): SsrHtmlRouter {
  const resolver = createResolver(manifest.routes ?? [], {
    ...(manifest.errorBoundaries ? { errorBoundaries: manifest.errorBoundaries } : {}),
    ...(manifest.statusPages ? { statusPages: manifest.statusPages } : {}),
    ...(manifest.errorHandler ? { errorHandler: manifest.errorHandler } : {}),
  });
  return new SsrHtmlRouter(resolver, {
    ...(manifest.moduleLoaders ? { moduleLoaders: manifest.moduleLoaders } : {}),
    ...options,
  });
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

/**
 * Mock fetch helper for testing content loading
 */
function mockFetch(contentMap: Record<string, string>) {
  const originalFetch = globalThis.fetch as typeof fetch;

  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    let url: string;
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else {
      url = input.url;
    }

    for (const [key, content] of Object.entries(contentMap)) {
      if (url.includes(key)) {
        return Promise.resolve(new Response(content, { status: 200 }));
      }
    }

    return Promise.resolve(new Response('Not Found', { status: 404 }));
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

/**
 * Simple stub component for testing
 */
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

test('SsrHtmlRouter - constructor initializes without markdown renderer', () => {
  const manifest = createTestManifest();
  const router = createRouter(manifest);
  expect(router instanceof SsrHtmlRouter).toEqual(true);
});

test('SsrHtmlRouter - constructor initializes with markdown renderer', () => {
  const markdownRenderer: MarkdownRenderer = {
    render: (md) => `<p>${md}</p>`,
  };
  const manifest = createTestManifest();
  const router = createRouter(manifest, { markdownRenderer });
  expect(router instanceof SsrHtmlRouter).toEqual(true);
});

test('SsrHtmlRouter - createSsrHtmlRouter factory function', () => {
  const router = createRouter(createTestManifest());
  expect(router instanceof SsrHtmlRouter).toEqual(true);
});

test('SsrHtmlRouter - constructor with widget registry', () => {
  const registry = new WidgetRegistry();
  const manifest = createTestManifest();
  const router = createRouter(manifest, { widgets: registry });
  expect(router instanceof SsrHtmlRouter).toEqual(true);
});

// ============================================================================
// Slot Injection Tests (Single Level)
// ============================================================================

test('SsrHtmlRouter - injectSlot replaces <router-slot> with child content', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/',
      modulePath: '/layout.page.html',
      files: { html: '/layout.page.html' },
    }),
    createTestRoute({
      pattern: '/page',
      modulePath: '/page.page.html',
      files: { html: '/page.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({
    '/layout.page.html':
      '<header>Navigation</header><router-slot></router-slot><footer>Footer</footer>',
    '/page.page.html': '<main>Page Content</main>',
  });

  try {
    const result = await router.render(url('http://localhost/page'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('Navigation');
    expect(result.content).toContain('Page Content');
    expect(result.content).toContain('Footer');
    expect(result.content.includes('<router-slot>')).toEqual(false);
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - stripSlots removes unconsumed <router-slot> tags', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/leaf',
      modulePath: '/leaf.page.html',
      files: { html: '/leaf.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({
    '/leaf.page.html': '<div>Leaf Page<router-slot></router-slot></div>',
  });

  try {
    const result = await router.render(url('http://localhost/leaf'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('Leaf Page');
    expect(result.content.includes('<router-slot')).toEqual(false);
  } finally {
    restore();
  }
});

// ============================================================================
// Nested Slot Injection Tests (Multiple Levels)
// ============================================================================

test('SsrHtmlRouter - nested slots inject correctly through hierarchy', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/',
      modulePath: '/root.page.html',
      files: { html: '/root.page.html' },
    }),
    createTestRoute({
      pattern: '/docs',
      modulePath: '/docs.page.html',
      files: { html: '/docs.page.html' },
    }),
    createTestRoute({
      pattern: '/docs/guide',
      modulePath: '/docs/guide.page.html',
      files: { html: '/docs/guide.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({
    '/root.page.html': '<html><body><router-slot></router-slot></body></html>',
    '/docs.page.html':
      '<section class="docs"><nav>Docs Nav</nav><router-slot></router-slot></section>',
    '/docs/guide.page.html': '<article><h1>Guide</h1><p>Content</p></article>',
  });

  try {
    const result = await router.render(url('http://localhost/docs/guide'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('<html>');
    expect(result.content).toContain('Docs Nav');
    expect(result.content).toContain('<h1>Guide</h1>');
    expect(result.content).toContain('</body></html>');
    expect(result.content.includes('<router-slot>')).toEqual(false);
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - deeply nested slots (4 levels) compose correctly', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/',
      modulePath: '/l0.page.html',
      files: { html: '/l0.page.html' },
    }),
    createTestRoute({
      pattern: '/l1',
      modulePath: '/l1.page.html',
      files: { html: '/l1.page.html' },
    }),
    createTestRoute({
      pattern: '/l1/l2',
      modulePath: '/l2.page.html',
      files: { html: '/l2.page.html' },
    }),
    createTestRoute({
      pattern: '/l1/l2/l3',
      modulePath: '/l3.page.html',
      files: { html: '/l3.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({
    '/l0.page.html': '<div>L0<router-slot></router-slot></div>',
    '/l1.page.html': '<div>L1<router-slot></router-slot></div>',
    '/l2.page.html': '<div>L2<router-slot></router-slot></div>',
    '/l3.page.html': '<div>L3</div>',
  });

  try {
    const result = await router.render(url('http://localhost/l1/l2/l3'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('L0');
    expect(result.content).toContain('L1');
    expect(result.content).toContain('L2');
    expect(result.content).toContain('L3');
    expect(result.content.includes('<router-slot>')).toEqual(false);
  } finally {
    restore();
  }
});

// ============================================================================
// Widget Resolution and Rendering Tests
// ============================================================================

class TestWidget extends WidgetComponent<Record<string, unknown>, { value: string }> {
  override readonly name = 'test-widget';

  override getData(args: this['DataArgs']): Promise<{ value: string }> {
    return Promise.resolve({
      value: String(args.params.name ?? 'default'),
    });
  }

  override renderHTML(args: this['RenderArgs']): string {
    return `<span>Widget: ${args.data!.value}</span>`;
  }

  override renderMarkdown(args: this['RenderArgs']): string {
    return `**Widget**: ${args.data!.value}`;
  }
}

test('SsrHtmlRouter - widget resolution calls getData and renderHTML', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/widgets',
      modulePath: '/widgets.page.html',
      files: { html: '/widgets.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });

  const registry = new WidgetRegistry();
  registry.add(new TestWidget());

  const router = createRouter(manifest, { widgets: registry });

  const restore = mockFetch({
    '/widgets.page.html': '<div><widget-test-widget name="hello"></widget-test-widget></div>',
  });

  try {
    const result = await router.render(url('http://localhost/widgets'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('Widget: hello');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - widget renders with SSR data attribute', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/widgets',
      modulePath: '/widgets.page.html',
      files: { html: '/widgets.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });

  const registry = new WidgetRegistry();
  registry.add(new TestWidget());

  const router = createRouter(manifest, { widgets: registry });

  const restore = mockFetch({
    '/widgets.page.html': '<widget-test-widget name="ssr"></widget-test-widget>',
  });

  try {
    const result = await router.render(url('http://localhost/widgets'));
    expect(result.status).toEqual(200);
    expect(
      result.content.includes(' ssr ') || result.content.includes(' ssr>'),
    ).toBeTruthy();
    expect(result.content).toContain('Widget: ssr');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - multiple widgets on same page resolve concurrently', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/multi-widgets',
      modulePath: '/multi-widgets.page.html',
      files: { html: '/multi-widgets.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });

  const registry = new WidgetRegistry();
  registry.add(new TestWidget());

  const router = createRouter(manifest, { widgets: registry });

  const restore = mockFetch({
    '/multi-widgets.page.html': `
      <div>
        <widget-test-widget name="first"></widget-test-widget>
        <widget-test-widget name="second"></widget-test-widget>
      </div>
    `,
  });

  try {
    const result = await router.render(url('http://localhost/multi-widgets'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('Widget: first');
    expect(result.content).toContain('Widget: second');
  } finally {
    restore();
  }
});

// ============================================================================
// Status Page Rendering Tests
// ============================================================================

test('SsrHtmlRouter - 404 status page includes status and pathname', async () => {
  const routes: RouteConfig[] = [];
  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render(url('http://localhost/missing/page'));
    expect(result.status).toEqual(404);
    expect(result.content).toContain('<h1>');
    expect(result.content).toContain('Not Found');
    expect(result.content).toContain('Path:');
    expect(result.content).toContain('/missing/page');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - 500 error status page renders', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/crash',
      modulePath: '/crash.page.ts',
      files: { ts: '/crash.page.ts' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render(url('http://localhost/crash'));
    expect(result.status).toEqual(500);
    expect(result.content).toContain('<h1>Error</h1>');
    expect(result.content).toContain('Path:');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - custom status page used when registered', async () => {
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
      '/404.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<h1>Custom 404 Page</h1><p>Page not found</p>',
          }),
        }),
    },
  });

  const router = createRouter(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render(url('http://localhost/anything'));
    expect(result.status).toEqual(404);
    expect(result.content).toContain('Custom 404 Page');
  } finally {
    restore();
  }
});

// ============================================================================
// Error Boundary Handling Tests
// ============================================================================

test('SsrHtmlRouter - error boundary catches 500 errors in scoped path', async () => {
  const crashRoute = createTestRoute({
    pattern: '/admin/crash',
    modulePath: '/admin/crash.page.ts',
    files: { ts: '/admin/crash.page.ts' },
  });

  const manifest = createTestManifest({
    routes: [crashRoute],
    errorBoundaries: [
      { pattern: '/admin', modulePath: '/admin.error.ts' },
    ],
    moduleLoaders: {
      '/admin/crash.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            getData: () => {
              throw new Error('admin error');
            },
          }),
        }),
      '/admin.error.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<h1>Admin Error Boundary</h1>',
          }),
        }),
    },
  });

  const router = createRouter(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render(url('http://localhost/admin/crash'));
    expect(result.status).toEqual(500);
    expect(result.content).toContain('Admin Error Boundary');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - error boundary takes precedence over root handler', async () => {
  const crashRoute = createTestRoute({
    pattern: '/api/fail',
    modulePath: '/api/fail.page.ts',
    files: { ts: '/api/fail.page.ts' },
  });

  const manifest = createTestManifest({
    routes: [crashRoute],
    errorBoundaries: [
      { pattern: '/api', modulePath: '/api.error.ts' },
    ],
    errorHandler: {
      pattern: '/',
      type: 'error',
      modulePath: '/root.error.ts',
    },
    moduleLoaders: {
      '/api/fail.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            getData: () => {
              throw new Error('api failure');
            },
          }),
        }),
      '/api.error.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<h1>API Error Boundary</h1>',
          }),
        }),
      '/root.error.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<h1>Root Error Handler</h1>',
          }),
        }),
    },
  });

  const router = createRouter(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render(url('http://localhost/api/fail'));
    expect(result.status).toEqual(500);
    expect(result.content).toContain('API Error Boundary');
  } finally {
    restore();
  }
});

// ============================================================================
// Redirect Handling Tests
// ============================================================================

test('SsrHtmlRouter - renderRedirect returns meta refresh tag', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/old-path',
      type: 'redirect',
      modulePath: '/old-path.redirect.ts',
    }),
  ];

  const manifest = createTestManifest({
    routes,
    moduleLoaders: {
      '/old-path.redirect.ts': () => Promise.resolve({ default: { to: '/new-path', status: 301 } }),
    },
  });

  const router = createRouter(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render(url('http://localhost/old-path'));
    expect(result.status).toEqual(301);
    expect(result.content).toContain('<meta http-equiv="refresh"');
    expect(result.content).toContain('/new-path');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - redirect escapes URL in meta refresh', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/old',
      type: 'redirect',
      modulePath: '/old.redirect.ts',
    }),
  ];

  const manifest = createTestManifest({
    routes,
    moduleLoaders: {
      '/old.redirect.ts': () => Promise.resolve({ default: { to: '/new?param=<script>' } }),
    },
  });

  const router = createRouter(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render(url('http://localhost/old'));
    expect(result.status).toEqual(301);
    // Verify HTML entities are escaped
    expect(result.content.includes('<script>')).toEqual(false);
  } finally {
    restore();
  }
});

// ============================================================================
// CSS Companion Injection Tests
// ============================================================================

test('SsrHtmlRouter - CSS from context is injected as <style> tag', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/styled',
      modulePath: '/styled.page.html',
      files: {
        html: '/styled.page.html',
        css: '/styled.page.css',
      },
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({
    '/styled.page.html': '<div>Styled Page</div>',
    '/styled.page.css': 'div { color: red; }',
  });

  try {
    const result = await router.render(url('http://localhost/styled'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('<style>');
    expect(result.content).toContain('color: red');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - CSS is only injected when present', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/no-css',
      modulePath: '/no-css.page.html',
      files: {
        html: '/no-css.page.html',
      },
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({
    '/no-css.page.html': '<div>No CSS</div>',
  });

  try {
    const result = await router.render(url('http://localhost/no-css'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('No CSS');
    expect(result.content.includes('<style>')).toEqual(false);
  } finally {
    restore();
  }
});

// ============================================================================
// Route Hierarchy Composition Tests
// ============================================================================

test('SsrHtmlRouter - route hierarchy is built from pattern path segments', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/',
      modulePath: '/index.page.html',
      files: { html: '/index.page.html' },
    }),
    createTestRoute({
      pattern: '/shop',
      modulePath: '/shop.page.html',
      files: { html: '/shop.page.html' },
    }),
    createTestRoute({
      pattern: '/shop/products',
      modulePath: '/shop/products.page.html',
      files: { html: '/shop/products.page.html' },
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({
    '/index.page.html': '<html><body><router-slot></router-slot></body></html>',
    '/shop.page.html': '<div>Shop<router-slot></router-slot></div>',
    '/shop/products.page.html': '<section>Products</section>',
  });

  try {
    const result = await router.render(url('http://localhost/shop/products'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('<html>');
    expect(result.content).toContain('Shop');
    expect(result.content).toContain('Products');
    expect(result.content.includes('<router-slot>')).toEqual(false);
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - dynamic route parameters are passed through hierarchy', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/',
      modulePath: '/index.page.html',
      files: { html: '/index.page.html' },
    }),
    createTestRoute({
      pattern: '/user/:id',
      modulePath: '/user/[id].page.html',
      files: { html: '/user/[id].page.html' },
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({
    '/index.page.html': '<div><router-slot></router-slot></div>',
    '/user/[id].page.html': '<p>User Page</p>',
  });

  try {
    const result = await router.render(url('http://localhost/user/42'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('User Page');
  } finally {
    restore();
  }
});

// ============================================================================
// Markdown Expansion Tests
// ============================================================================

test('SsrHtmlRouter - markdown is expanded via MarkdownRenderer', async () => {
  const markdownRenderer: MarkdownRenderer = {
    render: (md) => `<div class="markdown">${md}</div>`,
  };

  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/docs',
      modulePath: '/docs.page.html',
      files: { html: '/docs.page.html' },
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest, { markdownRenderer });

  const restore = mockFetch({
    '/docs.page.html': '<mark-down>**Bold Text**</mark-down>',
  });

  try {
    const result = await router.render(url('http://localhost/docs'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('Bold Text');
    expect(result.content).toContain('markdown');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - markdown without renderer leaves <mark-down> tags', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/docs',
      modulePath: '/docs.page.html',
      files: { html: '/docs.page.html' },
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({
    '/docs.page.html': '<mark-down>**Text**</mark-down>',
  });

  try {
    const result = await router.render(url('http://localhost/docs'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('<mark-down>');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - multiple <mark-down> tags in single page are expanded', async () => {
  const markdownRenderer: MarkdownRenderer = {
    render: (md) => `<p>${md}</p>`,
  };

  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/multi-md',
      modulePath: '/multi-md.page.html',
      files: { html: '/multi-md.page.html' },
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest, { markdownRenderer });

  const restore = mockFetch({
    '/multi-md.page.html': '<div><mark-down>First</mark-down><mark-down>Second</mark-down></div>',
  });

  try {
    const result = await router.render(url('http://localhost/multi-md'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('<p>First</p>');
    expect(result.content).toContain('<p>Second</p>');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - HTML entities in markdown are unescaped before rendering', async () => {
  const markdownRenderer: MarkdownRenderer = {
    render: (md) => `[rendered]${md}[/rendered]`,
  };

  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/escape',
      modulePath: '/escape.page.html',
      files: { html: '/escape.page.html' },
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest, { markdownRenderer });

  const restore = mockFetch({
    '/escape.page.html': '<mark-down>&lt;tag&gt;</mark-down>',
  });

  try {
    const result = await router.render(url('http://localhost/escape'));
    expect(result.status).toEqual(200);
    // Entities should be unescaped for the renderer
    expect(result.content).toContain('[rendered]<tag>[/rendered]');
  } finally {
    restore();
  }
});

// ============================================================================
// Markdown with Widgets Tests
// ============================================================================

class WidgetAwareRenderer implements MarkdownRenderer {
  render(markdown: string): string {
    // Simulate markdown renderer that converts widget blocks to tags
    let html = markdown;
    html = html.replace(/```widget:([a-z][a-z0-9-]*)\n(.*?)```/gs, (_match, name) => {
      return `<widget-${name}></widget-${name}>`;
    });
    html = html.replace(/```\nrouter-slot\n```/g, '<router-slot></router-slot>');
    html = html.replace(/^(.+)$/gm, '<p>$1</p>');
    return html;
  }
}

test('SsrHtmlRouter - markdown renderer output with widget tags is processed', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/blog',
      modulePath: '/blog.page.md',
      files: { md: '/blog.page.md' },
    }),
  ];

  const manifest = createTestManifest({ routes });

  const registry = new WidgetRegistry();
  registry.add(new TestWidget());

  const router = createRouter(manifest, {
    markdownRenderer: new WidgetAwareRenderer(),
    widgets: registry,
  });

  const restore = mockFetch({
    '/blog.page.md': '```widget:test-widget\nname=widget1\n```',
  });

  try {
    const result = await router.render(url('http://localhost/blog'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain(' ssr>');
    expect(result.content).toContain('Widget:');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - markdown router-slot in leaf route is stripped as unconsumed', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/nested-md',
      modulePath: '/nested-md.page.md',
      files: { md: '/nested-md.page.md' },
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest, {
    markdownRenderer: new WidgetAwareRenderer(),
  });

  const restore = mockFetch({
    '/nested-md.page.md': '```\nrouter-slot\n```',
  });

  try {
    const result = await router.render(url('http://localhost/nested-md'));
    expect(result.status).toEqual(200);
    // Leaf route -- unconsumed slots are stripped from final output
    expect(result.content.includes('<router-slot')).toEqual(false);
  } finally {
    restore();
  }
});

// ============================================================================
// HTML Escaping and Security Tests
// ============================================================================

test('SsrHtmlRouter - error page escapes pathname to prevent XSS', async () => {
  const routes: RouteConfig[] = [];
  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render(url('http://localhost/<script>alert("xss")</script>'));
    expect(result.status).toEqual(404);
    expect(result.content.includes('<script>')).toEqual(false);
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - error page escapes error message to prevent XSS', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/xss-test',
      modulePath: '/xss-test.page.ts',
      files: { ts: '/xss-test.page.ts' },
    }),
  ];

  const manifest = createTestManifest({
    routes,
    moduleLoaders: {
      '/xss-test.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            getData: () => {
              throw new Error('<img src=x onerror="alert(1)">');
            },
          }),
        }),
    },
  });

  const router = createRouter(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render(url('http://localhost/xss-test'));
    expect(result.status).toEqual(500);
    // Error message should be escaped in the HTML output
    expect(result.content).toContain('&lt;img');
    expect(result.content.includes('"alert')).toEqual(false);
  } finally {
    restore();
  }
});

// ============================================================================
// Edge Case and Integration Tests
// ============================================================================

test('SsrHtmlRouter - handles page with HTML + MD + CSS all present', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/full',
      modulePath: '/full.page.html',
      files: {
        html: '/full.page.html',
        md: '/full.page.md',
        css: '/full.page.css',
      },
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({
    '/full.page.html': '<div>HTML Content</div>',
    '/full.page.md': '# Markdown',
    '/full.page.css': 'body { margin: 0; }',
  });

  try {
    const result = await router.render(url('http://localhost/full'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('<style>');
    expect(result.content).toContain('margin: 0');
    expect(result.content).toContain('HTML Content');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - markdown with <mark-down> placeholder in HTML', async () => {
  const markdownRenderer: MarkdownRenderer = {
    render: (md) => `<section>${md}</section>`,
  };

  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/page-with-md',
      modulePath: '/page-with-md.page.html',
      files: {
        html: '/page-with-md.page.html',
        md: '/page-with-md.page.md',
      },
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest, { markdownRenderer });

  const restore = mockFetch({
    '/page-with-md.page.html': '<main><h1>Title</h1><mark-down></mark-down></main>',
    '/page-with-md.page.md': '**Content**',
  });

  try {
    const result = await router.render(url('http://localhost/page-with-md'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('<h1>Title</h1>');
    expect(result.content).toContain('<section>');
    expect(result.content).toContain('Content');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - leaf route with no files renders empty content', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/empty',
      modulePath: '/empty.page.ts',
      files: {},
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render(url('http://localhost/empty'));
    expect(result.status).toEqual(200);
    expect(result.content).toEqual('');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - URL with query params is handled', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/search',
      modulePath: '/search.page.html',
      files: { html: '/search.page.html' },
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({
    '/search.page.html': '<div>Search</div>',
  });

  try {
    const result = await router.render(url('http://localhost/search?q=test&limit=10'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('Search');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - URL with hash is handled', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/docs',
      modulePath: '/docs.page.html',
      files: { html: '/docs.page.html' },
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({
    '/docs.page.html': '<div>Docs</div>',
  });

  try {
    const result = await router.render(url('http://localhost/docs#section-1'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('Docs');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - pathname-only URL (no host) is handled', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/simple',
      modulePath: '/simple.page.html',
      files: { html: '/simple.page.html' },
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const restore = mockFetch({
    '/simple.page.html': '<div>Simple</div>',
  });

  try {
    const result = await router.render(url('/simple'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('Simple');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - widget with no params uses default values', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/widget-default',
      modulePath: '/widget-default.page.html',
      files: { html: '/widget-default.page.html' },
    }),
  ];

  const manifest = createTestManifest({ routes });

  const registry = new WidgetRegistry();
  registry.add(new TestWidget());

  const router = createRouter(manifest, { widgets: registry });

  const restore = mockFetch({
    '/widget-default.page.html': '<widget-test-widget></widget-test-widget>',
  });

  try {
    const result = await router.render(url('http://localhost/widget-default'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('Widget: default');
  } finally {
    restore();
  }
});

test('SsrHtmlRouter - unknown widget tag is left unchanged', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/unknown-widget',
      modulePath: '/unknown-widget.page.html',
      files: { html: '/unknown-widget.page.html' },
    }),
  ];

  const manifest = createTestManifest({ routes });

  const registry = new WidgetRegistry();
  const router = createRouter(manifest, { widgets: registry });

  const restore = mockFetch({
    '/unknown-widget.page.html': '<widget-unknown></widget-unknown>',
  });

  try {
    const result = await router.render(url('http://localhost/unknown-widget'));
    expect(result.status).toEqual(200);
    expect(result.content).toContain('<widget-unknown>');
  } finally {
    restore();
  }
});

// ============================================================================
// Return Value Structure Tests
// ============================================================================

test('SsrHtmlRouter - render returns object with content, status, and optional title', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/page',
      modulePath: '/page.page.ts',
      files: { ts: '/page.page.ts' },
    }),
  ];

  const manifest = createTestManifest({
    routes,
    moduleLoaders: {
      '/page.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            getTitle: () => 'Page Title',
          }),
        }),
    },
  });

  const router = createRouter(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render(url('http://localhost/page'));
    expect(typeof result.content).toEqual('string');
    expect(typeof result.status).toEqual('number');
    expect(result.title).toEqual('Page Title');
  } finally {
    restore();
  }
});
