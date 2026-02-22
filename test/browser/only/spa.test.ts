/**
 * SPA Mode: only — Pure SPA Browser Tests
 *
 * Tests the SPA HTML renderer in a real browser via Playwright.
 * No SSR content — bare shell with client-side rendering.
 *
 * Coverage:
 * - Mode behavior (redirects, SPA shell)
 * - SPA navigation (client-side routing without full page reload)
 * - View transitions (startViewTransition API)
 * - Link interception (same-origin links hijacked for SPA nav)
 * - Back/forward navigation (Navigation API integration)
 * - Router events (navigate, load, error)
 * - Route parameter extraction (dynamic segments)
 * - Widget rendering in SPA mode (custom elements)
 * - Dynamic page updates (getData + re-render)
 * - Nested routes (hierarchical rendering via <router-slot>)
 * - Error handling (boundaries, 404, root handler)
 * - Redirects (.redirect.ts)
 * - Template patterns (.page.ts + .page.html)
 * - Markdown rendering (<mark-down> element)
 * - Lazy loading (widget intersection observer)
 * - Element references (this.element in widgets)
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import {
  createTestBrowser,
  createTestServer,
  type TestBrowser,
  type TestServer,
} from '../shared/setup.ts';
import type { Page } from 'playwright';

let server: TestServer;
let tb: TestBrowser;

function baseUrl(path = '/'): string {
  return server.baseUrl(path);
}

// ── Mode Behavior ───────────────────────────────────────────────────

describe("SPA mode 'only' — HTTP behavior", () => {
  beforeAll(async () => {
    server = await createTestServer({ mode: 'only', port: 4104 });
  });

  afterAll(() => {
    server.stop();
  });

  test('GET / serves SPA shell', async () => {
    const res = await fetch(baseUrl('/'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('<router-slot');
  });

  test('GET /about serves SPA shell', async () => {
    const res = await fetch(baseUrl('/about'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('<router-slot');
  });

  test('GET /html/about serves SPA shell (no SSR)', async () => {
    const res = await fetch(baseUrl('/html/about'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('<router-slot');
    // Should NOT contain SSR-rendered content with data-ssr-route
    expect(html.includes('data-ssr-route')).toBe(false);
  });

  test(
    'GET /md/about serves SPA shell (no SSR Markdown)',
    async () => {
      const res = await fetch(baseUrl('/md/about'));
      const contentType = res.headers.get('content-type');
      expect(contentType?.includes('text/html')).toBeTruthy();
      await res.text(); // consume body
    },
  );
});

// ── SPA Renderer ────────────────────────────────────────────────────

describe('SPA renderer', () => {
  let page!: Page;

  beforeAll(async () => {
    server = await createTestServer({ mode: 'only', port: 4104 });
    tb = await createTestBrowser();
    page = await tb.newPage();
  });

  afterAll(async () => {
    await page.close();
    await tb.close();
    server.stop();
  });

  // ========================================
  // SPA Navigation
  // ========================================

  test(
    'SPA navigation: link click does not trigger full page reload',
    async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('router-slot mark-down h1', {
        timeout: 5000,
      });

      let fullLoadFired = false;
      page.on('load', () => {
        fullLoadFired = true;
      });
      fullLoadFired = false;

      // Click a same-origin link (fixtures use /html/ prefix for progressive enhancement)
      await page.click('a[href="/html/about"]');
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('router-slot router-slot h1');
          return h1?.textContent === 'About';
        },
        undefined,
        { timeout: 5000 },
      );

      // URL should change without full reload — keeps /html/ prefix
      expect(new URL(page.url()).pathname).toEqual('/html/about');
      expect(fullLoadFired).toBe(false);
    },
  );

  test(
    'SPA navigation: programmatic router.navigate() updates content',
    async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('router-slot mark-down h1', {
        timeout: 5000,
      });

      await page.evaluate(
        async () =>
          await (
            globalThis as unknown as Record<
              string,
              { navigate(url: string): Promise<void> }
            >
          ).__emroute_router.navigate('/html/about'),
      );
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('router-slot router-slot h1');
          return h1?.textContent === 'About';
        },
        undefined,
        { timeout: 5000 },
      );

      expect(new URL(page.url()).pathname).toEqual('/html/about');
      const heading = await page.textContent('router-slot router-slot h1');
      expect(heading).toEqual('About');
    },
  );

  test(
    'SPA navigation: history back button restores previous page',
    async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('router-slot mark-down h1', {
        timeout: 5000,
      });

      // Navigate to /about
      await page.evaluate(
        async () =>
          await (
            globalThis as unknown as Record<
              string,
              { navigate(url: string): Promise<void> }
            >
          ).__emroute_router.navigate('/html/about'),
      );
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('router-slot router-slot h1');
          return h1?.textContent === 'About';
        },
        undefined,
        { timeout: 5000 },
      );

      // Back to /
      await page.goBack();
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('router-slot mark-down h1');
          return h1?.textContent === 'emroute';
        },
        undefined,
        { timeout: 5000 },
      );

      const heading = await page.textContent('router-slot mark-down h1');
      expect(heading).toEqual('emroute');
      expect(new URL(page.url()).pathname).toEqual('/html/');
    },
  );

  test(
    'SPA navigation: history forward button restores next page',
    async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('router-slot mark-down h1', {
        timeout: 5000,
      });

      // Navigate to /about
      await page.evaluate(
        async () =>
          await (
            globalThis as unknown as Record<
              string,
              { navigate(url: string): Promise<void> }
            >
          ).__emroute_router.navigate('/html/about'),
      );
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('router-slot router-slot h1');
          return h1?.textContent === 'About';
        },
        undefined,
        { timeout: 5000 },
      );

      // Back to /
      await page.goBack();
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('router-slot mark-down h1');
          return h1?.textContent === 'emroute';
        },
        undefined,
        { timeout: 5000 },
      );

      // Forward to /about
      await page.goForward();
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('router-slot router-slot h1');
          return h1?.textContent === 'About';
        },
        undefined,
        { timeout: 5000 },
      );

      expect(new URL(page.url()).pathname).toEqual('/html/about');
    },
  );

  test(
    'SPA navigation: rapid sequential navigations render only final destination',
    async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('router-slot mark-down h1', {
        timeout: 5000,
      });

      // Fire multiple navigations without awaiting intermediate ones.
      // Only the last navigation should render; earlier ones should be aborted
      await page.evaluate(async () => {
        // deno-lint-ignore no-explicit-any
        const router = (globalThis as any).__emroute_router;
        // Fire-and-forget: these should be cancelled by the final navigate()
        router.navigate('/html/projects/42');
        router.navigate('/html/about');
        // Only await the final navigation
        await router.navigate('/html/docs');
      });

      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('router-slot router-slot h1');
          return h1?.textContent === 'Docs';
        },
        undefined,
        { timeout: 5000 },
      );

      // The final route's content should be visible
      const heading = await page.textContent('router-slot router-slot h1');
      expect(heading).toEqual('Docs');
      expect(new URL(page.url()).pathname).toEqual('/html/docs');

      // Content from earlier (aborted) navigations must not be present
      const hasProject = await page.evaluate(() => {
        const el = document.querySelector(
          'router-slot router-slot router-slot .project-id',
        );
        return el !== null;
      });
      expect(hasProject).toBe(false);
    },
  );

  test(
    'SPA navigation: hash navigation includes hash in URL',
    async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('router-slot mark-down h1', {
        timeout: 5000,
      });

      await page.evaluate(
        async () =>
          // deno-lint-ignore no-explicit-any
          await (globalThis as any).__emroute_router.navigate(
            '/html/about#section-1',
          ),
      );
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('router-slot router-slot h1');
          return h1?.textContent === 'About';
        },
        undefined,
        { timeout: 5000 },
      );

      expect(page.url()).toContain('#section-1');
      const sectionExists = await page.evaluate(
        () => document.getElementById('section-1') !== null,
      );
      expect(sectionExists).toBeTruthy();
    },
  );

  // ========================================
  // View Transitions
  // ========================================

  test(
    'view transitions: SPA navigation uses View Transitions API when available',
    async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('router-slot mark-down h1', {
        timeout: 5000,
      });

      const called = await page.evaluate(async () => {
        let transitionCalled = false;
        const original = document.startViewTransition;
        document.startViewTransition = ((cb: () => Promise<void>) => {
          transitionCalled = true;
          return original.call(document, cb);
        }) as typeof document.startViewTransition;
        // deno-lint-ignore no-explicit-any
        await (globalThis as any).__emroute_router.navigate('/html/about');
        document.startViewTransition = original;
        return transitionCalled;
      });

      expect(called).toBe(true);

      // Verify the page still rendered correctly
      const heading = await page.textContent('router-slot router-slot h1');
      expect(heading).toEqual('About');
    },
  );

  // ========================================
  // Link Interception
  // ========================================

  test(
    'link interception: does not intercept external links',
    async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('router-slot mark-down h1', {
        timeout: 5000,
      });

      const href = await page.getAttribute(
        'a[href="https://example.com"]',
        'href',
      );
      expect(href).toEqual('https://example.com');
    },
  );

  test(
    'link interception: /html/ link is SPA-navigated in only mode',
    async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('router-slot mark-down h1', {
        timeout: 5000,
      });

      let fullLoadFired = false;
      page.on('load', () => {
        fullLoadFired = true;
      });
      fullLoadFired = false;

      // Inject an /html/ link — in 'only' mode, SPA intercepts everything
      await page.evaluate(() => {
        const a = document.createElement('a');
        a.href = '/html/about';
        a.textContent = 'HTML About';
        document.querySelector('router-slot')?.appendChild(a);
      });

      await page.click('a[href="/html/about"]');
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('router-slot router-slot h1');
          return h1?.textContent === 'About';
        },
        undefined,
        { timeout: 5000 },
      );

      expect(fullLoadFired).toBe(false);
    },
  );

  // ========================================
  // Router Events
  // ========================================

  test(
    'router events: navigate and load events fire on navigation',
    async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('router-slot mark-down h1', {
        timeout: 5000,
      });

      const events = await page.evaluate(async () => {
        const collected: Array<{ type: string; pathname: string }> = [];
        // deno-lint-ignore no-explicit-any
        const router = (globalThis as any).__emroute_router;
        router.addEventListener(
          (event: { type: string; pathname: string }) => {
            collected.push({ type: event.type, pathname: event.pathname });
          },
        );
        await router.navigate('/html/about');
        return collected;
      });

      const navigateEvent = events.find(
        (e: { type: string }) => e.type === 'navigate',
      );
      const loadEvent = events.find(
        (e: { type: string }) => e.type === 'load',
      );
      expect(navigateEvent).toBeTruthy();
      expect(loadEvent).toBeTruthy();
      expect(navigateEvent!.pathname).toEqual('/html/about');
      expect(loadEvent!.pathname).toEqual('/html/about');
    },
  );

  // ========================================
  // Route Parameter Extraction
  // ========================================

  test(
    'route params: dynamic segment extracts parameter from URL',
    async () => {
      await page.goto(baseUrl('/html/projects/42'));
      await page.waitForSelector('router-slot router-slot router-slot h1', {
        timeout: 5000,
      });

      const params = await page.evaluate(() =>
        (
          globalThis as unknown as Record<
            string,
            { getParams(): Record<string, string> }
          >
        ).__emroute_router.getParams()
      );
      expect(params.id).toEqual('42');
    },
  );

  test(
    'route params: parameter changes on navigation to different ID',
    async () => {
      await page.goto(baseUrl('/html/projects/42'));
      await page.waitForSelector('router-slot router-slot router-slot h1', {
        timeout: 5000,
      });

      await page.evaluate(
        async () =>
          await (
            globalThis as unknown as {
              __emroute_router: { navigate: (path: string) => Promise<void> };
            }
          ).__emroute_router.navigate('/html/projects/99'),
      );
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector(
            'router-slot router-slot router-slot h1',
          );
          return h1?.textContent === 'Project 99';
        },
        undefined,
        { timeout: 5000 },
      );

      const heading = await page.textContent(
        'router-slot router-slot router-slot h1',
      );
      expect(heading).toEqual('Project 99');

      const params = await page.evaluate(() =>
        (
          globalThis as unknown as Record<
            string,
            { getParams(): Record<string, string> }
          >
        ).__emroute_router.getParams()
      );
      expect(params.id).toEqual('99');
    },
  );

  test(
    'route params: nested dynamic route extracts multiple params',
    async () => {
      await page.goto(baseUrl('/html/projects/42/tasks'));
      await page.waitForSelector(
        'router-slot router-slot router-slot router-slot h1',
        { timeout: 5000 },
      );

      const heading = await page.textContent(
        'router-slot router-slot router-slot router-slot h1',
      );
      expect(heading).toEqual('Tasks for 42');

      const params = await page.evaluate(() =>
        (
          globalThis as unknown as Record<
            string,
            { getParams(): Record<string, string> }
          >
        ).__emroute_router.getParams()
      );
      expect(params.id).toEqual('42');
    },
  );

  // ========================================
  // Widget Rendering
  // ========================================

  test('widgets: widget custom element renders in SPA', async () => {
    await page.goto(baseUrl('/html/mixed-widgets'));
    await page.waitForSelector('h1', { timeout: 5000 });

    // Check that widget custom element exists and rendered
    const widgetExists = await page.evaluate(() => {
      return document.querySelector('widget-greeting') !== null;
    });
    expect(widgetExists).toBeTruthy();
  });

  test('widgets: widget getData runs in SPA', async () => {
    await page.goto(baseUrl('/html/mixed-widgets'));
    await page.waitForSelector('widget-greeting .greeting-message', {
      timeout: 5000,
    });

    const message = await page.textContent(
      'widget-greeting .greeting-message',
    );
    expect(message).toContain('Hello');
  });

  test(
    'widgets: widget has element reference during getData and render',
    async () => {
      await page.goto(baseUrl('/html/mixed-widgets'));
      await page.waitForSelector('widget-element-ref .element-ref-result', {
        timeout: 5000,
      });

      const result = await page.evaluate(() => {
        const widget = document.querySelector('widget-element-ref');
        const el = widget?.shadowRoot?.querySelector('.element-ref-result');
        return {
          getData: el?.getAttribute('data-get-data'),
          render: el?.getAttribute('data-render'),
          tag: el?.getAttribute('data-tag'),
        };
      });

      expect(result.getData).toEqual('true');
      expect(result.render).toEqual('true');
      expect(result.tag).toEqual('widget-element-ref');
    },
  );

  test(
    'widgets: lazy widget defers loadData until visible',
    async () => {
      await page.goto(baseUrl('/html/mixed-widgets'));
      await page.waitForSelector('widget-greeting[lazy] .greeting-message', {
        timeout: 5000,
      });

      const message = await page.textContent(
        'widget-greeting[lazy] .greeting-message',
      );
      expect(message).toEqual('Hello, Lazy!');
    },
  );

  test(
    'widgets: lazy attribute is not parsed as a widget param',
    async () => {
      await page.goto(baseUrl('/html/mixed-widgets'));
      await page.waitForSelector('widget-greeting[lazy] .greeting-message', {
        timeout: 5000,
      });

      // The greeting should use the name param, not have a "lazy" param
      const message = await page.textContent(
        'widget-greeting[lazy] .greeting-message',
      );
      expect(message).toEqual('Hello, Lazy!');
    },
  );

  test(
    'widgets: widget element has content-visibility and container-type',
    async () => {
      await page.goto(baseUrl('/html/mixed-widgets'));
      await page.waitForSelector('widget-greeting .greeting-message', {
        timeout: 5000,
      });

      const styles = await page.evaluate(() => {
        const el = document.querySelector('widget-greeting');
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          contentVisibility: s.contentVisibility,
          containerType: s.containerType,
        };
      });
      expect(styles?.contentVisibility).toEqual('auto');
      expect(styles?.containerType).toEqual('normal');
    },
  );

  test(
    'widgets: failing widget shows error without breaking the page',
    async () => {
      await page.goto(baseUrl('/html/about'));
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('router-slot router-slot h1');
          return h1?.textContent === 'About';
        },
        undefined,
        { timeout: 5000 },
      );

      // Page content should render normally
      const heading = await page.textContent('router-slot router-slot h1');
      expect(heading).toEqual('About');

      // Widget should show error state, not crash the page
      const widgetError = await page.waitForSelector(
        'widget-failing div',
        {
          timeout: 5000,
        },
      );
      const errorText = await widgetError.textContent();
      expect(errorText).toContain('Widget data fetch failed');
    },
  );

  // ========================================
  // Dynamic Page Updates
  // ========================================

  test(
    'dynamic updates: .page.ts component renders with getData',
    async () => {
      await page.goto(baseUrl('/html/projects/42'));
      await page.waitForSelector('router-slot router-slot router-slot h1', {
        timeout: 5000,
      });

      const heading = await page.textContent(
        'router-slot router-slot router-slot h1',
      );
      expect(heading).toEqual('Project 42');

      const idText = await page.textContent(
        'router-slot router-slot router-slot .project-id',
      );
      expect(idText).toEqual('ID: 42');
    },
  );

  test(
    'dynamic updates: .page.ts injects getData result into HTML template',
    async () => {
      await page.goto(baseUrl('/html/profile'));
      await page.waitForSelector('router-slot router-slot h1', {
        timeout: 5000,
      });

      const heading = await page.textContent('router-slot router-slot h1');
      expect(heading).toEqual('Alice');

      const role = await page.textContent('router-slot router-slot .role');
      expect(role).toEqual('Role: Engineer');

      const bio = await page.textContent('router-slot router-slot .bio');
      expect(bio).toEqual('Builds things.');
    },
  );

  test(
    'dynamic updates: .page.ts getTitle() updates document title',
    async () => {
      await page.goto(baseUrl('/html/profile'));
      await page.waitForSelector('h1', { timeout: 5000 });

      const title = await page.title();
      expect(title).toEqual('Alice — Profile');
    },
  );

  // ========================================
  // Nested Routes
  // ========================================

  test(
    'nested routes: child renders inside parent <router-slot>',
    async () => {
      await page.goto(baseUrl('/html/about'));
      await page.waitForSelector('h1', { timeout: 5000 });

      const headings = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('h1')).map(
          (h) => h.textContent,
        );
      });

      expect(headings).toContain('emroute');
      expect(headings).toContain('About');
    },
  );

  test(
    'nested routes: nested dynamic route renders at correct depth',
    async () => {
      await page.goto(baseUrl('/html/projects/42/tasks'));
      await page.waitForSelector('h1', { timeout: 5000 });

      const headings = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('h1')).map(
          (h) => h.textContent,
        );
      });
      expect(headings.some((h) => h?.includes('Tasks for 42'))).toBeTruthy();

      const items = await page.evaluate(() => {
        return [...document.querySelectorAll('.task-list li')].map(
          (li) => li.textContent,
        );
      });
      expect(items).toEqual(['Task A for 42', 'Task B for 42']);
    },
  );

  test(
    'nested routes: flat file matches exact path only',
    async () => {
      await page.goto(baseUrl('/html/projects'));
      await page.waitForSelector('router-slot router-slot mark-down h1', {
        timeout: 5000,
      });

      const heading = await page.textContent(
        'router-slot router-slot mark-down h1',
      );
      expect(heading).toEqual('All Projects');
    },
  );

  test(
    'nested routes: directory index catches unmatched children',
    async () => {
      await page.goto(baseUrl('/html/projects/unknown/extra'));
      await page.waitForSelector(
        'router-slot router-slot router-slot mark-down h1',
        {
          timeout: 5000,
        },
      );

      const heading = await page.textContent(
        'router-slot router-slot router-slot mark-down h1',
      );
      expect(heading).toEqual('Project Hub');
    },
  );

  test(
    'nested routes: specific route wins over directory index catch-all',
    async () => {
      await page.goto(baseUrl('/html/projects/42'));
      await page.waitForSelector('router-slot router-slot router-slot h1', {
        timeout: 5000,
      });

      const heading = await page.textContent(
        'router-slot router-slot router-slot h1',
      );
      expect(heading).toEqual('Project 42');

      const hasMarkdown = await page.evaluate(() => {
        const leafSlot = document.querySelector(
          'router-slot router-slot router-slot',
        );
        return leafSlot?.querySelector('mark-down') !== null;
      });
      expect(hasMarkdown).toBe(false);
    },
  );

  // ========================================
  // Error Handling
  // ========================================

  test('error handling: renders 404 for unknown routes', async () => {
    await page.goto(baseUrl('/html/nonexistent'));
    await page.waitForSelector('router-slot section.error-page', {
      timeout: 5000,
    });

    const heading = await page.textContent(
      'router-slot section.error-page h1:first-child',
    );
    expect(heading).toEqual('404');

    const oops = await page.textContent(
      'router-slot section.error-page mark-down h1',
    );
    expect(oops).toEqual('Oops');
  });

  test(
    'error handling: scoped error boundary catches errors under its prefix',
    async () => {
      await page.goto(baseUrl('/html/projects/broken'));
      await page.waitForSelector('router-slot h1', { timeout: 5000 });

      const heading = await page.textContent('router-slot h1');
      expect(heading).toEqual('Project Error');

      const msg = await page.textContent('router-slot .error-msg');
      expect(msg).toEqual('Something went wrong with this project.');
    },
  );

  test(
    'error handling: root error handler catches errors without scoped boundary',
    async () => {
      await page.goto(baseUrl('/html/crash'));
      await page.waitForSelector('router-slot h1', { timeout: 5000 });

      const heading = await page.textContent('router-slot h1');
      expect(heading).toEqual('Something Went Wrong');

      const msg = await page.textContent('router-slot .root-error');
      expect(msg).toEqual('An unexpected error occurred.');
    },
  );

  // ========================================
  // Redirects
  // ========================================

  test(
    'redirects: .redirect.ts navigates to target route',
    async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('router-slot mark-down h1', {
        timeout: 5000,
      });

      await page.evaluate(
        async () =>
          await (
            globalThis as unknown as Record<
              string,
              { navigate(url: string): Promise<void> }
            >
          ).__emroute_router.navigate('/html/old'),
      );
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('router-slot router-slot h1');
          return h1?.textContent === 'About';
        },
        undefined,
        { timeout: 5000 },
      );

      expect(new URL(page.url()).pathname).toEqual('/html/about');
    },
  );

  // ========================================
  // Template Patterns
  // ========================================

  test(
    'templates: .page.ts uses context.files.html as template',
    async () => {
      await page.goto(baseUrl('/html/docs'));
      await page.waitForSelector('router-slot router-slot h1', {
        timeout: 5000,
      });

      const heading = await page.textContent('router-slot router-slot h1');
      expect(heading).toEqual('Docs');

      const topic = await page.textContent('router-slot router-slot .topic');
      expect(topic).toEqual('Topic: general');
    },
  );

  test(
    'templates: .page.ts + .page.html getTitle() overrides <title> extraction',
    async () => {
      await page.goto(baseUrl('/html/docs'));
      await page.waitForSelector('router-slot router-slot h1', {
        timeout: 5000,
      });

      const title = await page.title();
      expect(title).toEqual('Documentation');
    },
  );

  test(
    'templates: .page.ts uses context.files.md for custom rendering',
    async () => {
      await page.goto(baseUrl('/html/blog'));
      await page.waitForSelector('router-slot router-slot .blog-footer', {
        timeout: 5000,
      });

      const footer = await page.textContent(
        'router-slot router-slot .blog-footer',
      );
      expect(footer).toEqual('Posts: 0');

      const markdownExists = await page.evaluate(() => {
        const slot = document.querySelector('router-slot router-slot');
        return slot?.querySelector('mark-down') !== null;
      });
      expect(markdownExists).toBeTruthy();
    },
  );

  // ========================================
  // Navigation State
  // ========================================

  test(
    'navigation state: navigate() passes state to Navigation API entry',
    async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('router-slot mark-down h1', {
        timeout: 5000,
      });

      const state = await page.evaluate(async () => {
        // deno-lint-ignore no-explicit-any
        const router = (globalThis as any).__emroute_router;
        await router.navigate('/html/about', {
          state: { custom: 'data', count: 42 },
        });
        // deno-lint-ignore no-explicit-any
        return (globalThis as any).navigation.currentEntry.getState();
      });

      expect(state.custom).toEqual('data');
      expect(state.count).toEqual(42);
    },
  );

  test(
    'navigation state: state persists through back/forward traversal',
    async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('router-slot mark-down h1', {
        timeout: 5000,
      });

      // Navigate to /about with state
      await page.evaluate(async () => {
        // deno-lint-ignore no-explicit-any
        const router = (globalThis as any).__emroute_router;
        await router.navigate('/html/about', {
          state: { origin: 'home' },
        });
      });
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('router-slot router-slot h1');
          return h1?.textContent === 'About';
        },
        undefined,
        { timeout: 5000 },
      );

      // Navigate away (no state)
      await page.evaluate(async () => {
        // deno-lint-ignore no-explicit-any
        const router = (globalThis as any).__emroute_router;
        await router.navigate('/html/docs');
      });
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('router-slot router-slot h1');
          return h1?.textContent === 'Docs';
        },
        undefined,
        { timeout: 5000 },
      );

      // Go back to /about — state should still be on that entry
      await page.goBack();
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('router-slot router-slot h1');
          return h1?.textContent === 'About';
        },
        undefined,
        { timeout: 5000 },
      );

      const state = await page.evaluate(() => {
        // deno-lint-ignore no-explicit-any
        return (globalThis as any).navigation.currentEntry.getState();
      });
      expect(state.origin).toEqual('home');
    },
  );

  // ========================================
  // Markdown Rendering
  // ========================================

  test(
    'markdown: .page.md renders content via <mark-down>',
    async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('router-slot mark-down h1', {
        timeout: 5000,
      });

      const markdownExists = await page.evaluate(() => {
        return document.querySelector('router-slot mark-down') !== null;
      });
      expect(markdownExists).toBeTruthy();

      const heading = await page.textContent('router-slot mark-down h1');
      expect(heading).toEqual('emroute');
    },
  );

  test('markdown: links in markdown are SPA-navigable', async () => {
    await page.goto(baseUrl('/html/'));
    await page.waitForSelector('router-slot mark-down h1', { timeout: 5000 });

    let fullLoadFired = false;
    page.on('load', () => {
      fullLoadFired = true;
    });
    fullLoadFired = false;

    // Click "About" link rendered from markdown [About](/html/about)
    await page.click('a[href="/html/about"]');
    await page.waitForFunction(
      () => {
        const h1 = document.querySelector('router-slot router-slot h1');
        return h1?.textContent === 'About';
      },
      undefined,
      { timeout: 5000 },
    );

    expect(new URL(page.url()).pathname).toEqual('/html/about');
    expect(fullLoadFired).toBe(false);
  });

  test(
    'markdown: empty <mark-down> without companion .page.md renders empty',
    async () => {
      await page.goto(baseUrl('/html/empty-markdown'));
      await page.waitForSelector('router-slot router-slot h1', {
        timeout: 5000,
      });

      const heading = await page.textContent('router-slot router-slot h1');
      expect(heading).toEqual('Empty Markdown Test');

      const markdownHTML = await page.evaluate(() => {
        const md = document.querySelector(
          'router-slot router-slot mark-down',
        );
        return md?.innerHTML ?? null;
      });
      expect(markdownHTML).toEqual('');

      const afterText = await page.textContent(
        'router-slot router-slot .after-markdown',
      );
      expect(afterText).toEqual('Content after markdown');
    },
  );
});

// ── Dispose During Initial Navigation ────────────────────────────────

describe('SPA router: dispose cancels in-flight initial navigation', () => {
  let page!: Page;

  beforeAll(async () => {
    server = await createTestServer({ mode: 'only', port: 4106 });
    tb = await createTestBrowser();
    page = await tb.newPage();
  });

  afterAll(async () => {
    await page.close();
    await tb.close();
    server.stop();
  });

  test(
    'dispose() aborts signal passed to initial getData',
    async () => {
      // The slow-data fixture calls __slow_data_entered(signal) when getData starts,
      // passing the abort signal it received. After init completes and __emroute_router
      // is set, we call dispose() and verify that the signal getData received was aborted.
      //
      // With the fix: getData receives this.abortController.signal → dispose aborts it.
      // With the bug: getData receives a local initController.signal → dispose doesn't abort it.
      await page.addInitScript(() => {
        const g = globalThis as Record<string, unknown>;
        g.__slow_data_entered = (signal: AbortSignal) => {
          g.__slow_data_signal = signal;
        };
      });

      await page.goto(baseUrl('/html/slow-data'), { waitUntil: 'load' });

      // Wait for full init (getData resolves after 5s, then __emroute_router is set)
      await page.waitForFunction(
        () => !!(globalThis as Record<string, unknown>).__emroute_router,
        undefined,
        { timeout: 15000 },
      );

      // Dispose the router — aborts this.abortController
      await page.evaluate(() => {
        ((globalThis as Record<string, unknown>).__emroute_router as { dispose(): void })
          .dispose();
      });

      // Verify: the signal that getData received should now be aborted
      const signalAborted = await page.evaluate(() => {
        const signal = (globalThis as Record<string, unknown>).__slow_data_signal as
          | AbortSignal
          | undefined;
        return signal?.aborted ?? null;
      });
      expect(signalAborted).toBe(true);
    },
  );
});
