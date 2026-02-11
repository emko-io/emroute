/**
 * SSR Renderers — extendContext Tests
 *
 * Verifies that the extendContext ContextProvider reaches both
 * page components and widgets during server-side rendering.
 */

import { assert, assertEquals } from '@std/assert';
import type { RouteConfig, RoutesManifest } from '../../src/type/route.type.ts';
import type { ComponentContext } from '../../src/component/abstract.component.ts';

// deno-lint-ignore no-explicit-any
const asAny = (v: unknown): any => v;
import { PageComponent } from '../../src/component/page.component.ts';
import { WidgetComponent } from '../../src/component/widget.component.ts';
import { WidgetRegistry } from '../../src/widget/widget.registry.ts';
import { SsrHtmlRouter } from '../../src/renderer/ssr/html.renderer.ts';
import { SsrMdRouter } from '../../src/renderer/ssr/md.renderer.ts';

// ============================================================================
// Helpers
// ============================================================================

function createTestManifest(overrides?: Partial<RoutesManifest>): RoutesManifest {
  return { routes: [], errorBoundaries: [], statusPages: new Map(), ...overrides };
}

function createTestRoute(overrides?: Partial<RouteConfig>): RouteConfig {
  return { pattern: '/test', type: 'page', modulePath: '/test.page.ts', ...overrides };
}

function mockFetch(contentMap: Record<string, string>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    let url: string;
    if (typeof input === 'string') url = input;
    else if (input instanceof URL) url = input.toString();
    else url = input.url;
    for (const [key, content] of Object.entries(contentMap)) {
      if (url.includes(key)) return Promise.resolve(new Response(content, { status: 200 }));
    }
    return Promise.resolve(new Response('Not Found', { status: 404 }));
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

// ============================================================================
// SsrHtmlRouter — page component
// ============================================================================

Deno.test('SsrHtmlRouter - extendContext enriches page component context', async () => {
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

  const manifest = createTestManifest({
    routes: [createTestRoute({
      pattern: '/test',
      modulePath: '/test.page.ts',
      files: { ts: '/test.page.ts' },
    })],
    moduleLoaders: { '/test.page.ts': () => Promise.resolve({ default: new TestPage() }) },
  });

  const restore = mockFetch({});
  try {
    const router = new SsrHtmlRouter(manifest, {
      baseUrl: 'http://test',
      extendContext: (base) => ({ ...base, rpc: true }),
    });

    const result = await router.render('http://test/test');

    assertEquals(result.status, 200);
    assert(capturedContext !== undefined, 'getData should have been called');
    assertEquals(asAny(capturedContext).rpc, true);
    assertEquals(capturedContext!.pathname, '/test');
  } finally {
    restore();
  }
});

// ============================================================================
// SsrHtmlRouter — widget
// ============================================================================

Deno.test('SsrHtmlRouter - extendContext enriches widget context', async () => {
  let capturedWidgetContext: ComponentContext | undefined;

  class ContextPage extends PageComponent {
    override getData() {
      return Promise.resolve(null);
    }
    override renderHTML() {
      return '<div><widget-test-ctx></widget-test-ctx></div>';
    }
    override renderMarkdown() {
      return '# page';
    }
  }

  class TestWidget extends WidgetComponent {
    readonly name = 'test-ctx';
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

  const manifest = createTestManifest({
    routes: [createTestRoute({
      pattern: '/wtest',
      modulePath: '/wtest.page.ts',
      files: { ts: '/wtest.page.ts' },
    })],
    moduleLoaders: { '/wtest.page.ts': () => Promise.resolve({ default: new ContextPage() }) },
  });

  const restore = mockFetch({});
  try {
    const router = new SsrHtmlRouter(manifest, {
      baseUrl: 'http://test',
      widgets,
      extendContext: (base) => ({ ...base, rpc: true, apiVersion: 3 }),
    });

    const result = await router.render('http://test/wtest');

    assertEquals(result.status, 200);
    assert(result.html.includes('widget rendered'));
    assert(capturedWidgetContext !== undefined, 'widget getData should have been called');
    assertEquals(asAny(capturedWidgetContext).rpc, true);
    assertEquals(asAny(capturedWidgetContext).apiVersion, 3);
  } finally {
    restore();
  }
});

// ============================================================================
// SsrMdRouter — page component
// ============================================================================

Deno.test('SsrMdRouter - extendContext enriches page component context', async () => {
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

  const manifest = createTestManifest({
    routes: [createTestRoute({
      pattern: '/test',
      modulePath: '/test.page.ts',
      files: { ts: '/test.page.ts' },
    })],
    moduleLoaders: { '/test.page.ts': () => Promise.resolve({ default: new TestPage() }) },
  });

  const restore = mockFetch({});
  try {
    const router = new SsrMdRouter(manifest, {
      baseUrl: 'http://test',
      extendContext: (base) => ({ ...base, rpc: true }),
    });

    const result = await router.render('http://test/test');

    assertEquals(result.status, 200);
    assert(result.markdown.includes('# test md'));
    assert(capturedContext !== undefined, 'getData should have been called');
    assertEquals(asAny(capturedContext).rpc, true);
    assertEquals(capturedContext!.pathname, '/test');
  } finally {
    restore();
  }
});

// ============================================================================
// SsrMdRouter — widget in markdown
// ============================================================================

Deno.test('SsrMdRouter - extendContext enriches widget context in markdown', async () => {
  let capturedWidgetContext: ComponentContext | undefined;

  class WidgetPage extends PageComponent {
    override getData() {
      return Promise.resolve(null);
    }
    override renderHTML() {
      return '<div>page</div>';
    }
    override renderMarkdown() {
      return '# Widgets\n\n```widget:test-ctx\n{"key":"val"}\n```';
    }
  }

  class TestWidget extends WidgetComponent {
    readonly name = 'test-ctx';
    override getData(args: this['DataArgs']) {
      capturedWidgetContext = args.context as ComponentContext;
      return Promise.resolve({ val: 1 });
    }
    override renderHTML() {
      return '<span>widget</span>';
    }
    override renderMarkdown() {
      return '**widget rendered in md**';
    }
  }

  const widgets = new WidgetRegistry();
  widgets.add(new TestWidget());

  const manifest = createTestManifest({
    routes: [createTestRoute({
      pattern: '/wmd',
      modulePath: '/wmd.page.ts',
      files: { ts: '/wmd.page.ts' },
    })],
    moduleLoaders: { '/wmd.page.ts': () => Promise.resolve({ default: new WidgetPage() }) },
  });

  const restore = mockFetch({});
  try {
    const router = new SsrMdRouter(manifest, {
      baseUrl: 'http://test',
      widgets,
      extendContext: (base) => ({ ...base, rpc: true, apiVersion: 3 }),
    });

    const result = await router.render('http://test/wmd');

    assertEquals(result.status, 200);
    assert(result.markdown.includes('**widget rendered in md**'));
    assert(!result.markdown.includes('```widget:'));
    assert(capturedWidgetContext !== undefined, 'widget getData should have been called');
    assertEquals(asAny(capturedWidgetContext).rpc, true);
    assertEquals(asAny(capturedWidgetContext).apiVersion, 3);
    assertEquals(capturedWidgetContext!.pathname, '/wmd');
  } finally {
    restore();
  }
});
