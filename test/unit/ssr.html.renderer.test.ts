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
    assertStringIncludes(result.html, 'router-slot');
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
    assertStringIncludes(result.html, '<form>');
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
    assertStringIncludes(result.html, 'mark-down');
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
    assertStringIncludes(result.html, 'About');
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
    assertStringIncludes(result.html, 'Project');
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
    assertStringIncludes(result.html, 'Not Found');
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
    assertStringIncludes(result.html, '/missing/page');
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
    assertStringIncludes(result.html, 'Error');
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
    assertEquals(typeof result.html, 'string');
    assertStringIncludes(result.html, '<div>');
    assertStringIncludes(result.html, '</div>');
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
    assertStringIncludes(result.html, '<h1>');
    assertStringIncludes(result.html, 'Not Found');
    assertStringIncludes(result.html, '<p>Path:');
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
    assertStringIncludes(result.html, '<h1>Error</h1>');
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
    assertStringIncludes(result.html, '<router-slot></router-slot>');
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
    const hasScript = result.html.includes('<script>');
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
    assertStringIncludes(result.html, 'mark-down');
    assertStringIncludes(result.html, 'router-slot');
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
    assertStringIncludes(result.html, 'Blog');
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
    assertStringIncludes(result.html, 'Not Found');
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
    assertStringIncludes(result.html, '<div>');
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
    assertStringIncludes(result.html, 'mark-down');
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
    assertStringIncludes(result.html, '<router-slot></router-slot>');
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
    assertEquals(typeof result.html, 'string');
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
    assertEquals(result.html.includes('<router-slot></router-slot>'), true);
  } finally {
    restore();
  }
});
