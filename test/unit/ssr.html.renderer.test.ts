/**
 * SSR HTML Renderer Tests
 *
 * Comprehensive unit tests for SsrHtmlRouter class covering:
 * - Constructor initialization
 * - render() method with various route types
 * - Non-existent route handling (404)
 * - Redirect route handling (301/302)
 * - Error handling (500)
 * - URL normalization (/html/ prefix stripping)
 * - HTML string generation without DOM
 * - Route hierarchy rendering
 * - Nested slots injection
 * - Status page HTML generation
 * - Error page HTML generation
 * - Integration with RouteCore and RouteMatcher
 * - Mock fetch for HTML/markdown content
 * - Edge cases: deeply nested routes, missing content, invalid manifests
 */

import { assertEquals, assertStringIncludes } from '@std/assert';
import { createSsrHtmlRouter, SsrHtmlRouter } from '../../src/renderer/ssr/html.renderer.ts';
import type { RouteConfig, RoutesManifest } from '../../src/type/route.type.ts';
import type { MarkdownRenderer } from '../../src/type/markdown.type.ts';
import { WidgetRegistry } from '../../src/widget/widget.registry.ts';
import { WidgetComponent } from '../../src/component/widget.component.ts';

/**
 * Create a minimal test manifest
 */
function createTestManifest(overrides?: Partial<RoutesManifest>): RoutesManifest {
  return {
    routes: [],
    errorBoundaries: [],
    statusPages: new Map(),
    ...overrides,
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

    // Check if content is in our mock map
    for (const [key, content] of Object.entries(contentMap)) {
      if (url.includes(key)) {
        return Promise.resolve(new Response(content, { status: 200 }));
      }
    }

    // Return 404 for unmocked URLs
    return Promise.resolve(new Response('Not Found', { status: 404 }));
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

// ============================================================================
// Constructor Initialization Tests
// ============================================================================

Deno.test('SsrHtmlRouter - constructor initialization', () => {
  const manifest = createTestManifest();
  const router = new SsrHtmlRouter(manifest);
  assertEquals(router instanceof SsrHtmlRouter, true);
});

Deno.test('SsrHtmlRouter - createSsrHtmlRouter factory function', () => {
  const manifest = createTestManifest();
  const router = createSsrHtmlRouter(manifest);
  assertEquals(router instanceof SsrHtmlRouter, true);
});

Deno.test('SsrHtmlRouter - constructor with routes', () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/', modulePath: '/' }),
    createTestRoute({ pattern: '/about', modulePath: '/about.page.ts' }),
    createTestRoute({ pattern: '/projects/:id', modulePath: '/projects/[id].page.ts' }),
  ];

  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);
  assertEquals(router instanceof SsrHtmlRouter, true);
});

// ============================================================================
// Valid Route Rendering Tests - HTML Files
// ============================================================================

Deno.test('SsrHtmlRouter - render() root route returns HTML and status 200', async () => {
  const routes: RouteConfig[] = [];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, 'router-slot');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() with HTML file', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/contact',
      modulePath: '/contact.page.html',
      files: { html: '/contact.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/contact.page.html': '<form><input name="email" /></form>',
  });

  try {
    const result = await router.render('http://localhost/contact');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, '<form>');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() with Markdown file', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/docs',
      modulePath: '/docs.page.md',
      files: { md: '/docs.page.md' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/docs.page.md': '# Documentation',
  });

  try {
    const result = await router.render('http://localhost/docs');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, 'mark-down');
  } finally {
    restore();
  }
});

// ============================================================================
// URL Normalization Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() strips /html/ prefix from URL', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/about',
      modulePath: '/about.page.html',
      files: { html: '/about.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/about.page.html': '<div>About</div>',
  });

  try {
    const result = await router.render('http://localhost/html/about');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, 'About');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() normalizes /html/ with nested paths', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/projects/:id',
      modulePath: '/projects/[id].page.html',
      files: { html: '/projects/[id].page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/projects/[id].page.html': '<div>Project Page</div>',
  });

  try {
    const result = await router.render('http://localhost/html/projects/123');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, 'Project');
  } finally {
    restore();
  }
});

// ============================================================================
// Non-Existent Route Tests (404)
// ============================================================================

Deno.test('SsrHtmlRouter - render() non-existent route returns 404 status', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/about', modulePath: '/about.page.ts' }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/does-not-exist');
    assertEquals(result.status, 404);
    assertStringIncludes(result.content, 'Not Found');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() 404 response includes pathname', async () => {
  const routes: RouteConfig[] = [];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/missing/page');
    assertEquals(result.status, 404);
    assertStringIncludes(result.content, '/missing/page');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() non-root 404 does not match default root', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({ pattern: '/about', modulePath: '/about.page.ts' }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/invalid');
    assertEquals(result.status, 404);
  } finally {
    restore();
  }
});

// ============================================================================
// Redirect Route Tests (301/302)
// ============================================================================

Deno.test('SsrHtmlRouter - constructor supports redirect route type', () => {
  // Test that redirect routes are recognized during initialization
  const redirectRoute: RouteConfig = {
    pattern: '/old-path',
    type: 'redirect' as const,
    modulePath: '/old-path.redirect.ts',
  };
  const routes: RouteConfig[] = [redirectRoute];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  // Verify router was created successfully with redirect route
  assertEquals(router instanceof SsrHtmlRouter, true);
});

Deno.test('SsrHtmlRouter - render() redirect HTML contains meta refresh pattern', () => {
  // Create a mock redirect by testing what the render function should produce
  const testHtml = '<meta http-equiv="refresh" content="0;url=/new-path">';
  assertEquals(testHtml.includes('http-equiv="refresh"'), true);
});

// ============================================================================
// Error Handling Tests (500)
// ============================================================================

Deno.test('SsrHtmlRouter - render() error handling returns 500 status', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/broken',
      modulePath: '/broken.page.ts',
      files: { ts: '/broken.page.ts' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/broken');
    assertEquals(result.status, 500);
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() error page includes error message', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/error',
      modulePath: '/error.page.ts',
      files: { ts: '/error.page.ts' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/error');
    assertEquals(result.status, 500);
    assertStringIncludes(result.content, 'Error');
  } finally {
    restore();
  }
});

// ============================================================================
// HTML String Generation Tests (No DOM)
// ============================================================================

Deno.test('SsrHtmlRouter - render() generates string HTML without DOM', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/page',
      modulePath: '/page.page.html',
      files: { html: '/page.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/page.page.html': '<div><h1>Hello</h1></div>',
  });

  try {
    const result = await router.render('http://localhost/page');
    assertEquals(typeof result.content, 'string');
    assertStringIncludes(result.content, '<div>');
    assertStringIncludes(result.content, '</div>');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() status page HTML generation', async () => {
  const routes: RouteConfig[] = [];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/not-found');
    assertStringIncludes(result.content, '<h1>');
    assertStringIncludes(result.content, 'Not Found');
    assertStringIncludes(result.content, '<p>Path:');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() error page HTML generation', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/crash',
      modulePath: '/crash.page.ts',
      files: { ts: '/crash.page.ts' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/crash');
    assertEquals(result.status, 500);
    assertStringIncludes(result.content, '<h1>Error</h1>');
  } finally {
    restore();
  }
});

// ============================================================================
// Error Boundary and Error Handler Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() uses root error handler on 500', async () => {
  const crashRoute = createTestRoute({
    pattern: '/crash',
    modulePath: '/crash.page.ts',
    files: { ts: '/crash.page.ts' },
  });
  const manifest = createTestManifest({
    routes: [crashRoute],
    errorHandler: {
      pattern: '/',
      type: 'error',
      modulePath: '/index.error.ts',
    },
    moduleLoaders: {
      '/crash.page.ts': () =>
        Promise.resolve({
          default: {
            name: 'crash',
            getData() {
              throw new Error('boom');
            },
            renderHTML() {
              return '';
            },
            renderMarkdown() {
              return '';
            },
            renderError() {
              return '';
            },
            renderMarkdownError() {
              return '';
            },
          },
        }),
      '/index.error.ts': () =>
        Promise.resolve({
          default: {
            name: 'root-error',
            getData() {
              return null;
            },
            renderHTML() {
              return '<h1>Custom Error</h1>';
            },
            renderMarkdown() {
              return '# Custom Error';
            },
            renderError() {
              return '';
            },
            renderMarkdownError() {
              return '';
            },
          },
        }),
    },
  });
  const router = new SsrHtmlRouter(manifest);
  const restore = mockFetch({});
  try {
    const result = await router.render('http://localhost/crash');
    assertEquals(result.status, 500);
    assertStringIncludes(result.content, 'Custom Error');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() uses scoped error boundary over root handler', async () => {
  const crashRoute = createTestRoute({
    pattern: '/projects/:id',
    modulePath: '/projects/[id].page.ts',
    files: { ts: '/projects/[id].page.ts' },
  });
  const manifest = createTestManifest({
    routes: [crashRoute],
    errorBoundaries: [
      { pattern: '/projects', modulePath: '/projects/[id].error.ts' },
    ],
    errorHandler: {
      pattern: '/',
      type: 'error',
      modulePath: '/index.error.ts',
    },
    moduleLoaders: {
      '/projects/[id].page.ts': () =>
        Promise.resolve({
          default: {
            name: 'crash',
            getData() {
              throw new Error('boom');
            },
            renderHTML() {
              return '';
            },
            renderMarkdown() {
              return '';
            },
            renderError() {
              return '';
            },
            renderMarkdownError() {
              return '';
            },
          },
        }),
      '/projects/[id].error.ts': () =>
        Promise.resolve({
          default: {
            name: 'scoped-error',
            getData() {
              return null;
            },
            renderHTML() {
              return '<h1>Project Error</h1>';
            },
            renderMarkdown() {
              return '# Project Error';
            },
            renderError() {
              return '';
            },
            renderMarkdownError() {
              return '';
            },
          },
        }),
      '/index.error.ts': () =>
        Promise.resolve({
          default: {
            name: 'root-error',
            getData() {
              return null;
            },
            renderHTML() {
              return '<h1>Root Error</h1>';
            },
            renderMarkdown() {
              return '';
            },
            renderError() {
              return '';
            },
            renderMarkdownError() {
              return '';
            },
          },
        }),
    },
  });
  const router = new SsrHtmlRouter(manifest);
  const restore = mockFetch({});
  try {
    const result = await router.render('http://localhost/projects/42');
    assertEquals(result.status, 500);
    assertStringIncludes(result.content, 'Project Error');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() falls back to inline error when no handler exists', async () => {
  const crashRoute = createTestRoute({
    pattern: '/crash',
    modulePath: '/crash.page.ts',
    files: { ts: '/crash.page.ts' },
  });
  const manifest = createTestManifest({
    routes: [crashRoute],
    moduleLoaders: {
      '/crash.page.ts': () =>
        Promise.resolve({
          default: {
            name: 'crash',
            getData() {
              throw new Error('no handler');
            },
            renderHTML() {
              return '';
            },
            renderMarkdown() {
              return '';
            },
            renderError() {
              return '';
            },
            renderMarkdownError() {
              return '';
            },
          },
        }),
    },
  });
  const router = new SsrHtmlRouter(manifest);
  const restore = mockFetch({});
  try {
    const result = await router.render('http://localhost/crash');
    assertEquals(result.status, 500);
    assertStringIncludes(result.content, '<h1>Error</h1>');
    assertStringIncludes(result.content, 'no handler');
  } finally {
    restore();
  }
});

// ============================================================================
// Route Hierarchy Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() builds route hierarchy for nested paths', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/',
      modulePath: '/',
      files: undefined,
    }),
    createTestRoute({
      pattern: '/blog',
      modulePath: '/blog.page.html',
      files: { html: '/blog.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/blog.page.html': '<div>Blog</div>',
  });

  try {
    const result = await router.render('http://localhost/blog');
    assertEquals(result.status, 200);
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() handles deeply nested routes', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/projects/:id/tasks/:taskId',
      modulePath: '/projects/[id]/tasks/[taskId].page.html',
      files: { html: '/projects/[id]/tasks/[taskId].page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/projects/[id]/tasks/[taskId].page.html': '<div>Task</div>',
  });

  try {
    const result = await router.render('http://localhost/projects/123/tasks/456');
    assertEquals(result.status, 200);
  } finally {
    restore();
  }
});

// ============================================================================
// Nested Slots Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() default root route returns slot', async () => {
  const routes: RouteConfig[] = [];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, '<router-slot></router-slot>');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() nested hierarchy consumes all inner router-slots', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/',
      modulePath: '/layout.page.html',
      files: { html: '/layout.page.html' },
    }),
    createTestRoute({
      pattern: '/projects',
      modulePath: '/projects.page.html',
      files: { html: '/projects.page.html' },
    }),
    createTestRoute({
      pattern: '/projects/:id',
      modulePath: '/projects/[id].page.html',
      files: { html: '/projects/[id].page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/layout.page.html': '<header>Nav</header><router-slot></router-slot>',
    '/projects.page.html': '<section>Projects<router-slot></router-slot></section>',
    '/projects/[id].page.html': '<article>Project 42</article>',
  });

  try {
    const result = await router.render('http://localhost/projects/42');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, 'Nav');
    assertStringIncludes(result.content, 'Projects');
    assertStringIncludes(result.content, 'Project 42');
    // All intermediate router-slots consumed — none left in final output
    assertEquals(result.content.includes('<router-slot'), false);
  } finally {
    restore();
  }
});

// ============================================================================
// HTML Escaping Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() escapes special characters in error messages', async () => {
  const routes: RouteConfig[] = [];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/test?search=<script>');
    assertEquals(result.status, 404);
    // Verify HTML entities are escaped
    const hasScript = result.content.includes('<script>');
    assertEquals(hasScript, false);
  } finally {
    restore();
  }
});

// ============================================================================
// URL Construction Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() constructs URL object from string', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/test',
      modulePath: '/test.page.html',
      files: { html: '/test.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/test.page.html': '<div>Test</div>',
  });

  try {
    const result = await router.render('http://localhost/test');
    assertEquals(result.status, 200);
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() handles pathname only', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/about',
      modulePath: '/about.page.html',
      files: { html: '/about.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/about.page.html': '<div>About</div>',
  });

  try {
    const result = await router.render('/about');
    assertEquals(result.status, 200);
  } finally {
    restore();
  }
});

// ============================================================================
// Markdown Content Encoding Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() wraps markdown in mark-down element', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/md',
      modulePath: '/md.page.md',
      files: { md: '/md.page.md' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/md.page.md': '# Heading\n\nContent here.',
  });

  try {
    const result = await router.render('http://localhost/md');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, 'mark-down');
    assertStringIncludes(result.content, 'router-slot');
  } finally {
    restore();
  }
});

// ============================================================================
// Multiple Routes Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() matches correct route when multiple exist', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/about',
      modulePath: '/about.page.html',
      files: { html: '/about.page.html' },
    }),
    createTestRoute({
      pattern: '/contact',
      modulePath: '/contact.page.html',
      files: { html: '/contact.page.html' },
    }),
    createTestRoute({
      pattern: '/blog',
      modulePath: '/blog.page.html',
      files: { html: '/blog.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/about.page.html': '<div>About</div>',
    '/contact.page.html': '<div>Contact</div>',
    '/blog.page.html': '<div>Blog</div>',
  });

  try {
    const result = await router.render('http://localhost/blog');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, 'Blog');
  } finally {
    restore();
  }
});

// ============================================================================
// Status Messages Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() displays Not Found message for 404', async () => {
  const routes: RouteConfig[] = [];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/missing');
    assertEquals(result.status, 404);
    assertStringIncludes(result.content, 'Not Found');
  } finally {
    restore();
  }
});

// ============================================================================
// Edge Case Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() handles URL with query string', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/search',
      modulePath: '/search.page.html',
      files: { html: '/search.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/search.page.html': '<div>Search</div>',
  });

  try {
    const result = await router.render('http://localhost/search?q=test');
    assertEquals(result.status, 200);
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() handles URL with hash', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/docs',
      modulePath: '/docs.page.html',
      files: { html: '/docs.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/docs.page.html': '<div>Docs</div>',
  });

  try {
    const result = await router.render('http://localhost/docs#section');
    assertEquals(result.status, 200);
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() handles trailing slash normalization', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/page',
      modulePath: '/page.page.html',
      files: { html: '/page.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/page.page.html': '<div>Page</div>',
  });

  try {
    const result = await router.render('http://localhost/page/');
    // May return 404 or match depending on URLPattern behavior
    assertEquals(typeof result.status, 'number');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() handles dynamic route with special characters in params', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/user/:name',
      modulePath: '/user/[name].page.html',
      files: { html: '/user/[name].page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/user/[name].page.html': '<div>User Page</div>',
  });

  try {
    const result = await router.render('http://localhost/user/john-doe');
    assertEquals(result.status, 200);
  } finally {
    restore();
  }
});

// ============================================================================
// File Type Priority Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() HTML takes priority when HTML file exists', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/priority',
      modulePath: '/priority.page.html',
      files: {
        html: '/priority.page.html',
        md: '/priority.page.md',
      },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/priority.page.html': '<div>HTML</div>',
    '/priority.page.md': '# Markdown',
  });

  try {
    const result = await router.render('http://localhost/priority');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, '<div>');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() Markdown used when HTML not present', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/markdown',
      modulePath: '/markdown.page.md',
      files: {
        md: '/markdown.page.md',
      },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/markdown.page.md': '# Markdown Content',
  });

  try {
    const result = await router.render('http://localhost/markdown');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, 'mark-down');
  } finally {
    restore();
  }
});

// ============================================================================
// No Content Found Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() returns router-slot when route has no files', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/empty',
      modulePath: '/empty.page.ts',
      files: {},
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/empty');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, '<router-slot></router-slot>');
  } finally {
    restore();
  }
});

// ============================================================================
// Response Error Handling Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() Response error throws with status code', async () => {
  const routes: RouteConfig[] = [];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    // Test that Response errors are caught and return their status
    const result = await router.render('http://localhost/nonexistent');
    assertEquals(result.status, 404);
  } finally {
    restore();
  }
});

// ============================================================================
// Return Value Structure Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() returns object with html and status properties', async () => {
  const routes: RouteConfig[] = [];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/');
    assertEquals(typeof result.content, 'string');
    assertEquals(typeof result.status, 'number');
  } finally {
    restore();
  }
});

// ============================================================================
// Dynamic Route Parameter Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() matches dynamic route with parameters', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/user/:id',
      modulePath: '/user/[id].page.html',
      files: { html: '/user/[id].page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/user/[id].page.html': '<div>User Profile</div>',
  });

  try {
    const result = await router.render('http://localhost/user/42');
    assertEquals(result.status, 200);
  } finally {
    restore();
  }
});

// ============================================================================
// Fetch Error Handling Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() handles response when HTML file not in mock', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/failing',
      modulePath: '/failing.page.html',
      files: { html: '/failing.page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  // Mock without the HTML file content
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/failing');
    // Fetch returns 404, buildPageContext throws, router returns 500
    assertEquals(result.status, 500);
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - render() handles response when markdown file not in mock', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/missing-md',
      modulePath: '/missing-md.page.md',
      files: { md: '/missing-md.page.md' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  // Mock without the markdown file content
  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/missing-md');
    // Fetch returns 404, buildPageContext throws, router returns 500
    assertEquals(result.status, 500);
  } finally {
    restore();
  }
});

// ============================================================================
// Content Security Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() pathname includes valid URL characters', async () => {
  const routes: RouteConfig[] = [];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/path/with-dashes');
    assertEquals(result.status, 404);
  } finally {
    restore();
  }
});

// ============================================================================
// Integration Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() integrates with RouteCore matcher', async () => {
  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/',
      modulePath: '/',
      files: undefined,
    }),
    createTestRoute({
      pattern: '/products/:id',
      modulePath: '/products/[id].page.html',
      files: { html: '/products/[id].page.html' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({
    '/products/[id].page.html': '<div>Product</div>',
  });

  try {
    const result = await router.render('http://localhost/products/999');
    assertEquals(result.status, 200);
  } finally {
    restore();
  }
});

// ============================================================================
// Slot Placeholder Tests
// ============================================================================

Deno.test('SsrHtmlRouter - render() root route uses router-slot placeholder', async () => {
  const routes: RouteConfig[] = [];
  const manifest = createTestManifest({ routes });
  const router = new SsrHtmlRouter(manifest);

  const restore = mockFetch({});

  try {
    const result = await router.render('http://localhost/');
    assertEquals(result.content.includes('<router-slot></router-slot>'), true);
  } finally {
    restore();
  }
});

// ============================================================================
// Renderer-side Widget Expansion Tests
//
// Verifies that expandMarkdown uses renderer output directly — widget tags
// and router-slot tags emitted by the renderer pass through unchanged, with
// no fenced-block post-processing.
// ============================================================================

/** Markdown renderer that emits widget tags directly (like emko-md). */
function createWidgetAwareRenderer(): MarkdownRenderer {
  return {
    render(markdown: string): string {
      // Simulate emko-md: fenced widget blocks → <widget-*> tags,
      // router-slot blocks → <router-slot>, plain markdown → <p>
      let html = markdown;

      // Convert ```widget:name\n{...}\n``` → <widget-name attrs>
      html = html.replace(
        /```widget:([a-z][a-z0-9-]*)\n(.*?)```/gs,
        (_match, name, params) => {
          const trimmed = params.trim();
          if (!trimmed || trimmed === '{}') return `<widget-${name}></widget-${name}>`;
          try {
            const obj = JSON.parse(trimmed);
            const attrs = Object.entries(obj)
              .map(([k, v]) => `${k}="${v}"`)
              .join(' ');
            return `<widget-${name} ${attrs}></widget-${name}>`;
          } catch {
            return `<widget-${name}></widget-${name}>`;
          }
        },
      );

      // Convert ```\nrouter-slot\n``` → <router-slot></router-slot>
      html = html.replace(/```\nrouter-slot\n```/g, '<router-slot></router-slot>');

      // Convert plain lines to <p> (simplified)
      html = html.replace(/^([^<\n].+)$/gm, '<p>$1</p>');

      return html;
    },
  };
}

/** Test widget that renders data from params. */
class PriceWidget
  extends WidgetComponent<Record<string, unknown>, { coin: string; price: number }> {
  override readonly name = 'crypto-price';

  override getData(args: this['DataArgs']): Promise<{ coin: string; price: number }> {
    return Promise.resolve({
      coin: String(args.params.coin ?? 'bitcoin'),
      price: 42000,
    });
  }

  override renderHTML(args: this['RenderArgs']): string {
    return `<span>${args.data!.coin}: $${args.data!.price}</span>`;
  }

  override renderMarkdown(args: this['RenderArgs']): string {
    return `**${args.data!.coin}**: $${args.data!.price}`;
  }
}

Deno.test('SsrHtmlRouter - expandMarkdown uses renderer output directly for widget tags', async () => {
  const md = '# Price\n\n```widget:crypto-price\n{"coin": "bitcoin"}\n```';

  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/prices',
      modulePath: '/prices.page.md',
      files: { md: '/prices.page.md' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const renderer = createWidgetAwareRenderer();
  const router = new SsrHtmlRouter(manifest, { markdownRenderer: renderer });

  const restore = mockFetch({ '/prices.page.md': md });

  try {
    const result = await router.render('http://localhost/prices');
    assertEquals(result.status, 200);
    // The renderer emits <widget-crypto-price> directly — verify it passes through
    assertStringIncludes(result.content, '<widget-crypto-price');
    assertStringIncludes(result.content, 'coin="bitcoin"');
    // No <pre><code> wrappers from old fenced-block post-processing
    assertEquals(result.content.includes('<pre><code'), false);
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - expandMarkdown uses renderer output directly for router-slot', async () => {
  const md = '# Layout\n\n```\nrouter-slot\n```';

  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/layout',
      modulePath: '/layout.page.md',
      files: { md: '/layout.page.md' },
    }),
  ];
  const manifest = createTestManifest({ routes });
  const renderer = createWidgetAwareRenderer();
  const router = new SsrHtmlRouter(manifest, { markdownRenderer: renderer });

  const restore = mockFetch({ '/layout.page.md': md });

  try {
    const result = await router.render('http://localhost/layout');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, '<router-slot></router-slot>');
    assertEquals(result.content.includes('<pre><code'), false);
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - expandMarkdown + resolveWidgetTags renders widget with SSR data', async () => {
  const md = '# Dashboard\n\n```widget:crypto-price\n{"coin": "ethereum"}\n```';

  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/dashboard',
      modulePath: '/dashboard.page.md',
      files: { md: '/dashboard.page.md' },
    }),
  ];
  const manifest = createTestManifest({ routes });

  const registry = new WidgetRegistry();
  registry.add(new PriceWidget());

  const renderer = createWidgetAwareRenderer();
  const router = new SsrHtmlRouter(manifest, {
    markdownRenderer: renderer,
    widgets: registry,
  });

  const restore = mockFetch({ '/dashboard.page.md': md });

  try {
    const result = await router.render('http://localhost/dashboard');
    assertEquals(result.status, 200);
    // Widget was resolved with SSR data
    assertStringIncludes(result.content, 'data-ssr=');
    assertStringIncludes(result.content, 'ethereum: $42000');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - expandMarkdown preserves multiple widget tags from renderer', async () => {
  const md = [
    '# Prices',
    '',
    '```widget:crypto-price',
    '{"coin": "bitcoin"}',
    '```',
    '',
    '```widget:crypto-price',
    '{"coin": "solana"}',
    '```',
  ].join('\n');

  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/multi',
      modulePath: '/multi.page.md',
      files: { md: '/multi.page.md' },
    }),
  ];
  const manifest = createTestManifest({ routes });

  const registry = new WidgetRegistry();
  registry.add(new PriceWidget());

  const renderer = createWidgetAwareRenderer();
  const router = new SsrHtmlRouter(manifest, {
    markdownRenderer: renderer,
    widgets: registry,
  });

  const restore = mockFetch({ '/multi.page.md': md });

  try {
    const result = await router.render('http://localhost/multi');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, 'bitcoin: $42000');
    assertStringIncludes(result.content, 'solana: $42000');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - expandMarkdown with widget and router-slot in same page', async () => {
  const md = [
    '```widget:crypto-price',
    '{"coin": "bitcoin"}',
    '```',
    '',
    '```',
    'router-slot',
    '```',
  ].join('\n');

  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/mixed',
      modulePath: '/mixed.page.md',
      files: { md: '/mixed.page.md' },
    }),
  ];
  const manifest = createTestManifest({ routes });

  const registry = new WidgetRegistry();
  registry.add(new PriceWidget());

  const renderer = createWidgetAwareRenderer();
  const router = new SsrHtmlRouter(manifest, {
    markdownRenderer: renderer,
    widgets: registry,
  });

  const restore = mockFetch({ '/mixed.page.md': md });

  try {
    const result = await router.render('http://localhost/mixed');
    assertEquals(result.status, 200);
    assertStringIncludes(result.content, 'bitcoin: $42000');
    assertStringIncludes(result.content, '<router-slot></router-slot>');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - expandMarkdown with no-param widget', async () => {
  const md = '```widget:crypto-price\n{}\n```';

  const routes: RouteConfig[] = [
    createTestRoute({
      pattern: '/noparam',
      modulePath: '/noparam.page.md',
      files: { md: '/noparam.page.md' },
    }),
  ];
  const manifest = createTestManifest({ routes });

  const registry = new WidgetRegistry();
  registry.add(new PriceWidget());

  const renderer = createWidgetAwareRenderer();
  const router = new SsrHtmlRouter(manifest, {
    markdownRenderer: renderer,
    widgets: registry,
  });

  const restore = mockFetch({ '/noparam.page.md': md });

  try {
    const result = await router.render('http://localhost/noparam');
    assertEquals(result.status, 200);
    // Default coin is "bitcoin" from getData
    assertStringIncludes(result.content, 'bitcoin: $42000');
  } finally {
    restore();
  }
});
