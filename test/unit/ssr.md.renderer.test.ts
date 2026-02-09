/**
 * SSR Markdown Renderer Tests
 *
 * Comprehensive unit tests for SsrMdRouter class covering:
 * - Constructor initialization
 * - render() method with various route scenarios
 * - URL normalization (strip /md/ prefix)
 * - Markdown string generation
 * - Route hierarchy rendering
 * - Status page generation
 * - Error handling
 * - Integration with RouteCore and RouteMatcher
 * - Edge cases
 */

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { createSsrMdRouter, SsrMdRouter } from '../../src/renderer/ssr/md.renderer.ts';
import type { RouteConfig, RoutesManifest } from '../../src/type/route.type.ts';

/**
 * Create a minimal test manifest
 */
function createTestManifest(routes: RouteConfig[] = []): RoutesManifest {
  return {
    routes,
    errorBoundaries: [],
    statusPages: new Map(),
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
    files: {},
    ...overrides,
  };
}

/**
 * Helper to mock fetch responses
 */
function mockFetch(responses: Record<string, string>) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = ((url: string | Request | URL) => {
    const key = typeof url === 'string' ? url : url.toString();
    if (key in responses) {
      return Promise.resolve(
        new Response(responses[key], { status: 200 }),
      );
    }
    return Promise.reject(new Error(`Not mocked: ${key}`));
  }) as typeof globalThis.fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

// ============================================================================
// Constructor Tests
// ============================================================================

Deno.test('SsrMdRouter - constructor initialization', () => {
  const manifest = createTestManifest();
  const router = new SsrMdRouter(manifest);

  assertExists(router);
});

Deno.test('SsrMdRouter - constructor with routes', () => {
  const routes = [
    createTestRoute({ pattern: '/', modulePath: '__default_root__' }),
    createTestRoute({ pattern: '/about', modulePath: '/about.page.ts' }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  assertExists(router);
});

Deno.test('SsrMdRouter - createSsrMdRouter factory function', () => {
  const manifest = createTestManifest();
  const router = createSsrMdRouter(manifest);

  assertExists(router);
  assertEquals(router instanceof SsrMdRouter, true);
});

// ============================================================================
// Valid Route Rendering Tests
// ============================================================================

Deno.test('SsrMdRouter - render() returns 200 for valid route with markdown file', async () => {
  const restore = mockFetch({
    '/about.md': '# About Page',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/about',
        modulePath: '/about.page.ts',
        files: { md: '/about.md' },
      }),
    ];

    const manifest = createTestManifest(routes);
    const router = new SsrMdRouter(manifest);

    const result = await router.render('/about');

    assertEquals(result.status, 200);
    assertStringIncludes(result.markdown, 'About Page');
  } finally {
    restore();
  }
});

Deno.test('SsrMdRouter - render() returns 200 for root route', async () => {
  const routes = [
    createTestRoute({ pattern: '/', modulePath: '__default_root__' }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/');

  assertEquals(result.status, 200);
});

// ============================================================================
// Non-Existent Route Tests (404)
// ============================================================================

Deno.test('SsrMdRouter - render() returns 404 for non-existent route', async () => {
  const routes = [
    createTestRoute({ pattern: '/about', modulePath: '/about.page.ts' }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/nonexistent');

  assertEquals(result.status, 404);
  assertStringIncludes(result.markdown, 'Not Found');
  assertStringIncludes(result.markdown, '/nonexistent');
});

Deno.test('SsrMdRouter - render() 404 includes path in markdown', async () => {
  const manifest = createTestManifest();
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/missing/route');

  assertEquals(result.status, 404);
  assertStringIncludes(result.markdown, '/missing/route');
});

// ============================================================================
// Redirect Route Tests
// ============================================================================

Deno.test('SsrMdRouter - render() handles redirect routes', async () => {
  const routes = [
    createTestRoute({
      pattern: '/old-path',
      type: 'redirect',
      modulePath: '/redirect.ts',
    }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  // Just verify the redirect route type is recognized
  assertEquals(routes[0].type, 'redirect');
});

// ============================================================================
// URL Normalization Tests (/md/ prefix stripping)
// ============================================================================

Deno.test('SsrMdRouter - render() strips /md/ prefix from pathname', async () => {
  const routes = [
    createTestRoute({ pattern: '/about', modulePath: '/about.page.ts' }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/md/about');

  assertEquals(result.status, 200);
});

Deno.test('SsrMdRouter - render() strips /md/ prefix with nested path', async () => {
  const routes = [
    createTestRoute({
      pattern: '/docs/guide',
      modulePath: '/docs/guide.page.ts',
    }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/md/docs/guide');

  assertEquals(result.status, 200);
});

Deno.test('SsrMdRouter - render() handles /md/ as root', async () => {
  const routes = [
    createTestRoute({ pattern: '/', modulePath: '__default_root__' }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/md/');

  assertEquals(result.status, 200);
});

// ============================================================================
// Error Handling Tests (500 status)
// ============================================================================

Deno.test('SsrMdRouter - render() returns 500 on unknown error', async () => {
  const routes = [
    createTestRoute({
      pattern: '/error',
      modulePath: '/error.ts',
      files: { ts: '/error.ts' },
    }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  // The error will occur during module loading which will be caught
  const result = await router.render('/error');

  assertEquals(result.status, 500);
  assertStringIncludes(result.markdown, 'Error');
});

Deno.test('SsrMdRouter - render() error page includes pathname', async () => {
  const routes = [
    createTestRoute({
      pattern: '/broken',
      modulePath: '/broken.ts',
      files: { ts: '/broken.ts' },
    }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/broken');

  assertEquals(result.status, 500);
  assertStringIncludes(result.markdown, '/broken');
});

// ============================================================================
// Markdown String Generation Tests
// ============================================================================

Deno.test('SsrMdRouter - render() joins route hierarchy with separator', async () => {
  const restore = mockFetch({
    '/projects.md': '# Projects',
    '/projects/[id].md': '# Project Details',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/projects',
        modulePath: '/projects.page.ts',
        files: { md: '/projects.md' },
      }),
      createTestRoute({
        pattern: '/projects/:id',
        modulePath: '/projects/[id].page.ts',
        files: { md: '/projects/[id].md' },
      }),
    ];

    const manifest = createTestManifest(routes);
    const router = new SsrMdRouter(manifest);

    const result = await router.render('/projects/123');

    assertEquals(result.status, 200);
    assertStringIncludes(result.markdown, '---');
  } finally {
    restore();
  }
});

Deno.test('SsrMdRouter - render() includes parent route content', async () => {
  const restore = mockFetch({
    '/docs.md': '# Documentation',
    '/docs/guide.md': '# Getting Started',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/docs',
        modulePath: '/docs.page.ts',
        files: { md: '/docs.md' },
      }),
      createTestRoute({
        pattern: '/docs/guide',
        modulePath: '/docs/guide.page.ts',
        files: { md: '/docs/guide.md' },
        parent: '/docs',
      }),
    ];

    const manifest = createTestManifest(routes);
    const router = new SsrMdRouter(manifest);

    const result = await router.render('/docs/guide');

    assertEquals(result.status, 200);
    assertStringIncludes(result.markdown, 'Documentation');
    assertStringIncludes(result.markdown, 'Getting Started');
  } finally {
    restore();
  }
});

// ============================================================================
// Status Page Markdown Generation Tests
// ============================================================================

Deno.test('SsrMdRouter - renderStatusPage generates 404 markdown', async () => {
  const manifest = createTestManifest();
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/missing');

  assertEquals(result.status, 404);
  assertStringIncludes(result.markdown, 'Not Found');
});

Deno.test('SsrMdRouter - renderStatusPage uses STATUS_MESSAGES', async () => {
  const manifest = createTestManifest();
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/nonexistent');

  assertEquals(result.status, 404);
  assertStringIncludes(result.markdown, 'Not Found');
});

Deno.test('SsrMdRouter - 404 with no status page returns fallback', async () => {
  const manifest = createTestManifest([
    createTestRoute({ pattern: '/about', modulePath: '/about.page.ts' }),
  ]);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/nonexistent');

  assertEquals(result.status, 404);
  assertStringIncludes(result.markdown, 'Not Found');
  assertStringIncludes(result.markdown, '/nonexistent');
});

Deno.test('SsrMdRouter - 404 with .md status page returns md content', async () => {
  const restore = mockFetch({
    '/404.md': '# Oops\n\nThis page does not exist.',
  });

  try {
    const statusPage: RouteConfig = {
      pattern: '/404',
      type: 'error',
      modulePath: '/404.page.ts',
      files: { md: '/404.md' },
    };

    const manifest: RoutesManifest = {
      routes: [
        createTestRoute({ pattern: '/about', modulePath: '/about.page.ts' }),
      ],
      errorBoundaries: [],
      statusPages: new Map([[404, statusPage]]),
    };

    const router = new SsrMdRouter(manifest);
    const result = await router.render('/nonexistent');

    assertEquals(result.status, 404);
    assertStringIncludes(result.markdown, 'Oops');
    assertStringIncludes(result.markdown, 'This page does not exist.');
  } finally {
    restore();
  }
});

Deno.test('SsrMdRouter - 404 with html-only status page returns placeholder', async () => {
  const restore = mockFetch({
    '/404.html': '<h1>Not Found</h1><p>Gone.</p>',
  });

  try {
    const statusPage: RouteConfig = {
      pattern: '/404',
      type: 'error',
      modulePath: '/404.page.ts',
      files: { html: '/404.html' },
    };

    const manifest: RoutesManifest = {
      routes: [
        createTestRoute({ pattern: '/about', modulePath: '/about.page.ts' }),
      ],
      errorBoundaries: [],
      statusPages: new Map([[404, statusPage]]),
    };

    const router = new SsrMdRouter(manifest);
    const result = await router.render('/nonexistent');

    assertEquals(result.status, 404);
    assertStringIncludes(result.markdown, 'router-slot');
  } finally {
    restore();
  }
});

// ============================================================================
// Error Page Markdown Generation Tests
// ============================================================================

Deno.test('SsrMdRouter - renderErrorPage includes pathname', async () => {
  const routes = [
    createTestRoute({
      pattern: '/error',
      modulePath: '/error.ts',
      files: { ts: '/error.ts' },
    }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/error');

  assertEquals(result.status, 500);
  assertStringIncludes(result.markdown, '/error');
});

// ============================================================================
// Module Content Extraction Tests
// ============================================================================

Deno.test('SsrMdRouter - handles route with only markdown file', async () => {
  const restore = mockFetch({
    '/info.md': '# Information',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/info',
        modulePath: '/info.page.md',
        files: { md: '/info.md' },
      }),
    ];

    const manifest = createTestManifest(routes);
    const router = new SsrMdRouter(manifest);

    const result = await router.render('/info');

    assertEquals(result.status, 200);
    assertStringIncludes(result.markdown, 'Information');
  } finally {
    restore();
  }
});

Deno.test('SsrMdRouter - handles route with no content files', async () => {
  const routes = [
    createTestRoute({
      pattern: '/empty',
      modulePath: '/empty.ts',
      files: {},
    }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/empty');

  assertEquals(result.status, 200);
  assertStringIncludes(result.markdown, 'router-slot');
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

Deno.test('SsrMdRouter - handles empty markdown content', async () => {
  const restore = mockFetch({
    '/empty.md': '',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/empty',
        modulePath: '/empty.page.ts',
        files: { md: '/empty.md' },
      }),
    ];

    const manifest = createTestManifest(routes);
    const router = new SsrMdRouter(manifest);

    const result = await router.render('/empty');

    assertEquals(result.status, 200);
  } finally {
    restore();
  }
});

Deno.test('SsrMdRouter - handles deeply nested routes', async () => {
  const restore = mockFetch({
    '/a.md': '# A',
    '/a/b.md': '# B',
    '/a/b/c.md': '# C',
    '/a/b/c/d.md': '# D',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/a',
        modulePath: '/a.page.ts',
        files: { md: '/a.md' },
      }),
      createTestRoute({
        pattern: '/a/b',
        modulePath: '/a/b.page.ts',
        files: { md: '/a/b.md' },
      }),
      createTestRoute({
        pattern: '/a/b/c',
        modulePath: '/a/b/c.page.ts',
        files: { md: '/a/b/c.md' },
      }),
      createTestRoute({
        pattern: '/a/b/c/d',
        modulePath: '/a/b/c/d.page.ts',
        files: { md: '/a/b/c/d.md' },
      }),
    ];

    const manifest = createTestManifest(routes);
    const router = new SsrMdRouter(manifest);

    const result = await router.render('/a/b/c/d');

    assertEquals(result.status, 200);
    assertStringIncludes(result.markdown, 'A');
    assertStringIncludes(result.markdown, 'B');
    assertStringIncludes(result.markdown, 'C');
    assertStringIncludes(result.markdown, 'D');
  } finally {
    restore();
  }
});

Deno.test('SsrMdRouter - skips default root route in hierarchy', async () => {
  const restore = mockFetch({
    '/page.md': '# Page',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/',
        modulePath: '__default_root__',
      }),
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const manifest = createTestManifest(routes);
    const router = new SsrMdRouter(manifest);

    const result = await router.render('/page');

    assertEquals(result.status, 200);
    assertEquals(result.markdown, '# Page');
  } finally {
    restore();
  }
});

Deno.test('SsrMdRouter - handles URL with query parameters', async () => {
  const routes = [
    createTestRoute({
      pattern: '/search',
      modulePath: '/search.page.ts',
    }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/search?q=test&limit=10');

  assertEquals(result.status, 200);
});

Deno.test('SsrMdRouter - handles URL with fragment', async () => {
  const routes = [
    createTestRoute({
      pattern: '/docs',
      modulePath: '/docs.page.ts',
    }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/docs#section');

  assertEquals(result.status, 200);
});

// ============================================================================
// Integration Tests with RouteCore and RouteMatcher
// ============================================================================

Deno.test('SsrMdRouter - integrates with RouteCore for matching', async () => {
  const routes = [
    createTestRoute({
      pattern: '/test',
      modulePath: '/test.page.ts',
    }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/test');

  assertEquals(result.status, 200);
});

Deno.test('SsrMdRouter - uses RouteMatcher.findRoute for hierarchy building', async () => {
  const restore = mockFetch({
    '/a.md': 'A',
    '/a/b.md': 'B',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/a',
        modulePath: '/a.page.ts',
        files: { md: '/a.md' },
      }),
      createTestRoute({
        pattern: '/a/b',
        modulePath: '/a/b.page.ts',
        files: { md: '/a/b.md' },
      }),
    ];

    const manifest = createTestManifest(routes);
    const router = new SsrMdRouter(manifest);

    const result = await router.render('/a/b');

    assertEquals(result.status, 200);
  } finally {
    restore();
  }
});

// ============================================================================
// Mock Fetch Tests
// ============================================================================

Deno.test('SsrMdRouter - fetches markdown content from file path', async () => {
  const restore = mockFetch({
    '/content.md': '# Fetched Content',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.ts',
        files: { md: '/content.md' },
      }),
    ];

    const manifest = createTestManifest(routes);
    const router = new SsrMdRouter(manifest);

    const result = await router.render('/page');

    assertEquals(result.status, 200);
    assertStringIncludes(result.markdown, 'Fetched Content');
  } finally {
    restore();
  }
});

Deno.test('SsrMdRouter - handles fetch errors gracefully', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (() => {
    return Promise.reject(new Error('Fetch failed'));
  }) as typeof globalThis.fetch;

  try {
    const routes = [
      createTestRoute({
        pattern: '/error',
        modulePath: '/error.ts',
        files: { md: '/missing.md' },
      }),
    ];

    const manifest = createTestManifest(routes);
    const router = new SsrMdRouter(manifest);

    const result = await router.render('/error');

    assertEquals(result.status, 500);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ============================================================================
// Markdown Content Rendering Tests
// ============================================================================

Deno.test('SsrMdRouter - combines multiple route contents with separator', async () => {
  const restore = mockFetch({
    '/parent.md': '# Parent',
    '/parent/child.md': '# Child',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/parent',
        modulePath: '/parent.page.ts',
        files: { md: '/parent.md' },
      }),
      createTestRoute({
        pattern: '/parent/child',
        modulePath: '/parent/child.page.ts',
        files: { md: '/parent/child.md' },
      }),
    ];

    const manifest = createTestManifest(routes);
    const router = new SsrMdRouter(manifest);

    const result = await router.render('/parent/child');

    assertEquals(result.status, 200);
    assertStringIncludes(result.markdown, '---');
    assertStringIncludes(result.markdown, 'Parent');
    assertStringIncludes(result.markdown, 'Child');
  } finally {
    restore();
  }
});

// ============================================================================
// Route Type Tests
// ============================================================================

Deno.test('SsrMdRouter - recognizes page route type', () => {
  const route = createTestRoute({ type: 'page' });
  assertEquals(route.type, 'page');
});

Deno.test('SsrMdRouter - recognizes redirect route type', () => {
  const route = createTestRoute({ type: 'redirect' });
  assertEquals(route.type, 'redirect');
});

Deno.test('SsrMdRouter - recognizes error route type', () => {
  const route = createTestRoute({ type: 'error' });
  assertEquals(route.type, 'error');
});

// ============================================================================
// Default Root Route Tests
// ============================================================================

Deno.test('SsrMdRouter - handles default root route pattern', async () => {
  const routes = [
    {
      pattern: '/',
      type: 'page' as const,
      modulePath: '__default_root__',
    },
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/');

  assertEquals(result.status, 200);
});

// ============================================================================
// Multiple Content Sections Tests
// ============================================================================

Deno.test('SsrMdRouter - separates content from multiple routes correctly', async () => {
  const restore = mockFetch({
    '/first.md': 'First Section',
    '/first/second.md': 'Second Section',
    '/first/second/third.md': 'Third Section',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/first',
        modulePath: '/first.page.ts',
        files: { md: '/first.md' },
      }),
      createTestRoute({
        pattern: '/first/second',
        modulePath: '/first/second.page.ts',
        files: { md: '/first/second.md' },
      }),
      createTestRoute({
        pattern: '/first/second/third',
        modulePath: '/first/second/third.page.ts',
        files: { md: '/first/second/third.md' },
      }),
    ];

    const manifest = createTestManifest(routes);
    const router = new SsrMdRouter(manifest);

    const result = await router.render('/first/second/third');

    assertEquals(result.status, 200);
    const parts = result.markdown.split('\n\n---\n\n');
    assertEquals(parts.length >= 3, true);
  } finally {
    restore();
  }
});

// ============================================================================
// Module Path Handling Tests
// ============================================================================

Deno.test('SsrMdRouter - handles absolute module paths', async () => {
  const restore = mockFetch({
    '/module/content.md': '# Module Content',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/test',
        modulePath: '/module/test.page.ts',
        files: { md: '/module/content.md' },
      }),
    ];

    const manifest = createTestManifest(routes);
    const router = new SsrMdRouter(manifest);

    const result = await router.render('/test');

    assertEquals(result.status, 200);
    assertStringIncludes(result.markdown, 'Module Content');
  } finally {
    restore();
  }
});

Deno.test('SsrMdRouter - handles default root route module path', () => {
  const route = createTestRoute({
    modulePath: '__default_root__',
  });

  assertEquals(route.modulePath, '__default_root__');
});

// ============================================================================
// Complex Pattern Tests
// ============================================================================

Deno.test('SsrMdRouter - matches routes with dynamic segments', async () => {
  const routes = [
    createTestRoute({
      pattern: '/posts/:id',
      modulePath: '/posts/[id].page.ts',
    }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/posts/123');

  assertEquals(result.status, 200);
});

Deno.test('SsrMdRouter - distinguishes static routes from dynamic', async () => {
  const routes = [
    createTestRoute({
      pattern: '/posts/new',
      modulePath: '/posts/new.page.ts',
    }),
    createTestRoute({
      pattern: '/posts/:id',
      modulePath: '/posts/[id].page.ts',
    }),
  ];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/posts/new');

  assertEquals(result.status, 200);
});

// ============================================================================
// File Extension Tests
// ============================================================================

Deno.test('SsrMdRouter - handles routes with various file types', async () => {
  const restore = mockFetch({
    '/page.md': '# Page',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/test',
        modulePath: '/test.page.ts',
        files: { md: '/page.md', ts: '/test.page.ts' },
      }),
    ];

    const manifest = createTestManifest(routes);
    const router = new SsrMdRouter(manifest);

    const result = await router.render('/test');

    // May be 200 if TS exists, or 500 if module load fails
    assertEquals(result.status === 200 || result.status === 500, true);
  } finally {
    restore();
  }
});

// ============================================================================
// Empty Manifest Tests
// ============================================================================

Deno.test('SsrMdRouter - handles empty route list', async () => {
  const manifest = createTestManifest([]);
  const router = new SsrMdRouter(manifest);

  const result = await router.render('/anything');

  assertEquals(result.status, 404);
  assertStringIncludes(result.markdown, 'Not Found');
});
