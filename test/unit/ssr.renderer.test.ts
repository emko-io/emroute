/**
 * SSR Renderer Base Tests
 *
 * Unit tests for the abstract SsrRenderer base class.
 * Uses a minimal TestRenderer subclass to exercise the shared render() pipeline:
 * - Route matching (200, 404)
 * - Redirect handling (301)
 * - Error handling (500) with error boundaries, root handler, and fallback
 * - Response throws (status page rendering)
 * - Route hierarchy composition with slot injection
 * - Unconsumed slot stripping
 * - SSR prefix stripping (/html/, /md/)
 * - Title propagation from component.getTitle()
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { SsrRenderer } from '../../src/renderer/ssr/ssr.renderer.ts';
import type { PageComponent } from '../../src/component/page.component.ts';
import type { RouteConfig, RouteInfo, RoutesManifest } from '../../src/type/route.type.ts';
import { DEFAULT_ROOT_ROUTE } from '../../src/route/route.core.ts';

// ============================================================================
// Test subclass
// ============================================================================

const SLOT = '{{SLOT}}';

class TestRenderer extends SsrRenderer {
  protected override readonly label = 'TEST';

  protected override renderContent(
    component: PageComponent,
    args: PageComponent['RenderArgs'],
  ): string {
    return component.renderHTML(args);
  }

  protected override renderRedirect(to: string): string {
    return 'REDIRECT:' + to;
  }

  protected override renderStatusPage(status: number, pathname: string): string {
    return 'STATUS:' + status + ':' + pathname;
  }

  protected override renderErrorPage(_error: unknown, pathname: string): string {
    return 'ERROR:' + pathname;
  }

  protected override injectSlot(parent: string, child: string): string {
    return parent.replace(SLOT, child);
  }

  protected override stripSlots(result: string): string {
    return result.replaceAll(SLOT, '');
  }

  protected override renderRouteContent(
    routeInfo: RouteInfo,
    route: RouteConfig,
  ): Promise<{ content: string; title?: string }> {
    if (route.modulePath === DEFAULT_ROOT_ROUTE.modulePath) {
      return Promise.resolve({ content: SLOT });
    }
    return this.loadRouteContent(routeInfo, route);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function createManifest(overrides?: Partial<RoutesManifest>): RoutesManifest {
  return {
    routes: [],
    errorBoundaries: [],
    statusPages: new Map(),
    ...overrides,
  };
}

function createRoute(overrides?: Partial<RouteConfig>): RouteConfig {
  return {
    pattern: '/test',
    type: 'page',
    modulePath: '/test.page.ts',
    ...overrides,
  };
}

function mockFetch(responses: Record<string, string>): () => void {
  const original = globalThis.fetch;

  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

    for (const [key, content] of Object.entries(responses)) {
      if (url.includes(key)) {
        return Promise.resolve(new Response(content, { status: 200 }));
      }
    }
    return Promise.resolve(new Response('Not Found', { status: 404 }));
  }) as typeof fetch;

  return () => {
    globalThis.fetch = original;
  };
}

/** Build a PageComponent stub with optional overrides. */
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
// 1. Route matching returns 200 with content
// ============================================================================

Deno.test('TestRenderer - matched route returns 200 with rendered content', async () => {
  const routes = [
    createRoute({
      pattern: '/hello',
      modulePath: '/hello.page.ts',
      files: { ts: '/hello.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/hello.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<h1>Hello World</h1>',
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/hello');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, 'Hello World');
  } finally {
    restore();
  }
});

// ============================================================================
// 2. Non-existent route returns 404 with status page
// ============================================================================

Deno.test('TestRenderer - non-existent route returns 404 with status page', async () => {
  const manifest = createManifest({
    routes: [createRoute({ pattern: '/exists', modulePath: '/exists.page.ts' })],
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/nowhere');
    assertEquals(result.status, 404);
    assertStringIncludes(result.content, 'STATUS:404:/nowhere');
  } finally {
    restore();
  }
});

// ============================================================================
// 3. Redirect route returns 301 with redirect content
// ============================================================================

Deno.test('TestRenderer - redirect route returns 301 with REDIRECT content', async () => {
  const routes = [
    createRoute({
      pattern: '/old',
      type: 'redirect',
      modulePath: '/old.redirect.ts',
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/old.redirect.ts': () => Promise.resolve({ default: { to: '/new', status: 301 } }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/old');
    assertEquals(result.status, 301);
    assertEquals(result.content, 'REDIRECT:/new');
  } finally {
    restore();
  }
});

Deno.test('TestRenderer - redirect defaults to 301 when status omitted', async () => {
  const routes = [
    createRoute({
      pattern: '/legacy',
      type: 'redirect',
      modulePath: '/legacy.redirect.ts',
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/legacy.redirect.ts': () => Promise.resolve({ default: { to: '/modern' } }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/legacy');
    assertEquals(result.status, 301);
    assertEquals(result.content, 'REDIRECT:/modern');
  } finally {
    restore();
  }
});

// ============================================================================
// 4. Error in getData returns 500 with error content
// ============================================================================

Deno.test('TestRenderer - error in getData returns 500 with error page', async () => {
  const routes = [
    createRoute({
      pattern: '/boom',
      modulePath: '/boom.page.ts',
      files: { ts: '/boom.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/boom.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            getData: () => {
              throw new Error('database exploded');
            },
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/boom');
    assertEquals(result.status, 500);
    assertStringIncludes(result.content, 'ERROR:/boom');
  } finally {
    restore();
  }
});

// ============================================================================
// 5. Response throw renders status page
// ============================================================================

Deno.test('TestRenderer - thrown Response renders status page with correct status', async () => {
  const routes = [
    createRoute({
      pattern: '/forbidden',
      modulePath: '/forbidden.page.ts',
      files: { ts: '/forbidden.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/forbidden.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            getData: () => {
              throw new Response(null, { status: 403 });
            },
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/forbidden');
    assertEquals(result.status, 403);
    assertStringIncludes(result.content, 'STATUS:403:/forbidden');
  } finally {
    restore();
  }
});

Deno.test('TestRenderer - thrown Response uses custom status page when registered', async () => {
  const statusPage = createRoute({
    pattern: '/403',
    modulePath: '/403.page.ts',
    files: { ts: '/403.page.ts' },
    statusCode: 403,
  });

  const routes = [
    createRoute({
      pattern: '/secret',
      modulePath: '/secret.page.ts',
      files: { ts: '/secret.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    statusPages: new Map([[403, statusPage]]),
    moduleLoaders: {
      '/secret.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            getData: () => {
              throw new Response(null, { status: 403 });
            },
          }),
        }),
      '/403.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<h1>Access Denied</h1>',
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/secret');
    assertEquals(result.status, 403);
    assertStringIncludes(result.content, 'Access Denied');
  } finally {
    restore();
  }
});

// ============================================================================
// 6. Error boundary is used when available
// ============================================================================

Deno.test('TestRenderer - scoped error boundary is used for 500 errors', async () => {
  const routes = [
    createRoute({
      pattern: '/admin/crash',
      modulePath: '/admin/crash.page.ts',
      files: { ts: '/admin/crash.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    errorBoundaries: [
      { pattern: '/admin', modulePath: '/admin.error.ts' },
    ],
    moduleLoaders: {
      '/admin/crash.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            getData: () => {
              throw new Error('admin crash');
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

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/admin/crash');
    assertEquals(result.status, 500);
    assertStringIncludes(result.content, 'Admin Error Boundary');
  } finally {
    restore();
  }
});

Deno.test('TestRenderer - error boundary takes priority over root error handler', async () => {
  const routes = [
    createRoute({
      pattern: '/shop/item',
      modulePath: '/shop/item.page.ts',
      files: { ts: '/shop/item.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    errorBoundaries: [
      { pattern: '/shop', modulePath: '/shop.error.ts' },
    ],
    errorHandler: {
      pattern: '/',
      type: 'error',
      modulePath: '/root.error.ts',
    },
    moduleLoaders: {
      '/shop/item.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            getData: () => {
              throw new Error('shop broke');
            },
          }),
        }),
      '/shop.error.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<h1>Shop Boundary</h1>',
          }),
        }),
      '/root.error.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<h1>Root Handler</h1>',
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/shop/item');
    assertEquals(result.status, 500);
    assertStringIncludes(result.content, 'Shop Boundary');
    assert(!result.content.includes('Root Handler'));
  } finally {
    restore();
  }
});

// ============================================================================
// 7. Root error handler is used when available
// ============================================================================

Deno.test('TestRenderer - root error handler is used when no boundary matches', async () => {
  const routes = [
    createRoute({
      pattern: '/crash',
      modulePath: '/crash.page.ts',
      files: { ts: '/crash.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    errorHandler: {
      pattern: '/',
      type: 'error',
      modulePath: '/root.error.ts',
    },
    moduleLoaders: {
      '/crash.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            getData: () => {
              throw new Error('general failure');
            },
          }),
        }),
      '/root.error.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<h1>Root Error Page</h1>',
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/crash');
    assertEquals(result.status, 500);
    assertStringIncludes(result.content, 'Root Error Page');
  } finally {
    restore();
  }
});

// ============================================================================
// 8. Fallback error page when no boundary/handler
// ============================================================================

Deno.test('TestRenderer - fallback error page when no boundary or handler', async () => {
  const routes = [
    createRoute({
      pattern: '/fail',
      modulePath: '/fail.page.ts',
      files: { ts: '/fail.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/fail.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            getData: () => {
              throw new Error('unhandled');
            },
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/fail');
    assertEquals(result.status, 500);
    assertEquals(result.content, 'ERROR:/fail');
  } finally {
    restore();
  }
});

// ============================================================================
// 9. Route hierarchy composition: parent with slot gets child injected
// ============================================================================

Deno.test('TestRenderer - route hierarchy injects child into parent slot', async () => {
  const routes = [
    createRoute({
      pattern: '/',
      modulePath: '/layout.page.ts',
      files: { ts: '/layout.page.ts' },
    }),
    createRoute({
      pattern: '/about',
      modulePath: '/about.page.ts',
      files: { ts: '/about.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/layout.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<header>Nav</header>' + SLOT,
          }),
        }),
      '/about.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<main>About Content</main>',
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/about');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, '<header>Nav</header>');
    assertStringIncludes(result.content, '<main>About Content</main>');
    assert(result.content.indexOf('Nav') < result.content.indexOf('About Content'));
  } finally {
    restore();
  }
});

Deno.test('TestRenderer - deeply nested hierarchy composes correctly', async () => {
  const routes = [
    createRoute({
      pattern: '/',
      modulePath: '/root.page.ts',
      files: { ts: '/root.page.ts' },
    }),
    createRoute({
      pattern: '/docs',
      modulePath: '/docs.page.ts',
      files: { ts: '/docs.page.ts' },
    }),
    createRoute({
      pattern: '/docs/api',
      modulePath: '/docs/api.page.ts',
      files: { ts: '/docs/api.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/root.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<html>' + SLOT + '</html>',
          }),
        }),
      '/docs.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<nav>Docs</nav>' + SLOT,
          }),
        }),
      '/docs/api.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<article>API Reference</article>',
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/docs/api');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, '<html>');
    assertStringIncludes(result.content, '<nav>Docs</nav>');
    assertStringIncludes(result.content, '<article>API Reference</article>');
    assertStringIncludes(result.content, '</html>');
    assert(!result.content.includes(SLOT));
  } finally {
    restore();
  }
});

// ============================================================================
// 10. Unconsumed slots are stripped from final output
// ============================================================================

Deno.test('TestRenderer - unconsumed slots are stripped from final output', async () => {
  const routes = [
    createRoute({
      pattern: '/leaf',
      modulePath: '/leaf.page.ts',
      files: { ts: '/leaf.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/leaf.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<div>Leaf' + SLOT + '</div>',
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/leaf');
    assertEquals(result.status, 200);
    assert(!result.content.includes(SLOT));
    assertStringIncludes(result.content, '<div>Leaf</div>');
  } finally {
    restore();
  }
});

Deno.test('TestRenderer - default root route slot is stripped when root is only layer', async () => {
  const manifest = createManifest({ routes: [] });
  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/');
    assertEquals(result.status, 200);
    assert(!result.content.includes(SLOT));
  } finally {
    restore();
  }
});

// ============================================================================
// 11. SSR prefix /html/ is stripped from URL
// ============================================================================

Deno.test('TestRenderer - strips /html/ prefix from URL before matching', async () => {
  const routes = [
    createRoute({
      pattern: '/about',
      modulePath: '/about.page.ts',
      files: { ts: '/about.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/about.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<p>About Page</p>',
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/html/about');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, 'About Page');
  } finally {
    restore();
  }
});

Deno.test('TestRenderer - strips /md/ prefix from URL before matching', async () => {
  const routes = [
    createRoute({
      pattern: '/about',
      modulePath: '/about.page.ts',
      files: { ts: '/about.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/about.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<p>About Page</p>',
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/md/about');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, 'About Page');
  } finally {
    restore();
  }
});

// ============================================================================
// 12. Title is returned from component.getTitle()
// ============================================================================

Deno.test('TestRenderer - title is returned from component.getTitle()', async () => {
  const routes = [
    createRoute({
      pattern: '/titled',
      modulePath: '/titled.page.ts',
      files: { ts: '/titled.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/titled.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<h1>My Page</h1>',
            getTitle: () => 'My Page Title',
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/titled');
    assertEquals(result.status, 200);
    assertEquals(result.title, 'My Page Title');
  } finally {
    restore();
  }
});

Deno.test('TestRenderer - title is undefined when component returns no title', async () => {
  const routes = [
    createRoute({
      pattern: '/notitled',
      modulePath: '/notitled.page.ts',
      files: { ts: '/notitled.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/notitled.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<p>No Title</p>',
            getTitle: () => undefined,
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/notitled');
    assertEquals(result.status, 200);
    assertEquals(result.title, undefined);
  } finally {
    restore();
  }
});

Deno.test('TestRenderer - deepest title wins in route hierarchy', async () => {
  const routes = [
    createRoute({
      pattern: '/',
      modulePath: '/root.page.ts',
      files: { ts: '/root.page.ts' },
    }),
    createRoute({
      pattern: '/child',
      modulePath: '/child.page.ts',
      files: { ts: '/child.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/root.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<div>' + SLOT + '</div>',
            getTitle: () => 'Root Title',
          }),
        }),
      '/child.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<p>Child</p>',
            getTitle: () => 'Child Title',
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/child');
    assertEquals(result.status, 200);
    assertEquals(result.title, 'Child Title');
  } finally {
    restore();
  }
});

// ============================================================================
// Additional edge cases
// ============================================================================

Deno.test('TestRenderer - custom 404 status page is used when registered', async () => {
  const notFoundPage = createRoute({
    pattern: '/404',
    modulePath: '/404.page.ts',
    files: { ts: '/404.page.ts' },
    statusCode: 404,
  });

  const manifest = createManifest({
    routes: [],
    statusPages: new Map([[404, notFoundPage]]),
    moduleLoaders: {
      '/404.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<h1>Custom Not Found</h1>',
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/anything');
    assertEquals(result.status, 404);
    assertStringIncludes(result.content, 'Custom Not Found');
  } finally {
    restore();
  }
});

Deno.test('TestRenderer - redirect with custom status 302', async () => {
  const routes = [
    createRoute({
      pattern: '/temp',
      type: 'redirect',
      modulePath: '/temp.redirect.ts',
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/temp.redirect.ts': () => Promise.resolve({ default: { to: '/destination', status: 302 } }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/temp');
    assertEquals(result.status, 302);
    assertEquals(result.content, 'REDIRECT:/destination');
  } finally {
    restore();
  }
});

Deno.test('TestRenderer - render() with pathname only (no host)', async () => {
  const routes = [
    createRoute({
      pattern: '/simple',
      modulePath: '/simple.page.ts',
      files: { ts: '/simple.page.ts' },
    }),
  ];

  const manifest = createManifest({
    routes,
    moduleLoaders: {
      '/simple.page.ts': () =>
        Promise.resolve({
          default: stubComponent({
            renderHTML: () => '<p>Simple</p>',
          }),
        }),
    },
  });

  const router = new TestRenderer(manifest);
  const restore = mockFetch({});

  try {
    const result = await router.render('/simple');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, 'Simple');
  } finally {
    restore();
  }
});
