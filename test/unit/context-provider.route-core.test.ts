/**
 * RouteCore — extendContext / ContextProvider Tests
 */

import { assertEquals } from '@std/assert';
import { RouteCore } from '../../src/route/route.core.ts';
import type { RouteConfig, RouteInfo, RoutesManifest } from '../../src/type/route.type.ts';
import type { ComponentContext, ContextProvider } from '../../src/component/abstract.component.ts';

function createTestManifest(routes: RouteConfig[] = []): RoutesManifest {
  return { routes, errorBoundaries: [], statusPages: new Map() };
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
// contextProvider storage
// ============================================================================

Deno.test('RouteCore - contextProvider is undefined by default', () => {
  const core = new RouteCore(createTestManifest());
  assertEquals(core.contextProvider, undefined);
});

Deno.test('RouteCore - contextProvider is set from extendContext option', () => {
  const provider: ContextProvider = (ctx) => ctx;
  const core = new RouteCore(createTestManifest(), { extendContext: provider });
  assertEquals(core.contextProvider, provider);
});

// ============================================================================
// buildComponentContext with extendContext
// ============================================================================

Deno.test('RouteCore - buildComponentContext applies extendContext', async () => {
  const route = createTestRoute({ pattern: '/hello', files: { html: '/hello.page.html' } });
  const core = new RouteCore(createTestManifest([route]), {
    extendContext: (base) => ({ ...base, locale: 'en-US' }),
  });

  const routeInfo: RouteInfo = {
    pathname: '/hello',
    pattern: '/hello',
    params: {},
    searchParams: new URLSearchParams(),
  };

  const restore = mockFetch({ '/hello.page.html': '<p>Hello</p>' });
  try {
    const ctx = await core.buildComponentContext(routeInfo, route);
    assertEquals((ctx as ComponentContext & { locale: string }).locale, 'en-US');
  } finally {
    restore();
  }
});

Deno.test('RouteCore - buildComponentContext preserves base properties when extendContext is applied', async () => {
  const route = createTestRoute({
    pattern: '/users/:id',
    files: { html: '/users.page.html', md: '/users.page.md' },
  });
  const core = new RouteCore(createTestManifest([route]), {
    extendContext: (base) => ({ ...base, extra: true }),
  });

  const routeInfo: RouteInfo = {
    pathname: '/users/42',
    pattern: '/users/:id',
    params: { id: '42' },
    searchParams: new URLSearchParams('tab=profile'),
  };

  const signal = new AbortController().signal;
  const restore = mockFetch({
    '/users.page.html': '<div>User</div>',
    '/users.page.md': '# User',
  });

  try {
    const ctx = await core.buildComponentContext(routeInfo, route, signal);
    // Base properties preserved
    assertEquals(ctx.pathname, '/users/42');
    assertEquals(ctx.pattern, '/users/:id');
    assertEquals(ctx.params, { id: '42' });
    assertEquals(ctx.searchParams.get('tab'), 'profile');
    assertEquals(ctx.files?.html, '<div>User</div>');
    assertEquals(ctx.files?.md, '# User');
    assertEquals(ctx.signal, signal);
    // Extension applied
    assertEquals((ctx as ComponentContext & { extra: boolean }).extra, true);
  } finally {
    restore();
  }
});

Deno.test('RouteCore - buildComponentContext works without extendContext', async () => {
  const route = createTestRoute({ pattern: '/about', files: { html: '/about.page.html' } });
  const core = new RouteCore(createTestManifest([route]));

  const routeInfo: RouteInfo = {
    pathname: '/about',
    pattern: '/about',
    params: {},
    searchParams: new URLSearchParams(),
  };

  const restore = mockFetch({ '/about.page.html': '<section>About</section>' });
  try {
    const ctx = await core.buildComponentContext(routeInfo, route);
    assertEquals(ctx.pathname, '/about');
    assertEquals(ctx.files?.html, '<section>About</section>');
    assertEquals(Object.prototype.hasOwnProperty.call(ctx, 'extra'), false);
  } finally {
    restore();
  }
});
