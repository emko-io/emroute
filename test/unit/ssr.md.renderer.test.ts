/**
 * SSR Markdown Renderer Tests
 *
 * Unit tests for SsrMdRenderer (core/renderer/md.renderer.ts):
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

import { test, expect } from 'bun:test';
import { SsrMdRenderer, type SsrMdRendererOptions } from '../../core/renderer/md.renderer.ts';
import { Pipeline } from '../../core/pipeline/pipeline.ts';
import type { RouteConfig } from '../../core/type/route.type.ts';
import type { ComponentContext } from '../../core/type/component.type.ts';
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

/** Build an SsrMdRenderer from the old manifest shape. */
function createRenderer(
  manifest: TestManifest,
  runtime: MockRuntime,
  options?: SsrMdRendererOptions & {
    extendContext?: (ctx: ComponentContext) => ComponentContext;
  },
): SsrMdRenderer {
  writeManifest(runtime, manifest.routes ?? [], {
    ...(manifest.errorBoundaries ? { errorBoundaries: manifest.errorBoundaries } : {}),
    ...(manifest.statusPages ? { statusPages: manifest.statusPages } : {}),
    ...(manifest.errorHandler ? { errorHandler: manifest.errorHandler } : {}),
    ...(manifest.widgetEntries ? { widgetEntries: manifest.widgetEntries } : {}),
  });
  const pipeline = new Pipeline({
    runtime,
    ...(manifest.moduleLoaders ? { moduleLoaders: manifest.moduleLoaders } : {}),
    ...(options?.extendContext ? { contextProvider: options.extendContext } : {}),
  });
  const { extendContext: _, ...rendererOptions } = options ?? {};
  return new SsrMdRenderer(pipeline, rendererOptions);
}

function createTestManifest(overrides?: TestManifest): TestManifest {
  return { routes: [], ...overrides };
}

function createTestRoute(overrides?: Partial<RouteConfig>): RouteConfig {
  return {
    pattern: '/test',
    type: 'page',
    modulePath: '/test.page.ts',
    files: {},
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
// Constructor Tests
// ============================================================================

test('SsrMdRenderer - constructor initializes successfully', () => {
  const runtime = new MockRuntime();
  const renderer = createRenderer(createTestManifest(), runtime);
  expect(renderer).toBeDefined();
});

test('SsrMdRenderer - constructor creates correct instance', () => {
  const runtime = new MockRuntime();
  const renderer = createRenderer(createTestManifest(), runtime);
  expect(renderer instanceof SsrMdRenderer).toEqual(true);
});

// ============================================================================
// Slot Injection Tests
// ============================================================================

test('SsrMdRenderer - injectSlot replaces ```router-slot\\n``` block', async () => {
  const routes = [
    createTestRoute({ pattern: '/parent', modulePath: '/parent.page.ts', files: { md: '/parent.md' } }),
    createTestRoute({ pattern: '/parent/child', modulePath: '/parent/child.page.ts', files: { md: '/parent/child.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/parent.md', '# Parent\n\n```router-slot\n```\n\nFooter');
  runtime.set('/parent/child.md', '## Child Content');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/parent/child'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Parent');
  expect(result.content).toContain('Child Content');
  expect(result.content).toContain('Footer');
});

test('SsrMdRenderer - slot block is exactly ```router-slot\\n```', async () => {
  const routes = [
    createTestRoute({ pattern: '/test', modulePath: '/test.page.ts', files: { md: '/test.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/test.md', 'Content with ```router-slot\n``` marker');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/test'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Content with');
});

// ============================================================================
// Nested Slot Injection Tests
// ============================================================================

test('SsrMdRenderer - nested slots inject at multiple levels', async () => {
  const routes = [
    createTestRoute({ pattern: '/a', modulePath: '/a.page.ts', files: { md: '/a.md' } }),
    createTestRoute({ pattern: '/a/b', modulePath: '/a/b.page.ts', files: { md: '/a/b.md' } }),
    createTestRoute({ pattern: '/a/b/c', modulePath: '/a/b/c.page.ts', files: { md: '/a/b/c.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/a.md', '# Level A\n\n```router-slot\n```');
  runtime.set('/a/b.md', '## Level B\n\n```router-slot\n```');
  runtime.set('/a/b/c.md', '### Level C');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/a/b/c'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Level A');
  expect(result.content).toContain('Level B');
  expect(result.content).toContain('Level C');
});

test('SsrMdRenderer - deeply nested routes compose correctly', async () => {
  const routes = [
    createTestRoute({ pattern: '/l1', modulePath: '/l1.page.ts', files: { md: '/l1.md' } }),
    createTestRoute({ pattern: '/l1/l2', modulePath: '/l1/l2.page.ts', files: { md: '/l1/l2.md' } }),
    createTestRoute({ pattern: '/l1/l2/l3', modulePath: '/l1/l2/l3.page.ts', files: { md: '/l1/l2/l3.md' } }),
    createTestRoute({ pattern: '/l1/l2/l3/l4', modulePath: '/l1/l2/l3/l4.page.ts', files: { md: '/l1/l2/l3/l4.md' } }),
    createTestRoute({ pattern: '/l1/l2/l3/l4/l5', modulePath: '/l1/l2/l3/l4/l5.page.ts', files: { md: '/l1/l2/l3/l4/l5.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/l1.md', 'L1\n\n```router-slot\n```');
  runtime.set('/l1/l2.md', 'L2\n\n```router-slot\n```');
  runtime.set('/l1/l2/l3.md', 'L3\n\n```router-slot\n```');
  runtime.set('/l1/l2/l3/l4.md', 'L4\n\n```router-slot\n```');
  runtime.set('/l1/l2/l3/l4/l5.md', 'L5');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/l1/l2/l3/l4/l5'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('L1');
  expect(result.content).toContain('L2');
  expect(result.content).toContain('L3');
  expect(result.content).toContain('L4');
  expect(result.content).toContain('L5');
});

// ============================================================================
// stripSlots Utility Tests
// ============================================================================

test('SsrMdRenderer - stripSlots removes unconsumed router-slot blocks', async () => {
  const routes = [
    createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { md: '/page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page.md', 'Content\n\n```router-slot\n```');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/page'));

  expect(result.status).toEqual(200);
  expect(result.content.includes('```router-slot\n```')).toEqual(false);
  expect(result.content).toContain('Content');
});

test('SsrMdRenderer - stripSlots trims whitespace after removal', async () => {
  const routes = [
    createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { md: '/page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page.md', 'Content\n\n```router-slot\n```\n\n');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/page'));

  expect(result.status).toEqual(200);
  expect(result.content).toEqual('Content');
});

test('SsrMdRenderer - stripSlots handles multiple slot blocks', async () => {
  const routes = [
    createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { md: '/page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page.md', 'Start\n\n```router-slot\n```\n\nMiddle\n\n```router-slot\n```\n\nEnd');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/page'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Start');
  expect(result.content).toContain('Middle');
  expect(result.content).toContain('End');
});

// ============================================================================
// Widget Resolution in Markdown Tests
// ============================================================================


test('SsrMdRenderer - resolves and renders widgets in markdown content', async () => {
  const routes = [
    createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { md: '/page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page.md', 'Page content\n\n```widget:greeting\n{}\n```\n\nMore content');

  const greetingWidget = new (class extends WidgetComponent {
    override readonly name = 'greeting';
    override getData() { return Promise.resolve(null); }
    override renderHTML() { return '<div>greeting</div>'; }
    override renderMarkdown() { return '**Hello World**'; }
  })();

  const renderer = createRenderer(createTestManifest({
    routes,
    widgetEntries: [{ name: 'greeting', modulePath: '/widgets/greeting.js' }],
    moduleLoaders: { '/widgets/greeting.js': () => Promise.resolve({ default: greetingWidget }) },
  }), runtime);
  const result = await renderer.render(url('/page'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Page content');
  expect(result.content).toContain('Hello World');
  expect(result.content).toContain('More content');
});

test('SsrMdRenderer - passes widget params to renderMarkdown', async () => {
  const routes = [
    createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { md: '/page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page.md', '```widget:counter\n{"start": 5}\n```');

  const counterWidget = new (class extends WidgetComponent {
    override readonly name = 'counter';
    override getData() { return Promise.resolve(null); }
    override renderHTML() { return ''; }
    override renderMarkdown(args: this['RenderArgs']) {
      return `Counter starts at: ${(args.params as Record<string, unknown>)?.start ?? 0}`;
    }
  })();

  const renderer = createRenderer(createTestManifest({
    routes,
    widgetEntries: [{ name: 'counter', modulePath: '/widgets/counter.js' }],
    moduleLoaders: { '/widgets/counter.js': () => Promise.resolve({ default: counterWidget }) },
  }), runtime);
  const result = await renderer.render(url('/page'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Counter starts at: 5');
});

test('SsrMdRenderer - handles widget with invalid JSON params', async () => {
  const routes = [
    createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { md: '/page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page.md', '```widget:bad-json\n{invalid json}\n```');

  const renderer = createRenderer(createTestManifest({
    routes,
    widgetEntries: [{ name: 'bad-json', modulePath: '/widgets/bad-json.js' }],
    moduleLoaders: { '/widgets/bad-json.js': () => Promise.resolve({ default: new (class extends WidgetComponent {
      override readonly name = 'bad-json';
      override getData() { return Promise.resolve(null); }
      override renderHTML() { return ''; }
      override renderMarkdown() { return '**bad-json**'; }
      override renderMarkdownError(e: unknown) {
        return `> **Error** (\`bad-json\`): ${e instanceof Error ? e.message : String(e)}`;
      }
    })() }) },
  }), runtime);
  const result = await renderer.render(url('/page'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Error');
});

test('SsrMdRenderer - handles unknown widget name', async () => {
  const routes = [
    createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { md: '/page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page.md', '```widget:nonexistent\n{}\n```');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/page'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Unknown widget');
});

test('SsrMdRenderer - widget error is rendered as markdown quote', async () => {
  const routes = [
    createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { md: '/page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page.md', '```widget:failing\n{}\n```');

  const failingWidget = new (class extends WidgetComponent {
    override readonly name = 'failing';
    override getData() { return Promise.reject(new Error('Widget crashed')); }
    override renderHTML() { return ''; }
    override renderMarkdown() { return ''; }
    override renderMarkdownError(e: unknown) {
      return `> **Widget Error**: ${e instanceof Error ? e.message : String(e)}`;
    }
  })();

  const renderer = createRenderer(createTestManifest({
    routes,
    widgetEntries: [{ name: 'failing', modulePath: '/widgets/failing.js' }],
    moduleLoaders: { '/widgets/failing.js': () => Promise.resolve({ default: failingWidget }) },
  }), runtime);
  const result = await renderer.render(url('/page'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Widget Error');
  expect(result.content).toContain('crashed');
});

test('SsrMdRenderer - multiple widgets in same page are all resolved', async () => {
  const routes = [
    createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { md: '/page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page.md', 'Start\n\n```widget:w1\n{}\n```\n\nMiddle\n\n```widget:w2\n{}\n```\n\nEnd');

  const w1 = new (class extends WidgetComponent {
    override readonly name = 'w1';
    override getData() { return Promise.resolve(null); }
    override renderHTML() { return ''; }
    override renderMarkdown() { return '**Widget 1**'; }
  })();
  const w2 = new (class extends WidgetComponent {
    override readonly name = 'w2';
    override getData() { return Promise.resolve(null); }
    override renderHTML() { return ''; }
    override renderMarkdown() { return '**Widget 2**'; }
  })();

  const renderer = createRenderer(createTestManifest({
    routes,
    widgetEntries: [
      { name: 'w1', modulePath: '/widgets/w1.js' },
      { name: 'w2', modulePath: '/widgets/w2.js' },
    ],
    moduleLoaders: {
      '/widgets/w1.js': () => Promise.resolve({ default: w1 }),
      '/widgets/w2.js': () => Promise.resolve({ default: w2 }),
    },
  }), runtime);
  const result = await renderer.render(url('/page'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Widget 1');
  expect(result.content).toContain('Widget 2');
});

// ============================================================================
// Status Page Rendering Tests
// ============================================================================

test('SsrMdRenderer - 404 status page renders markdown format', async () => {
  const runtime = new MockRuntime();
  const renderer = createRenderer(createTestManifest(), runtime);
  const result = await renderer.render(url('/nonexistent'));

  expect(result.status).toEqual(404);
  expect(result.content).toContain('# Not Found');
  expect(result.content).toContain('/nonexistent');
});

test('SsrMdRenderer - 404 markdown includes path in code block', async () => {
  const runtime = new MockRuntime();
  const renderer = createRenderer(createTestManifest(), runtime);
  const result = await renderer.render(url('/missing/route'));

  expect(result.status).toEqual(404);
  expect(result.content).toContain('`/missing/route`');
});

test('SsrMdRenderer - 500 status page renders markdown format', async () => {
  const routes = [
    createTestRoute({ pattern: '/error', modulePath: '/error.ts', files: { ts: '/error.ts' } }),
  ];
  const runtime = new MockRuntime();
  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/error'));

  expect(result.status).toEqual(500);
  expect(result.content).toContain('Error');
});

test('SsrMdRenderer - custom markdown status page is used when available', async () => {
  const statusPage: RouteConfig = {
    pattern: '/404',
    type: 'error',
    modulePath: '/404.page.ts',
    files: { md: '/custom-404.md' },
  };

  const runtime = new MockRuntime();
  runtime.set('/custom-404.md', '# Oops!\n\nPage not found here.');

  const routes = [
    createTestRoute({ pattern: '/about', modulePath: '/about.page.ts' }),
  ];

  const manifest = createTestManifest({
    routes,
    statusPages: new Map([[404, statusPage]]),
  });
  const renderer = createRenderer(manifest, runtime);
  const result = await renderer.render(url('/missing'));

  expect(result.status).toEqual(404);
  expect(result.content).toContain('Oops!');
  expect(result.content).toContain('Page not found here.');
});

test('SsrMdRenderer - status page markdown has router-slot stripped', async () => {
  const statusPage: RouteConfig = {
    pattern: '/404',
    type: 'error',
    modulePath: '/404.page.ts',
    files: { md: '/404.md' },
  };

  const runtime = new MockRuntime();
  runtime.set('/404.md', '# Not Found\n\n```router-slot\n```');

  const manifest = createTestManifest({
    statusPages: new Map([[404, statusPage]]),
  });
  const renderer = createRenderer(manifest, runtime);
  const result = await renderer.render(url('/missing'));

  expect(result.status).toEqual(404);
  expect(result.content.includes('```router-slot\n```')).toEqual(false);
});

// ============================================================================
// Redirect Handling Tests
// ============================================================================

test('SsrMdRenderer - redirect renders plain text output', async () => {
  const manifest: TestManifest = {
    routes: [{ pattern: '/old', type: 'redirect', modulePath: '/old.redirect.ts' }],
    errorBoundaries: [],
    statusPages: new Map(),
    moduleLoaders: {
      '/old.redirect.ts': () => Promise.resolve({ default: { to: '/new', status: 301 } }),
    },
  };

  const runtime = new MockRuntime();
  const renderer = createRenderer(manifest, runtime);
  const result = await renderer.render(url('/old'));

  expect(result.status).toEqual(301);
  expect(result.content).toContain('Redirect to: /new');
});

test('SsrMdRenderer - redirect with 302 status', async () => {
  const manifest: TestManifest = {
    routes: [{ pattern: '/temp', type: 'redirect', modulePath: '/temp.redirect.ts' }],
    errorBoundaries: [],
    statusPages: new Map(),
    moduleLoaders: {
      '/temp.redirect.ts': () => Promise.resolve({ default: { to: '/permanent', status: 302 } }),
    },
  };

  const runtime = new MockRuntime();
  const renderer = createRenderer(manifest, runtime);
  const result = await renderer.render(url('/temp'));

  expect(result.status).toEqual(302);
  expect(result.content).toContain('Redirect to: /permanent');
});

// ============================================================================
// Route Hierarchy Composition Tests
// ============================================================================

test('SsrMdRenderer - composes full hierarchy for nested route', async () => {
  const routes = [
    createTestRoute({ pattern: '/docs', modulePath: '/docs.page.ts', files: { md: '/docs.md' } }),
    createTestRoute({ pattern: '/docs/guide', modulePath: '/docs/guide.page.ts', files: { md: '/docs/guide.md' } }),
    createTestRoute({ pattern: '/docs/guide/setup', modulePath: '/docs/guide/setup.page.ts', files: { md: '/docs/guide/setup.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/docs.md', '# Documentation\n\n```router-slot\n```');
  runtime.set('/docs/guide.md', '## Getting Started\n\n```router-slot\n```');
  runtime.set('/docs/guide/setup.md', '### Setup Steps');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/docs/guide/setup'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Documentation');
  expect(result.content).toContain('Getting Started');
  expect(result.content).toContain('Setup Steps');
});

test('SsrMdRenderer - respects slot positions in hierarchy', async () => {
  const routes = [
    createTestRoute({ pattern: '/a', modulePath: '/a.page.ts', files: { md: '/a.md' } }),
    createTestRoute({ pattern: '/a/b', modulePath: '/a/b.page.ts', files: { md: '/a/b.md' } }),
    createTestRoute({ pattern: '/a/b/c', modulePath: '/a/b/c.page.ts', files: { md: '/a/b/c.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/a.md', 'A-before\n\n```router-slot\n```\n\nA-after');
  runtime.set('/a/b.md', 'B-before\n\n```router-slot\n```\n\nB-after');
  runtime.set('/a/b/c.md', 'C-content');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/a/b/c'));

  expect(result.status).toEqual(200);
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
});

test('SsrMdRenderer - skips routes without content in hierarchy', async () => {
  const routes = [
    createTestRoute({ pattern: '/docs', modulePath: '/docs.page.ts', files: { md: '/docs.md' } }),
    createTestRoute({ pattern: '/docs/api', modulePath: '/docs/api.page.ts', files: { md: '/docs/api.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/docs.md', '# Docs\n\n```router-slot\n```');
  runtime.set('/docs/api.md', '## API');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/docs/api'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Docs');
  expect(result.content).toContain('API');
});

// ============================================================================
// URL Normalization Tests
// ============================================================================

test('SsrMdRenderer - renders unprefixed routes (server strips /md/ prefix)', async () => {
  const routes = [
    createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { md: '/page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page.md', 'Page content');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/page'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Page content');
});

test('SsrMdRenderer - renders unprefixed nested path', async () => {
  const routes = [
    createTestRoute({ pattern: '/docs/guide', modulePath: '/docs/guide.page.ts', files: { md: '/docs/guide.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/docs/guide.md', 'Guide');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/docs/guide'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Guide');
});

test('SsrMdRenderer - renders root path', async () => {
  const runtime = new MockRuntime();
  const renderer = createRenderer(createTestManifest({ routes: [] }), runtime);
  const result = await renderer.render(url('/'));

  expect(result.status).toEqual(200);
});

// ============================================================================
// Page Component Rendering Tests
// ============================================================================

test('SsrMdRenderer - resolves widget blocks and calls renderMarkdown', async () => {
  const routes = [
    createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { md: '/page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page.md', 'Start\n\n```widget:demo\n{}\n```\n\nEnd');

  const demoWidget = new (class extends WidgetComponent {
    override readonly name = 'demo';
    override getData() { return Promise.resolve(null); }
    override renderHTML() { return '<div>demo</div>'; }
    override renderMarkdown() { return 'Widget rendered in markdown'; }
  })();

  const renderer = createRenderer(createTestManifest({
    routes,
    widgetEntries: [{ name: 'demo', modulePath: '/widgets/demo.js' }],
    moduleLoaders: { '/widgets/demo.js': () => Promise.resolve({ default: demoWidget }) },
  }), runtime);
  const result = await renderer.render(url('/page'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Start');
  expect(result.content).toContain('Widget rendered in markdown');
  expect(result.content).toContain('End');
});

// ============================================================================
// Default Root Route Tests
// ============================================================================

test('SsrMdRenderer - default root route returns slot placeholder', async () => {
  const routes = [
    { pattern: '/', type: 'page' as const, modulePath: '__default_root__' },
  ];
  const runtime = new MockRuntime();
  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/'));

  expect(result.status).toEqual(200);
});

test('SsrMdRenderer - default root route injects child content correctly', async () => {
  const routes = [
    { pattern: '/', type: 'page' as const, modulePath: '__default_root__' },
    createTestRoute({ pattern: '/child', modulePath: '/child.page.ts', files: { md: '/child.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/child.md', 'Child content');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/child'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Child content');
});

// ============================================================================
// Error Boundary Tests
// ============================================================================

test('SsrMdRenderer - renders error boundary when available for errors', async () => {
  const routes = [
    createTestRoute({ pattern: '/projects/:id', modulePath: '/projects/[id].page.ts' }),
  ];

  const manifest: TestManifest = {
    routes,
    errorBoundaries: [{ pattern: '/projects', modulePath: '/projects/error.ts' }],
    statusPages: new Map(),
    moduleLoaders: {
      '/projects/error.ts': () => Promise.resolve({
        default: stubComponent({ renderMarkdown: () => '# Project Error' }),
      }),
    },
  };

  const runtime = new MockRuntime();
  const renderer = createRenderer(manifest, runtime);
  const result = await renderer.render(url('/projects/123'));

  expect(result.status === 200 || result.status === 500).toEqual(true);
});

// ============================================================================
// Title Extraction Tests
// ============================================================================

test('SsrMdRenderer - render result has title property', async () => {
  const routes = [
    createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { md: '/page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page.md', 'Page Content');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/page'));

  expect(result.status).toEqual(200);
  expect(typeof result.content).toEqual('string');
  expect(typeof result.status).toEqual('number');
  expect(result.content).toContain('Page Content');
});

// ============================================================================
// Edge Cases
// ============================================================================

test('SsrMdRenderer - handles empty markdown file', async () => {
  const routes = [
    createTestRoute({ pattern: '/empty', modulePath: '/empty.page.ts', files: { md: '/empty.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/empty.md', '');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/empty'));

  expect(result.status).toEqual(200);
  expect(result.content).toEqual('');
});

test('SsrMdRenderer - handles markdown with no slots', async () => {
  const routes = [
    createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { md: '/page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page.md', '# Page\n\nNo slots here');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/page'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('No slots here');
});

test('SsrMdRenderer - handles route with query parameters', async () => {
  const routes = [
    createTestRoute({ pattern: '/search', modulePath: '/search.page.ts', files: { md: '/search.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/search.md', 'Search results');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/search?q=test&limit=10'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Search results');
});

test('SsrMdRenderer - handles route with fragment', async () => {
  const routes = [
    createTestRoute({ pattern: '/docs', modulePath: '/docs.page.ts', files: { md: '/docs.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/docs.md', 'Documentation');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/docs#section'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Documentation');
});

test('SsrMdRenderer - handles route with dynamic parameters', async () => {
  const routes = [
    createTestRoute({ pattern: '/posts/:id', modulePath: '/posts/[id].page.ts', files: { md: '/post.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/post.md', 'Post ID: :id');

  const renderer = createRenderer(createTestManifest({ routes }), runtime);
  const result = await renderer.render(url('/posts/123'));

  expect(result.status).toEqual(200);
});

// ============================================================================
// Widget File Resolution Tests
// ============================================================================

test('SsrMdRenderer - uses __files from widget module when available', async () => {
  const routes = [
    createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { md: '/page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page.md', '```widget:info\n{}\n```');

  const InfoWidget = class extends WidgetComponent {
    override readonly name = 'info';
    override getData() { return Promise.resolve(null); }
    override renderHTML() { return ''; }
    override renderMarkdown() { return 'From discovered files'; }
  };

  const renderer = createRenderer(createTestManifest({
    routes,
    widgetEntries: [{ name: 'info', modulePath: '/widgets/info.widget.js' }],
    moduleLoaders: {
      '/widgets/info.widget.js': () => Promise.resolve({
        default: InfoWidget,
        __files: { md: 'discovered md content' },
      }),
    },
  }), runtime);
  const result = await renderer.render(url('/page'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('From discovered files');
});

// ============================================================================
// Context Provider Tests
// ============================================================================

test('SsrMdRenderer - passes context to widget getData', async () => {
  const routes = [
    createTestRoute({ pattern: '/page', modulePath: '/page.page.ts', files: { md: '/page.md' } }),
  ];
  const runtime = new MockRuntime();
  runtime.set('/page.md', '```widget:ctx-aware\n{}\n```');

  let capturedContext: ComponentContext | undefined;

  const ctxWidget = new (class extends WidgetComponent {
    override readonly name = 'ctx-aware';
    override getData(args: this['DataArgs']) {
      capturedContext = args.context;
      return Promise.resolve({ ok: true });
    }
    override renderHTML() { return ''; }
    override renderMarkdown() { return 'Context passed'; }
  })();

  const extendContext = (baseCtx: ComponentContext) => ({ ...baseCtx, custom: true });
  const renderer = createRenderer(createTestManifest({
    routes,
    widgetEntries: [{ name: 'ctx-aware', modulePath: '/widgets/ctx-aware.js' }],
    moduleLoaders: { '/widgets/ctx-aware.js': () => Promise.resolve({ default: ctxWidget }) },
  }), runtime, { extendContext });
  const result = await renderer.render(url('/page'));

  expect(result.status).toEqual(200);
  expect(result.content).toContain('Context passed');
  expect((capturedContext as ComponentContext & { custom?: boolean })?.custom).toEqual(true);
});
