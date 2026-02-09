/**
 * Widget File Support Tests
 *
 * Tests for widget file loading and rendering:
 * - RouteCore.loadWidgetFiles: caching, relative paths, absolute URLs, fetch failure
 * - resolveWidgetTags with a file-backed widget
 * - MD renderer resolveWidgets with a file-backed widget
 * - WidgetComponent default rendering with files (html-only, md-only, both, neither)
 * - Existing widget behavior unchanged (no files = original behavior)
 */

import { assertEquals, assertStringIncludes } from '@std/assert';
import { RouteCore } from '../../src/route/route.core.ts';
import { WidgetComponent } from '../../src/component/widget.component.ts';
import type { ComponentContext } from '../../src/component/abstract.component.ts';
import { resolveWidgetTags } from '../../src/util/html.util.ts';
import { SsrHtmlRouter } from '../../src/renderer/ssr/html.renderer.ts';
import { SsrMdRouter } from '../../src/renderer/ssr/md.renderer.ts';
import { WidgetRegistry } from '../../src/widget/widget.registry.ts';
import type { RoutesManifest } from '../../src/type/route.type.ts';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestManifest(routes: RoutesManifest['routes'] = []): RoutesManifest {
  return { routes, errorBoundaries: [], statusPages: new Map() };
}

function mockFetch(responses: Record<string, string>) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = ((url: string | Request | URL) => {
    const key = typeof url === 'string' ? url : url.toString();
    for (const [pattern, content] of Object.entries(responses)) {
      if (key.includes(pattern)) {
        return Promise.resolve(new Response(content, { status: 200 }));
      }
    }
    return Promise.resolve(new Response('Not Found', { status: 404 }));
  }) as typeof globalThis.fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

// ============================================================================
// Test Widgets
// ============================================================================

class CssWidget extends WidgetComponent<Record<string, unknown>, { title: string }> {
  override readonly name = 'css-widget';
  override readonly files = {
    html: 'widgets/css-widget.widget.html',
    css: 'widgets/css-widget.widget.css',
  };

  override getData(): Promise<{ title: string }> {
    return Promise.resolve({ title: 'Styled' });
  }
}

class CssOnlyWidget extends WidgetComponent<Record<string, unknown>, null> {
  override readonly name = 'css-only';
  override readonly files = { css: 'widgets/css-only.widget.css' };

  override getData(): Promise<null> {
    return Promise.resolve(null);
  }
}

class FileBackedWidget extends WidgetComponent<Record<string, unknown>, { title: string }> {
  override readonly name = 'file-backed';
  override readonly files = { html: 'widgets/file-backed.widget.html' };

  override getData(): Promise<{ title: string }> {
    return Promise.resolve({ title: 'Hello' });
  }
}

class MdOnlyWidget extends WidgetComponent<Record<string, unknown>, { title: string }> {
  override readonly name = 'md-only';
  override readonly files = { md: 'widgets/md-only.widget.md' };

  override getData(): Promise<{ title: string }> {
    return Promise.resolve({ title: 'Markdown Widget' });
  }
}

class BothFilesWidget extends WidgetComponent<Record<string, unknown>, { title: string }> {
  override readonly name = 'both-files';
  override readonly files = {
    html: 'widgets/both.widget.html',
    md: 'widgets/both.widget.md',
  };

  override getData(): Promise<{ title: string }> {
    return Promise.resolve({ title: 'Both' });
  }
}

class NoFilesWidget extends WidgetComponent<Record<string, unknown>, { count: number }> {
  override readonly name = 'no-files';

  override getData(): Promise<{ count: number }> {
    return Promise.resolve({ count: 42 });
  }

  override renderHTML(
    args: {
      data: { count: number } | null;
      params: Record<string, unknown>;
      context?: ComponentContext;
    },
  ): string {
    return `<span>${args.data?.count ?? 0}</span>`;
  }

  override renderMarkdown(
    args: {
      data: { count: number } | null;
      params: Record<string, unknown>;
      context?: ComponentContext;
    },
  ): string {
    return `Count: ${args.data?.count ?? 0}`;
  }
}

class CustomRenderWidget extends WidgetComponent<Record<string, unknown>, { name: string }> {
  override readonly name = 'custom-render';
  override readonly files = { html: 'widgets/greeting.widget.html' };

  override getData(): Promise<{ name: string }> {
    return Promise.resolve({ name: 'World' });
  }

  override renderHTML(
    args: {
      data: { name: string } | null;
      params: Record<string, unknown>;
      context?: ComponentContext;
    },
  ): string {
    const template = args.context?.files?.html ?? '<p>{{name}}</p>';
    return template.replace('{{name}}', args.data?.name ?? '');
  }

  override renderMarkdown(
    args: {
      data: { name: string } | null;
      params: Record<string, unknown>;
      context?: ComponentContext;
    },
  ): string {
    return `Hello, ${args.data?.name}!`;
  }
}

class AbsoluteUrlWidget extends WidgetComponent<Record<string, unknown>, null> {
  override readonly name = 'cdn-widget';
  override readonly files = { html: 'https://cdn.example.com/widgets/info.html' };

  override getData(): Promise<null> {
    return Promise.resolve(null);
  }
}

// ============================================================================
// RouteCore.loadWidgetFiles Tests
// ============================================================================

Deno.test('loadWidgetFiles - loads relative html file via baseUrl', async () => {
  const restore = mockFetch({
    '/widgets/file-backed.widget.html': '<div>Widget HTML</div>',
  });

  try {
    const core = new RouteCore(createTestManifest(), { baseUrl: 'http://localhost:8000' });
    const files = await core.loadWidgetFiles({ html: 'widgets/file-backed.widget.html' });

    assertEquals(files.html, '<div>Widget HTML</div>');
    assertEquals(files.md, undefined);
  } finally {
    restore();
  }
});

Deno.test('loadWidgetFiles - loads relative md file via baseUrl', async () => {
  const restore = mockFetch({
    '/widgets/md-only.widget.md': '# Widget Content',
  });

  try {
    const core = new RouteCore(createTestManifest(), { baseUrl: 'http://localhost:8000' });
    const files = await core.loadWidgetFiles({ md: 'widgets/md-only.widget.md' });

    assertEquals(files.html, undefined);
    assertEquals(files.md, '# Widget Content');
  } finally {
    restore();
  }
});

Deno.test('loadWidgetFiles - loads both html and md files', async () => {
  const restore = mockFetch({
    '/widgets/both.widget.html': '<div>Both HTML</div>',
    '/widgets/both.widget.md': '# Both Markdown',
  });

  try {
    const core = new RouteCore(createTestManifest(), { baseUrl: 'http://localhost:8000' });
    const files = await core.loadWidgetFiles({
      html: 'widgets/both.widget.html',
      md: 'widgets/both.widget.md',
    });

    assertEquals(files.html, '<div>Both HTML</div>');
    assertEquals(files.md, '# Both Markdown');
  } finally {
    restore();
  }
});

Deno.test('loadWidgetFiles - caches loaded files', async () => {
  let fetchCount = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = ((url: string | Request | URL) => {
    const key = typeof url === 'string' ? url : url.toString();
    if (key.includes('/widgets/cached.html')) {
      fetchCount++;
      return Promise.resolve(new Response('<p>Cached</p>', { status: 200 }));
    }
    return Promise.resolve(new Response('Not Found', { status: 404 }));
  }) as typeof globalThis.fetch;

  try {
    const core = new RouteCore(createTestManifest(), { baseUrl: 'http://localhost:8000' });

    const first = await core.loadWidgetFiles({ html: 'widgets/cached.html' });
    const second = await core.loadWidgetFiles({ html: 'widgets/cached.html' });

    assertEquals(first.html, '<p>Cached</p>');
    assertEquals(second.html, '<p>Cached</p>');
    assertEquals(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('loadWidgetFiles - handles absolute URLs (http/https)', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = ((url: string | Request | URL) => {
    const key = typeof url === 'string' ? url : url.toString();
    if (key === 'https://cdn.example.com/widgets/info.html') {
      return Promise.resolve(new Response('<div>CDN Widget</div>', { status: 200 }));
    }
    return Promise.resolve(new Response('Not Found', { status: 404 }));
  }) as typeof globalThis.fetch;

  try {
    const core = new RouteCore(createTestManifest(), { baseUrl: 'http://localhost:8000' });
    const files = await core.loadWidgetFiles({ html: 'https://cdn.example.com/widgets/info.html' });

    assertEquals(files.html, '<div>CDN Widget</div>');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('loadWidgetFiles - handles fetch failure gracefully', async () => {
  const restore = mockFetch({});

  try {
    const core = new RouteCore(createTestManifest(), { baseUrl: 'http://localhost:8000' });
    const files = await core.loadWidgetFiles({ html: 'widgets/missing.html' });

    assertEquals(files.html, undefined);
  } finally {
    restore();
  }
});

Deno.test('loadWidgetFiles - handles fetch exception gracefully', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (() => {
    return Promise.reject(new Error('Network error'));
  }) as typeof globalThis.fetch;

  try {
    const core = new RouteCore(createTestManifest(), { baseUrl: 'http://localhost:8000' });
    const files = await core.loadWidgetFiles({ html: 'widgets/error.html' });

    assertEquals(files.html, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('loadWidgetFiles - resolves relative path with leading slash', async () => {
  const restore = mockFetch({
    '/widgets/absolute.html': '<div>Absolute Path</div>',
  });

  try {
    const core = new RouteCore(createTestManifest(), { baseUrl: 'http://localhost:8000' });
    const files = await core.loadWidgetFiles({ html: '/widgets/absolute.html' });

    assertEquals(files.html, '<div>Absolute Path</div>');
  } finally {
    restore();
  }
});

Deno.test('loadWidgetFiles - empty files object returns empty result', async () => {
  const core = new RouteCore(createTestManifest());
  const files = await core.loadWidgetFiles({});

  assertEquals(files.html, undefined);
  assertEquals(files.md, undefined);
});

// ============================================================================
// WidgetComponent Default Rendering Tests
// ============================================================================

Deno.test('WidgetComponent - renderHTML uses html file from context', () => {
  const widget = new FileBackedWidget();
  const result = widget.renderHTML({
    data: { title: 'Hello' },
    params: {},
    context: { pathname: '/', params: {}, files: { html: '<div>From File</div>' } },
  });

  assertEquals(result, '<div>From File</div>');
});

Deno.test('WidgetComponent - renderHTML uses md file wrapped in mark-down when no html', () => {
  const widget = new MdOnlyWidget();
  const result = widget.renderHTML({
    data: { title: 'Markdown Widget' },
    params: {},
    context: { pathname: '/', params: {}, files: { md: '# Widget MD' } },
  });

  assertStringIncludes(result, '<mark-down>');
  assertStringIncludes(result, '# Widget MD');
  assertStringIncludes(result, '</mark-down>');
});

Deno.test('WidgetComponent - renderHTML prefers html file over md file', () => {
  const widget = new BothFilesWidget();
  const result = widget.renderHTML({
    data: { title: 'Both' },
    params: {},
    context: {
      pathname: '/',
      params: {},
      files: { html: '<div>HTML wins</div>', md: '# MD loses' },
    },
  });

  assertEquals(result, '<div>HTML wins</div>');
});

Deno.test('WidgetComponent - renderHTML falls back to base Component when no files', () => {
  const widget = new FileBackedWidget();
  const result = widget.renderHTML({
    data: null,
    params: {},
  });

  assertStringIncludes(result, 'c-loading');
});

Deno.test('WidgetComponent - renderHTML falls back to base Component when context has no files', () => {
  const widget = new FileBackedWidget();
  const result = widget.renderHTML({
    data: { title: 'Hello' },
    params: {},
    context: { pathname: '/', params: {} },
  });

  assertStringIncludes(result, 'data-markdown');
});

Deno.test('WidgetComponent - renderMarkdown uses md file from context', () => {
  const widget = new MdOnlyWidget();
  const result = widget.renderMarkdown({
    data: { title: 'Markdown Widget' },
    params: {},
    context: { pathname: '/', params: {}, files: { md: '# Widget Content' } },
  });

  assertEquals(result, '# Widget Content');
});

Deno.test('WidgetComponent - renderMarkdown returns empty string when no files', () => {
  const widget = new MdOnlyWidget();
  const result = widget.renderMarkdown({
    data: { title: 'Markdown Widget' },
    params: {},
  });

  assertEquals(result, '');
});

Deno.test('WidgetComponent - renderMarkdown returns empty string when context has no md file', () => {
  const widget = new BothFilesWidget();
  const result = widget.renderMarkdown({
    data: { title: 'Both' },
    params: {},
    context: { pathname: '/', params: {}, files: { html: '<div>HTML only</div>' } },
  });

  assertEquals(result, '');
});

Deno.test('WidgetComponent - no files widget works as before', () => {
  const widget = new NoFilesWidget();

  const html = widget.renderHTML({ data: { count: 42 }, params: {} });
  assertEquals(html, '<span>42</span>');

  const md = widget.renderMarkdown({ data: { count: 42 }, params: {} });
  assertEquals(md, 'Count: 42');
});

Deno.test('WidgetComponent - custom render with files uses context.files as template', () => {
  const widget = new CustomRenderWidget();
  const result = widget.renderHTML({
    data: { name: 'World' },
    params: {},
    context: {
      pathname: '/',
      params: {},
      files: { html: '<h1>Hello, {{name}}!</h1>' },
    },
  });

  assertEquals(result, '<h1>Hello, World!</h1>');
});

Deno.test('WidgetComponent - custom render falls back when no files loaded', () => {
  const widget = new CustomRenderWidget();
  const result = widget.renderHTML({
    data: { name: 'World' },
    params: {},
  });

  assertEquals(result, '<p>World</p>');
});

Deno.test('WidgetComponent - renderHTML escapes md content in mark-down tag', () => {
  const widget = new MdOnlyWidget();
  const result = widget.renderHTML({
    data: { title: 'Test' },
    params: {},
    context: {
      pathname: '/',
      params: {},
      files: { md: '# <script>alert("xss")</script>' },
    },
  });

  assertStringIncludes(result, '&lt;script&gt;');
  assertEquals(result.includes('<script>'), false);
});

// ============================================================================
// resolveWidgetTags with File-Backed Widget Tests
// ============================================================================

Deno.test('resolveWidgetTags - loads files for file-backed widget', async () => {
  const widget = new FileBackedWidget();
  const registry = { get: (name: string) => name === 'file-backed' ? widget : undefined };

  const loadFiles = async (files: { html?: string; md?: string }) => {
    const result: { html?: string; md?: string } = {};
    if (files.html) result.html = '<div>Loaded HTML</div>';
    return result;
  };

  const html = '<widget-file-backed></widget-file-backed>';
  const result = await resolveWidgetTags(html, registry, '/test', {}, loadFiles);

  assertStringIncludes(result, '<div>Loaded HTML</div>');
  assertStringIncludes(result, 'data-ssr');
});

Deno.test('resolveWidgetTags - does not call loadFiles for widget without files', async () => {
  const widget = new NoFilesWidget();
  const registry = { get: (name: string) => name === 'no-files' ? widget : undefined };

  let loadFilesCalled = false;
  const loadFiles = async () => {
    loadFilesCalled = true;
    return {};
  };

  const html = '<widget-no-files></widget-no-files>';
  const result = await resolveWidgetTags(html, registry, '/test', {}, loadFiles);

  assertEquals(loadFilesCalled, false);
  assertStringIncludes(result, '<span>42</span>');
});

Deno.test('resolveWidgetTags - passes files in context to renderHTML', async () => {
  const widget = new CustomRenderWidget();
  const registry = { get: (name: string) => name === 'custom-render' ? widget : undefined };

  const loadFiles = async () => ({
    html: '<h2>Template: {{name}}</h2>',
  });

  const html = '<widget-custom-render></widget-custom-render>';
  const result = await resolveWidgetTags(html, registry, '/test', {}, loadFiles);

  assertStringIncludes(result, '<h2>Template: World</h2>');
});

Deno.test('resolveWidgetTags - works without loadFiles callback', async () => {
  const widget = new NoFilesWidget();
  const registry = { get: (name: string) => name === 'no-files' ? widget : undefined };

  const html = '<widget-no-files></widget-no-files>';
  const result = await resolveWidgetTags(html, registry, '/test', {});

  assertStringIncludes(result, '<span>42</span>');
});

Deno.test('resolveWidgetTags - self-closing tag with file-backed widget', async () => {
  const widget = new FileBackedWidget();
  const registry = { get: (name: string) => name === 'file-backed' ? widget : undefined };

  const loadFiles = async () => ({
    html: '<p>Self-closing loaded</p>',
  });

  const html = '<widget-file-backed />';
  const result = await resolveWidgetTags(html, registry, '/test', {}, loadFiles);

  assertStringIncludes(result, '<p>Self-closing loaded</p>');
});

// ============================================================================
// SSR HTML Renderer Integration Tests
// ============================================================================

Deno.test('SsrHtmlRouter - renders widget with file-backed HTML', async () => {
  const widgets = new WidgetRegistry();
  widgets.add(new FileBackedWidget());

  const routes = [{
    pattern: '/page',
    type: 'page' as const,
    modulePath: '/page.page.html',
    files: { html: '/page.page.html' },
  }];

  const manifest = createTestManifest(routes);
  const router = new SsrHtmlRouter(manifest, {
    baseUrl: 'http://localhost:8000',
    widgets,
  });

  const restore = mockFetch({
    '/page.page.html': '<div><widget-file-backed></widget-file-backed></div>',
    '/widgets/file-backed.widget.html': '<span>Widget from file</span>',
  });

  try {
    const result = await router.render('http://localhost/page');
    assertEquals(result.status, 200);
    assertStringIncludes(result.html, '<span>Widget from file</span>');
    assertStringIncludes(result.html, 'data-ssr');
  } finally {
    restore();
  }
});

Deno.test('SsrHtmlRouter - renders widget without files unchanged', async () => {
  const widgets = new WidgetRegistry();
  widgets.add(new NoFilesWidget());

  const routes = [{
    pattern: '/page',
    type: 'page' as const,
    modulePath: '/page.page.html',
    files: { html: '/page.page.html' },
  }];

  const manifest = createTestManifest(routes);
  const router = new SsrHtmlRouter(manifest, {
    baseUrl: 'http://localhost:8000',
    widgets,
  });

  const restore = mockFetch({
    '/page.page.html': '<div><widget-no-files></widget-no-files></div>',
  });

  try {
    const result = await router.render('http://localhost/page');
    assertEquals(result.status, 200);
    assertStringIncludes(result.html, '<span>42</span>');
  } finally {
    restore();
  }
});

// ============================================================================
// SSR MD Renderer Integration Tests
// ============================================================================

Deno.test('SsrMdRouter - renders widget with md file', async () => {
  const widgets = new WidgetRegistry();
  widgets.add(new MdOnlyWidget());

  const routes = [{
    pattern: '/page',
    type: 'page' as const,
    modulePath: '/page.page.ts',
    files: { md: '/page.md' },
  }];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest, {
    baseUrl: 'http://localhost:8000',
    widgets,
  });

  const restore = mockFetch({
    '/page.md': '# Page\n\n```widget:md-only\n{}\n```',
    '/widgets/md-only.widget.md': '## Widget from MD file',
  });

  try {
    const result = await router.render('/page');
    assertEquals(result.status, 200);
    assertStringIncludes(result.markdown, '## Widget from MD file');
  } finally {
    restore();
  }
});

Deno.test('SsrMdRouter - renders widget without files unchanged', async () => {
  const widgets = new WidgetRegistry();
  widgets.add(new NoFilesWidget());

  const routes = [{
    pattern: '/page',
    type: 'page' as const,
    modulePath: '/page.page.ts',
    files: { md: '/page.md' },
  }];

  const manifest = createTestManifest(routes);
  const router = new SsrMdRouter(manifest, {
    baseUrl: 'http://localhost:8000',
    widgets,
  });

  const restore = mockFetch({
    '/page.md': '# Page\n\n```widget:no-files\n{}\n```',
  });

  try {
    const result = await router.render('/page');
    assertEquals(result.status, 200);
    assertStringIncludes(result.markdown, 'Count: 42');
  } finally {
    restore();
  }
});

// ============================================================================
// CSS File Support Tests
// ============================================================================

Deno.test('loadWidgetFiles - loads css file via baseUrl', async () => {
  const restore = mockFetch({
    '/widgets/css-widget.widget.css': '.widget { color: red; }',
  });

  try {
    const core = new RouteCore(createTestManifest(), { baseUrl: 'http://localhost:8000' });
    const files = await core.loadWidgetFiles({ css: 'widgets/css-widget.widget.css' });

    assertEquals(files.css, '.widget { color: red; }');
    assertEquals(files.html, undefined);
    assertEquals(files.md, undefined);
  } finally {
    restore();
  }
});

Deno.test('loadWidgetFiles - loads html, md, and css files together', async () => {
  const restore = mockFetch({
    '/widgets/all.widget.html': '<div>All HTML</div>',
    '/widgets/all.widget.md': '# All Markdown',
    '/widgets/all.widget.css': '.all { display: block; }',
  });

  try {
    const core = new RouteCore(createTestManifest(), { baseUrl: 'http://localhost:8000' });
    const files = await core.loadWidgetFiles({
      html: 'widgets/all.widget.html',
      md: 'widgets/all.widget.md',
      css: 'widgets/all.widget.css',
    });

    assertEquals(files.html, '<div>All HTML</div>');
    assertEquals(files.md, '# All Markdown');
    assertEquals(files.css, '.all { display: block; }');
  } finally {
    restore();
  }
});

Deno.test('WidgetComponent - renderHTML prepends style tag when css file in context', () => {
  const widget = new CssWidget();
  const result = widget.renderHTML({
    data: { title: 'Styled' },
    params: {},
    context: {
      pathname: '/',
      params: {},
      files: { html: '<div>Content</div>', css: '.widget { color: red; }' },
    },
  });

  assertStringIncludes(result, '<style>.widget { color: red; }</style>');
  assertStringIncludes(result, '<div>Content</div>');
  assertEquals(result.indexOf('<style>') < result.indexOf('<div>Content</div>'), true);
});

Deno.test('WidgetComponent - renderHTML prepends style tag with md fallback', () => {
  const widget = new CssOnlyWidget();
  const result = widget.renderHTML({
    data: null,
    params: {},
    context: {
      pathname: '/',
      params: {},
      files: { md: '# Styled MD', css: '.md { font-size: 14px; }' },
    },
  });

  assertStringIncludes(result, '<style>.md { font-size: 14px; }</style>');
  assertStringIncludes(result, '<mark-down>');
});

Deno.test('WidgetComponent - renderHTML prepends style tag with base default fallback', () => {
  const widget = new CssOnlyWidget();
  const result = widget.renderHTML({
    data: null,
    params: {},
    context: {
      pathname: '/',
      params: {},
      files: { css: '.base { margin: 0; }' },
    },
  });

  assertStringIncludes(result, '<style>.base { margin: 0; }</style>');
  assertStringIncludes(result, 'c-loading');
});

Deno.test('WidgetComponent - renderHTML no style tag when no css in context', () => {
  const widget = new FileBackedWidget();
  const result = widget.renderHTML({
    data: { title: 'Hello' },
    params: {},
    context: { pathname: '/', params: {}, files: { html: '<div>No CSS</div>' } },
  });

  assertEquals(result.includes('<style>'), false);
  assertEquals(result, '<div>No CSS</div>');
});

Deno.test('WidgetComponent - renderMarkdown ignores css file', () => {
  const widget = new CssWidget();
  const result = widget.renderMarkdown({
    data: { title: 'Styled' },
    params: {},
    context: {
      pathname: '/',
      params: {},
      files: { md: '# Content', css: '.widget { color: red; }' },
    },
  });

  assertEquals(result, '# Content');
  assertEquals(result.includes('<style>'), false);
});

Deno.test('resolveWidgetTags - loads css for css-backed widget', async () => {
  const widget = new CssWidget();
  const registry = { get: (name: string) => name === 'css-widget' ? widget : undefined };

  const loadFiles = async (files: { html?: string; md?: string; css?: string }) => {
    const result: { html?: string; md?: string; css?: string } = {};
    if (files.html) result.html = '<div>CSS Widget HTML</div>';
    if (files.css) result.css = '.css-widget { color: blue; }';
    return result;
  };

  const html = '<widget-css-widget></widget-css-widget>';
  const result = await resolveWidgetTags(html, registry, '/test', {}, loadFiles);

  assertStringIncludes(result, '<style>.css-widget { color: blue; }</style>');
  assertStringIncludes(result, '<div>CSS Widget HTML</div>');
  assertStringIncludes(result, 'data-ssr');
});
