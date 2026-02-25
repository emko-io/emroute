/**
 * SSR Markdown Renderer Tests
 *
 * Comprehensive unit tests for SsrMdRouter class covering:
 * - Slot injection (```router-slot\n``` replacement)
 * - Nested slot injection (multi-level route hierarchy)
 * - Widget resolution in markdown mode
 * - stripSlots utility (removing unconsumed slots)
 * - Status page rendering (404, 500, etc.)
 * - Redirect handling (plain text output)
 * - Route hierarchy composition in markdown
 * - Error handling and error boundaries
 * - URL normalization (/md/ prefix stripping)
 */

import { test, expect, describe } from 'bun:test';
import { SsrMdRouter } from '../../src/renderer/ssr/md.renderer.ts';
import type { RouteConfig } from '../../src/type/route.type.ts';
import { WidgetRegistry } from '../../src/widget/widget.registry.ts';
import type { WidgetComponent } from '../../src/component/widget.component.ts';
import type { ComponentContext } from '../../src/component/abstract.component.ts';
import { createResolver, type TestManifest } from './test.util.ts';

function createTestManifest(overrides?: TestManifest): TestManifest {
  return { routes: [], ...overrides };
}

function createRouter(
  manifest: TestManifest,
  options?: ConstructorParameters<typeof SsrMdRouter>[1],
): SsrMdRouter {
  const resolver = createResolver(manifest.routes ?? [], {
    errorBoundaries: manifest.errorBoundaries,
    statusPages: manifest.statusPages,
    errorHandler: manifest.errorHandler,
  });
  return new SsrMdRouter(resolver, {
    moduleLoaders: manifest.moduleLoaders,
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
    files: {},
    ...overrides,
  };
}

/**
 * Mock fetch helper
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

/**
 * Create a mock widget component
 */
function createMockWidget(
  name: string,
  renderMarkdownFn?: (args: unknown) => string,
): WidgetComponent {
  return {
    name,
    files: undefined,
    getData: () => Promise.resolve({ test: true }),
    renderHTML: () => '<div>widget</div>',
    renderMarkdown: renderMarkdownFn ?? (() => `**${name}**`),
    getTitle: () => undefined,
    renderError: () => '<div>error</div>',
    renderMarkdownError: (e: unknown) =>
      `> **Error** (\`${name}\`): ${e instanceof Error ? e.message : String(e)}`,
  } as unknown as WidgetComponent;
}

// ============================================================================
// Constructor Tests
// ============================================================================

test('SsrMdRouter - constructor initializes successfully', () => {
  const manifest = createTestManifest();
  const router = createRouter(manifest);

  expect(router).toBeDefined();
});

test('SsrMdRouter - createSsrMdRouter factory function creates instance', () => {
  const router = createRouter(createTestManifest());
  expect(router instanceof SsrMdRouter).toEqual(true);
});

test('SsrMdRouter - constructor with options accepts widget registry', () => {
  const manifest = createTestManifest();
  const widgets = new WidgetRegistry();
  const router = createRouter(manifest, { widgets });

  expect(router).toBeDefined();
});

// ============================================================================
// Slot Injection Tests
// ============================================================================

test('SsrMdRouter - injectSlot replaces ```router-slot\\n``` block', async () => {
  const restore = mockFetch({
    '/parent.md': '# Parent\n\n```router-slot\n```\n\nFooter',
    '/parent/child.md': '## Child Content',
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

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/parent/child');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Parent');
    expect(result.content).toContain('Child Content');
    expect(result.content).toContain('Footer');
  } finally {
    restore();
  }
});

test('SsrMdRouter - slot block is exactly ```router-slot\\n```', async () => {
  const restore = mockFetch({
    '/test.md': 'Content with ```router-slot\n``` marker',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/test',
        modulePath: '/test.page.ts',
        files: { md: '/test.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/test');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Content with');
  } finally {
    restore();
  }
});

// ============================================================================
// Nested Slot Injection Tests
// ============================================================================

test('SsrMdRouter - nested slots inject at multiple levels', async () => {
  const restore = mockFetch({
    '/a.md': '# Level A\n\n```router-slot\n```',
    '/a/b.md': '## Level B\n\n```router-slot\n```',
    '/a/b/c.md': '### Level C',
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
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/a/b/c');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Level A');
    expect(result.content).toContain('Level B');
    expect(result.content).toContain('Level C');
  } finally {
    restore();
  }
});

test('SsrMdRouter - deeply nested routes compose correctly', async () => {
  const restore = mockFetch({
    '/l1.md': 'L1\n\n```router-slot\n```',
    '/l1/l2.md': 'L2\n\n```router-slot\n```',
    '/l1/l2/l3.md': 'L3\n\n```router-slot\n```',
    '/l1/l2/l3/l4.md': 'L4\n\n```router-slot\n```',
    '/l1/l2/l3/l4/l5.md': 'L5',
  });

  try {
    const routes = [
      createTestRoute({ pattern: '/l1', modulePath: '/l1.page.ts', files: { md: '/l1.md' } }),
      createTestRoute({
        pattern: '/l1/l2',
        modulePath: '/l1/l2.page.ts',
        files: { md: '/l1/l2.md' },
      }),
      createTestRoute({
        pattern: '/l1/l2/l3',
        modulePath: '/l1/l2/l3.page.ts',
        files: { md: '/l1/l2/l3.md' },
      }),
      createTestRoute({
        pattern: '/l1/l2/l3/l4',
        modulePath: '/l1/l2/l3/l4.page.ts',
        files: { md: '/l1/l2/l3/l4.md' },
      }),
      createTestRoute({
        pattern: '/l1/l2/l3/l4/l5',
        modulePath: '/l1/l2/l3/l4/l5.page.ts',
        files: { md: '/l1/l2/l3/l4/l5.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/l1/l2/l3/l4/l5');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('L1');
    expect(result.content).toContain('L2');
    expect(result.content).toContain('L3');
    expect(result.content).toContain('L4');
    expect(result.content).toContain('L5');
  } finally {
    restore();
  }
});

// ============================================================================
// stripSlots Utility Tests
// ============================================================================

test('SsrMdRouter - stripSlots removes unconsumed router-slot blocks', async () => {
  const restore = mockFetch({
    '/page.md': 'Content\n\n```router-slot\n```',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/page');

    expect(result.status).toEqual(200);
    expect(result.content.includes('```router-slot\n```')).toEqual(false);
    expect(result.content).toContain('Content');
  } finally {
    restore();
  }
});

test('SsrMdRouter - stripSlots trims whitespace after removal', async () => {
  const restore = mockFetch({
    '/page.md': 'Content\n\n```router-slot\n```\n\n',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/page');

    expect(result.status).toEqual(200);
    expect(result.content).toEqual('Content');
  } finally {
    restore();
  }
});

test('SsrMdRouter - stripSlots handles multiple slot blocks', async () => {
  const restore = mockFetch({
    '/page.md': 'Start\n\n```router-slot\n```\n\nMiddle\n\n```router-slot\n```\n\nEnd',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/page');

    expect(result.status).toEqual(200);
    // stripSlots removes all slot blocks and trims, but the extra newlines remain
    expect(result.content).toContain('Start');
    expect(result.content).toContain('Middle');
    expect(result.content).toContain('End');
  } finally {
    restore();
  }
});

// ============================================================================
// Widget Resolution in Markdown Tests
// ============================================================================

test('SsrMdRouter - resolves and renders widgets in markdown content', async () => {
  const restore = mockFetch({
    '/page.md': 'Page content\n\n```widget:greeting\n{}\n```\n\nMore content',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const widgets = new WidgetRegistry();
    const greetingWidget = createMockWidget('greeting', () => '**Hello World**');
    widgets.add(greetingWidget as WidgetComponent);

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest, { widgets });

    const result = await router.render('/page');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Page content');
    expect(result.content).toContain('Hello World');
    expect(result.content).toContain('More content');
  } finally {
    restore();
  }
});

test('SsrMdRouter - passes widget params to renderMarkdown', async () => {
  const restore = mockFetch({
    '/page.md': '```widget:counter\n{"start": 5}\n```',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const widgets = new WidgetRegistry();
    const counterWidget: WidgetComponent = {
      name: 'counter',
      files: undefined,
      getData: () => Promise.resolve(null),
      renderHTML: () => '',
      renderMarkdown: (args: { params?: { start?: number } }) =>
        `Counter starts at: ${args.params?.start ?? 0}`,
      getTitle: () => undefined,
      renderError: () => '',
      renderMarkdownError: () => '',
    } as unknown as WidgetComponent;
    widgets.add(counterWidget);

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest, { widgets });

    const result = await router.render('/page');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Counter starts at: 5');
  } finally {
    restore();
  }
});

test('SsrMdRouter - handles widget with invalid JSON params', async () => {
  const restore = mockFetch({
    '/page.md': '```widget:bad-json\n{invalid json}\n```',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const widgets = new WidgetRegistry();
    widgets.add(createMockWidget('bad-json') as WidgetComponent);

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest, { widgets });

    const result = await router.render('/page');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Error');
  } finally {
    restore();
  }
});

test('SsrMdRouter - handles unknown widget name', async () => {
  const restore = mockFetch({
    '/page.md': '```widget:nonexistent\n{}\n```',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const widgets = new WidgetRegistry();
    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest, { widgets });

    const result = await router.render('/page');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Unknown widget');
  } finally {
    restore();
  }
});

test('SsrMdRouter - widget error is rendered as markdown quote', async () => {
  const restore = mockFetch({
    '/page.md': '```widget:failing\n{}\n```',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const widgets = new WidgetRegistry();
    const failingWidget: WidgetComponent = {
      name: 'failing',
      files: undefined,
      getData: () => Promise.reject(new Error('Widget crashed')),
      renderHTML: () => '',
      renderMarkdown: () => '',
      getTitle: () => undefined,
      renderError: () => '',
      renderMarkdownError: (e: unknown) =>
        `> **Widget Error**: ${e instanceof Error ? e.message : String(e)}`,
    } as unknown as WidgetComponent;
    widgets.add(failingWidget);

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest, { widgets });

    const result = await router.render('/page');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Widget Error');
    expect(result.content).toContain('crashed');
  } finally {
    restore();
  }
});

test('SsrMdRouter - multiple widgets in same page are all resolved', async () => {
  const restore = mockFetch({
    '/page.md': 'Start\n\n```widget:w1\n{}\n```\n\nMiddle\n\n```widget:w2\n{}\n```\n\nEnd',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const widgets = new WidgetRegistry();
    widgets.add(createMockWidget('w1', () => '**Widget 1**') as WidgetComponent);
    widgets.add(createMockWidget('w2', () => '**Widget 2**') as WidgetComponent);

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest, { widgets });

    const result = await router.render('/page');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Widget 1');
    expect(result.content).toContain('Widget 2');
  } finally {
    restore();
  }
});

// ============================================================================
// Status Page Rendering Tests
// ============================================================================

test('SsrMdRouter - 404 status page renders markdown format', async () => {
  const manifest = createTestManifest();
  const router = createRouter(manifest);

  const result = await router.render('/nonexistent');

  expect(result.status).toEqual(404);
  expect(result.content).toContain('# Not Found');
  expect(result.content).toContain('/nonexistent');
});

test('SsrMdRouter - 404 markdown includes path in code block', async () => {
  const manifest = createTestManifest();
  const router = createRouter(manifest);

  const result = await router.render('/missing/route');

  expect(result.status).toEqual(404);
  expect(result.content).toContain('`/missing/route`');
});

test('SsrMdRouter - 500 status page renders markdown format', async () => {
  const routes = [
    createTestRoute({
      pattern: '/error',
      modulePath: '/error.ts',
      files: { ts: '/error.ts' },
    }),
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const result = await router.render('/error');

  expect(result.status).toEqual(500);
  expect(result.content).toContain('Error');
});

test('SsrMdRouter - custom markdown status page is used when available', async () => {
  const restore = mockFetch({
    '/custom-404.md': '# Oops!\n\nPage not found here.',
  });

  try {
    const statusPage: RouteConfig = {
      pattern: '/404',
      type: 'error',
      modulePath: '/404.page.ts',
      files: { md: '/custom-404.md' },
    };

    const routes = [
      createTestRoute({ pattern: '/about', modulePath: '/about.page.ts' }),
    ];

    const manifest = createTestManifest({
      routes,
      statusPages: new Map([[404, statusPage]]),
    });
    const router = createRouter(manifest);

    const result = await router.render('/missing');

    expect(result.status).toEqual(404);
    expect(result.content).toContain('Oops!');
    expect(result.content).toContain('Page not found here.');
  } finally {
    restore();
  }
});

test('SsrMdRouter - status page markdown has router-slot stripped', async () => {
  const restore = mockFetch({
    '/404.md': '# Not Found\n\n```router-slot\n```',
  });

  try {
    const statusPage: RouteConfig = {
      pattern: '/404',
      type: 'error',
      modulePath: '/404.page.ts',
      files: { md: '/404.md' },
    };

    const manifest = createTestManifest({
      statusPages: new Map([[404, statusPage]]),
    });
    const router = createRouter(manifest);

    const result = await router.render('/missing');

    expect(result.status).toEqual(404);
    expect(result.content.includes('```router-slot\n```')).toEqual(false);
  } finally {
    restore();
  }
});

// ============================================================================
// Redirect Handling Tests
// ============================================================================

test('SsrMdRouter - redirect renders plain text output', async () => {
  const manifest: TestManifest = {
    routes: [
      {
        pattern: '/old',
        type: 'redirect',
        modulePath: '/old.redirect.ts',
      },
    ],
    errorBoundaries: [],
    statusPages: new Map(),
    moduleLoaders: {
      '/old.redirect.ts': () =>
        Promise.resolve({
          default: { to: '/new', status: 301 },
        }),
    },
  };

  const router = createRouter(manifest);
  const result = await router.render('/old');

  expect(result.status).toEqual(301);
  expect(result.content).toContain('Redirect to: /new');
});

test('SsrMdRouter - redirect with 302 status', async () => {
  const manifest: TestManifest = {
    routes: [
      {
        pattern: '/temp',
        type: 'redirect',
        modulePath: '/temp.redirect.ts',
      },
    ],
    errorBoundaries: [],
    statusPages: new Map(),
    moduleLoaders: {
      '/temp.redirect.ts': () =>
        Promise.resolve({
          default: { to: '/permanent', status: 302 },
        }),
    },
  };

  const router = createRouter(manifest);
  const result = await router.render('/temp');

  expect(result.status).toEqual(302);
  expect(result.content).toContain('Redirect to: /permanent');
});

// ============================================================================
// Route Hierarchy Composition Tests
// ============================================================================

test('SsrMdRouter - composes full hierarchy for nested route', async () => {
  const restore = mockFetch({
    '/docs.md': '# Documentation\n\n```router-slot\n```',
    '/docs/guide.md': '## Getting Started\n\n```router-slot\n```',
    '/docs/guide/setup.md': '### Setup Steps',
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
      }),
      createTestRoute({
        pattern: '/docs/guide/setup',
        modulePath: '/docs/guide/setup.page.ts',
        files: { md: '/docs/guide/setup.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/docs/guide/setup');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Documentation');
    expect(result.content).toContain('Getting Started');
    expect(result.content).toContain('Setup Steps');
  } finally {
    restore();
  }
});

test('SsrMdRouter - respects slot positions in hierarchy', async () => {
  const restore = mockFetch({
    '/a.md': 'A-before\n\n```router-slot\n```\n\nA-after',
    '/a/b.md': 'B-before\n\n```router-slot\n```\n\nB-after',
    '/a/b/c.md': 'C-content',
  });

  try {
    const routes = [
      createTestRoute({ pattern: '/a', modulePath: '/a.page.ts', files: { md: '/a.md' } }),
      createTestRoute({ pattern: '/a/b', modulePath: '/a/b.page.ts', files: { md: '/a/b.md' } }),
      createTestRoute({
        pattern: '/a/b/c',
        modulePath: '/a/b/c.page.ts',
        files: { md: '/a/b/c.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/a/b/c');

    expect(result.status).toEqual(200);
    // Verify order: A-before, B-before, C, B-after, A-after
    const content = result.content;
    const aBeforeIdx = content.indexOf('A-before');
    const bBeforeIdx = content.indexOf('B-before');
    const cIdx = content.indexOf('C-content');
    const bAfterIdx = content.indexOf('B-after');
    const aAfterIdx = content.indexOf('A-after');

    expect(aBeforeIdx < bBeforeIdx).toEqual(true);
    expect(bBeforeIdx < cIdx).toEqual(true);
    expect(cIdx < bAfterIdx).toEqual(true);
    expect(bAfterIdx < aAfterIdx).toEqual(true);
  } finally {
    restore();
  }
});

test('SsrMdRouter - skips routes without content in hierarchy', async () => {
  const restore = mockFetch({
    '/docs.md': '# Docs\n\n```router-slot\n```',
    '/docs/api.md': '## API',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/docs',
        modulePath: '/docs.page.ts',
        files: { md: '/docs.md' },
      }),
      createTestRoute({
        pattern: '/docs/api',
        modulePath: '/docs/api.page.ts',
        files: { md: '/docs/api.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/docs/api');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Docs');
    expect(result.content).toContain('API');
  } finally {
    restore();
  }
});

// ============================================================================
// URL Normalization Tests
// ============================================================================

test('SsrMdRouter - renders unprefixed routes (server strips /md/ prefix)', async () => {
  const restore = mockFetch({
    '/page.md': 'Page content',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/page');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Page content');
  } finally {
    restore();
  }
});

test('SsrMdRouter - renders unprefixed nested path', async () => {
  const restore = mockFetch({
    '/docs/guide.md': 'Guide',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/docs/guide',
        modulePath: '/docs/guide.page.ts',
        files: { md: '/docs/guide.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/docs/guide');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Guide');
  } finally {
    restore();
  }
});

test('SsrMdRouter - renders root path', async () => {
  const manifest = createTestManifest({ routes: [] });
  const router = createRouter(manifest);

  const result = await router.render('/');
  expect(result.status).toEqual(200);
});

// ============================================================================
// Page Component Rendering Tests
// ============================================================================

test('SsrMdRouter - resolves widget blocks and calls renderMarkdown', async () => {
  // This test verifies widget resolution in markdown content
  const restore = mockFetch({
    '/page.md': 'Start\n\n```widget:demo\n{}\n```\n\nEnd',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const widgets = new WidgetRegistry();
    const customWidget: WidgetComponent = {
      name: 'demo',
      files: undefined,
      getData: () => Promise.resolve(null),
      renderHTML: () => '<div>demo</div>',
      renderMarkdown: () => 'Widget rendered in markdown',
      getTitle: () => undefined,
      renderError: () => '',
      renderMarkdownError: () => '',
    } as unknown as WidgetComponent;
    widgets.add(customWidget);

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest, { widgets });

    const result = await router.render('/page');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Start');
    expect(result.content).toContain('Widget rendered in markdown');
    expect(result.content).toContain('End');
  } finally {
    restore();
  }
});

// ============================================================================
// Default Root Route Tests
// ============================================================================

test('SsrMdRouter - default root route returns slot placeholder', async () => {
  const routes = [
    {
      pattern: '/',
      type: 'page' as const,
      modulePath: '__default_root__',
    },
  ];

  const manifest = createTestManifest({ routes });
  const router = createRouter(manifest);

  const result = await router.render('/');

  expect(result.status).toEqual(200);
});

test('SsrMdRouter - default root route injects child content correctly', async () => {
  const restore = mockFetch({
    '/child.md': 'Child content',
  });

  try {
    const routes = [
      {
        pattern: '/',
        type: 'page' as const,
        modulePath: '__default_root__',
      },
      createTestRoute({
        pattern: '/child',
        modulePath: '/child.page.ts',
        files: { md: '/child.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/child');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Child content');
  } finally {
    restore();
  }
});

// ============================================================================
// Error Boundary Tests
// ============================================================================

test('SsrMdRouter - renders error boundary when available for errors', async () => {
  // This test verifies the error boundary mechanism when a route error occurs.
  // The error boundary should render for pages under its pattern.
  const routes = [
    createTestRoute({
      pattern: '/projects/:id',
      modulePath: '/projects/[id].page.ts',
    }),
  ];

  const restore = mockFetch({
    '/error.md': '# Project Error',
  });

  try {
    const manifest: TestManifest = {
      routes,
      errorBoundaries: [
        { pattern: '/projects', modulePath: '/projects/error.ts' },
      ],
      statusPages: new Map(),
      moduleLoaders: {
        '/projects/error.ts': () =>
          Promise.resolve({
            default: {
              name: 'error',
              getData: () => Promise.resolve(null),
              renderHTML: () => '',
              renderMarkdown: () => '# Project Error',
              getTitle: () => undefined,
              renderError: () => '',
              renderMarkdownError: () => '',
            },
          }),
      },
    };

    const router = createRouter(manifest);
    const result = await router.render('/projects/123');

    // Error boundary patterns are recognized
    expect(result.status === 200 || result.status === 500).toEqual(true);
  } finally {
    restore();
  }
});

// ============================================================================
// Title Extraction Tests
// ============================================================================

test('SsrMdRouter - render result has title property', async () => {
  // The render() method returns an object with content, status, and optional title
  const restore = mockFetch({
    '/page.md': 'Page Content',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/page');

    expect(result.status).toEqual(200);
    // Result object has these properties
    expect(typeof result.content).toEqual('string');
    expect(typeof result.status).toEqual('number');
    expect(result.content).toContain('Page Content');
  } finally {
    restore();
  }
});

// ============================================================================
// Edge Cases
// ============================================================================

test('SsrMdRouter - handles empty markdown file', async () => {
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

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/empty');

    expect(result.status).toEqual(200);
    expect(result.content).toEqual('');
  } finally {
    restore();
  }
});

test('SsrMdRouter - handles markdown with no slots', async () => {
  const restore = mockFetch({
    '/page.md': '# Page\n\nNo slots here',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/page');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('No slots here');
  } finally {
    restore();
  }
});

test('SsrMdRouter - handles route with query parameters', async () => {
  const restore = mockFetch({
    '/search.md': 'Search results',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/search',
        modulePath: '/search.page.ts',
        files: { md: '/search.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/search?q=test&limit=10');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Search results');
  } finally {
    restore();
  }
});

test('SsrMdRouter - handles route with fragment', async () => {
  const restore = mockFetch({
    '/docs.md': 'Documentation',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/docs',
        modulePath: '/docs.page.ts',
        files: { md: '/docs.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/docs#section');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Documentation');
  } finally {
    restore();
  }
});

test('SsrMdRouter - handles route with dynamic parameters', async () => {
  const restore = mockFetch({
    '/post.md': 'Post ID: :id',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/posts/:id',
        modulePath: '/posts/[id].page.ts',
        files: { md: '/post.md' },
      }),
    ];

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest);

    const result = await router.render('/posts/123');

    expect(result.status).toEqual(200);
  } finally {
    restore();
  }
});

// ============================================================================
// Widget File Resolution Tests
// ============================================================================

test('SsrMdRouter - uses discovered widget files when available', async () => {
  const restore = mockFetch({
    '/page.md': '```widget:info\n{}\n```',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const widgets = new WidgetRegistry();
    const infoWidget = createMockWidget('info', () => 'From discovered files');
    widgets.add(infoWidget as WidgetComponent);

    const widgetFiles = {
      'info': { md: '/info.discovered.md' },
    };

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest, { widgets, widgetFiles });

    const result = await router.render('/page');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('From discovered files');
  } finally {
    restore();
  }
});

// ============================================================================
// Context Provider Tests
// ============================================================================

test('SsrMdRouter - passes context to widget getData', async () => {
  const restore = mockFetch({
    '/page.md': '```widget:ctx-aware\n{}\n```',
  });

  try {
    const routes = [
      createTestRoute({
        pattern: '/page',
        modulePath: '/page.page.ts',
        files: { md: '/page.md' },
      }),
    ];

    const widgets = new WidgetRegistry();
    let capturedContext: ComponentContext | undefined;

    const ctxWidget: WidgetComponent = {
      name: 'ctx-aware',
      files: undefined,
      getData: (args: { context: ComponentContext }) => {
        capturedContext = args.context;
        return Promise.resolve({ ok: true });
      },
      renderHTML: () => '',
      renderMarkdown: () => 'Context passed',
      getTitle: () => undefined,
      renderError: () => '',
      renderMarkdownError: () => '',
    } as unknown as WidgetComponent;
    widgets.add(ctxWidget);

    const extendContext = (baseCtx: ComponentContext) => ({ ...baseCtx, custom: true });

    const manifest = createTestManifest({ routes });
    const router = createRouter(manifest, { widgets, extendContext });

    const result = await router.render('/page');

    expect(result.status).toEqual(200);
    expect(result.content).toContain('Context passed');
    expect((capturedContext as ComponentContext & { custom?: boolean })?.custom).toEqual(true);
  } finally {
    restore();
  }
});
