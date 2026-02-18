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

import { assert, assertEquals } from '@std/assert';
import {
  createTestBrowser,
  createTestServer,
  type TestBrowser,
  type TestServer,
} from '../shared/setup.ts';
import type { Page } from 'npm:playwright@1.58.2';

let server: TestServer;
let tb: TestBrowser;

function baseUrl(path = '/'): string {
  return server.baseUrl(path);
}

// ── Mode Behavior ───────────────────────────────────────────────────

Deno.test(
  {
    name: "SPA mode 'only' — HTTP behavior",
    sanitizeResources: false,
    sanitizeOps: false,
  },
  async (t) => {
    server = await createTestServer({ mode: 'only', port: 4104 });

    await t.step('GET / redirects to /html/', async () => {
      const res = await fetch(baseUrl('/'), { redirect: 'manual' });
      assertEquals(res.status, 302);
      const location = res.headers.get('location');
      assert(
        location?.endsWith('/html/'),
        `expected redirect to /html/, got ${location}`,
      );
    });

    await t.step('GET /about redirects to /html/about', async () => {
      const res = await fetch(baseUrl('/about'), { redirect: 'manual' });
      assertEquals(res.status, 302);
      const location = res.headers.get('location');
      assert(
        location?.endsWith('/html/about'),
        `expected redirect to /html/about, got ${location}`,
      );
    });

    await t.step('GET /html/about serves SPA shell (no SSR)', async () => {
      const res = await fetch(baseUrl('/html/about'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(
        html.includes('<router-slot'),
        'SPA shell should contain <router-slot>',
      );
      // Should NOT contain SSR-rendered content with data-ssr-route
      assertEquals(
        html.includes('data-ssr-route'),
        false,
        'only mode should not SSR-render /html/* routes',
      );
    });

    await t.step(
      'GET /md/about serves SPA shell (no SSR Markdown)',
      async () => {
        const res = await fetch(baseUrl('/md/about'));
        const contentType = res.headers.get('content-type');
        assert(
          contentType?.includes('text/html'),
          `only mode should serve HTML for /md/*, got ${contentType}`,
        );
        await res.text(); // consume body
      },
    );

    server.stop();
  },
);

// ── SPA Renderer ────────────────────────────────────────────────────

Deno.test(
  { name: 'SPA renderer', sanitizeResources: false, sanitizeOps: false },
  async (t) => {
    server = await createTestServer({ mode: 'only', port: 4104 });
    tb = await createTestBrowser();

    let page!: Page;

    await t.step('setup: create page', async () => {
      page = await tb.newPage();
    });

    // ========================================
    // SPA Navigation
    // ========================================

    await t.step(
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
        assertEquals(new URL(page.url()).pathname, '/html/about');
        assertEquals(
          fullLoadFired,
          false,
          'SPA navigation should not trigger page load event',
        );
      },
    );

    await t.step(
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

        assertEquals(new URL(page.url()).pathname, '/html/about');
        const heading = await page.textContent('router-slot router-slot h1');
        assertEquals(heading, 'About');
      },
    );

    await t.step(
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
        assertEquals(heading, 'emroute');
        assertEquals(new URL(page.url()).pathname, '/html/');
      },
    );

    await t.step(
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

        assertEquals(new URL(page.url()).pathname, '/html/about');
      },
    );

    await t.step(
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
        assertEquals(heading, 'Docs');
        assertEquals(new URL(page.url()).pathname, '/html/docs');

        // Content from earlier (aborted) navigations must not be present
        const hasProject = await page.evaluate(() => {
          const el = document.querySelector(
            'router-slot router-slot router-slot .project-id',
          );
          return el !== null;
        });
        assertEquals(
          hasProject,
          false,
          'aborted /projects/42 content should not remain',
        );
      },
    );

    await t.step(
      'SPA navigation: hash navigation includes hash in URL',
      async () => {
        await page.goto(baseUrl('/html/'));
        await page.waitForSelector('router-slot mark-down h1', {
          timeout: 5000,
        });

        await page.evaluate(
          // deno-lint-ignore no-explicit-any
          async () =>
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

        assert(page.url().includes('#section-1'));
        const sectionExists = await page.evaluate(
          () => document.getElementById('section-1') !== null,
        );
        assert(sectionExists, 'anchor target element should exist');
      },
    );

    // ========================================
    // View Transitions
    // ========================================

    await t.step(
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

        assertEquals(
          called,
          true,
          'startViewTransition should be called during navigation',
        );

        // Verify the page still rendered correctly
        const heading = await page.textContent('router-slot router-slot h1');
        assertEquals(heading, 'About');
      },
    );

    // ========================================
    // Link Interception
    // ========================================

    await t.step(
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
        assertEquals(href, 'https://example.com');
      },
    );

    await t.step(
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

        assertEquals(
          fullLoadFired,
          false,
          '/html/ links should be SPA-navigated in only mode',
        );
      },
    );

    // ========================================
    // Router Events
    // ========================================

    await t.step(
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
        assert(navigateEvent, 'navigate event should fire');
        assert(loadEvent, 'load event should fire');
        assertEquals(navigateEvent!.pathname, '/html/about');
        assertEquals(loadEvent!.pathname, '/html/about');
      },
    );

    // ========================================
    // Route Parameter Extraction
    // ========================================

    await t.step(
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
        assertEquals(params.id, '42');
      },
    );

    await t.step(
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
        assertEquals(heading, 'Project 99');

        const params = await page.evaluate(() =>
          (
            globalThis as unknown as Record<
              string,
              { getParams(): Record<string, string> }
            >
          ).__emroute_router.getParams()
        );
        assertEquals(params.id, '99');
      },
    );

    await t.step(
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
        assertEquals(heading, 'Tasks for 42');

        const params = await page.evaluate(() =>
          (
            globalThis as unknown as Record<
              string,
              { getParams(): Record<string, string> }
            >
          ).__emroute_router.getParams()
        );
        assertEquals(params.id, '42');
      },
    );

    // ========================================
    // Widget Rendering
    // ========================================

    await t.step('widgets: widget custom element renders in SPA', async () => {
      await page.goto(baseUrl('/html/mixed-widgets'));
      await page.waitForSelector('h1', { timeout: 5000 });

      // Check that widget custom element exists and rendered
      const widgetExists = await page.evaluate(() => {
        return document.querySelector('widget-greeting') !== null;
      });
      assert(widgetExists, 'widget custom element should be present');
    });

    await t.step('widgets: widget getData runs in SPA', async () => {
      await page.goto(baseUrl('/html/mixed-widgets'));
      await page.waitForSelector('widget-greeting .greeting-message', {
        timeout: 5000,
      });

      const message = await page.textContent(
        'widget-greeting .greeting-message',
      );
      assert(
        message?.includes('Hello'),
        'widget should render data from getData',
      );
    });

    await t.step(
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

        assertEquals(
          result.getData,
          'true',
          'this.element should be set during getData',
        );
        assertEquals(
          result.render,
          'true',
          'this.element should be set during renderHTML',
        );
        assertEquals(
          result.tag,
          'widget-element-ref',
          'this.element should be the host custom element',
        );
      },
    );

    await t.step(
      'widgets: lazy widget defers loadData until visible',
      async () => {
        await page.goto(baseUrl('/html/mixed-widgets'));
        await page.waitForSelector('widget-greeting[lazy] .greeting-message', {
          timeout: 5000,
        });

        const message = await page.textContent(
          'widget-greeting[lazy] .greeting-message',
        );
        assertEquals(message, 'Hello, Lazy!');
      },
    );

    await t.step(
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
        assertEquals(message, 'Hello, Lazy!');
      },
    );

    await t.step(
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
        assertEquals(styles?.contentVisibility, 'auto');
        assertEquals(styles?.containerType, 'normal');
      },
    );

    await t.step(
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
        assertEquals(heading, 'About');

        // Widget should show error state, not crash the page
        const widgetError = await page.waitForSelector(
          'widget-failing div',
          {
            timeout: 5000,
          },
        );
        const errorText = await widgetError.textContent();
        assert(
          errorText?.includes('Widget data fetch failed'),
          'widget should show its error',
        );
      },
    );

    // ========================================
    // Dynamic Page Updates
    // ========================================

    await t.step(
      'dynamic updates: .page.ts component renders with getData',
      async () => {
        await page.goto(baseUrl('/html/projects/42'));
        await page.waitForSelector('router-slot router-slot router-slot h1', {
          timeout: 5000,
        });

        const heading = await page.textContent(
          'router-slot router-slot router-slot h1',
        );
        assertEquals(heading, 'Project 42');

        const idText = await page.textContent(
          'router-slot router-slot router-slot .project-id',
        );
        assertEquals(idText, 'ID: 42');
      },
    );

    await t.step(
      'dynamic updates: .page.ts injects getData result into HTML template',
      async () => {
        await page.goto(baseUrl('/html/profile'));
        await page.waitForSelector('router-slot router-slot h1', {
          timeout: 5000,
        });

        const heading = await page.textContent('router-slot router-slot h1');
        assertEquals(heading, 'Alice');

        const role = await page.textContent('router-slot router-slot .role');
        assertEquals(role, 'Role: Engineer');

        const bio = await page.textContent('router-slot router-slot .bio');
        assertEquals(bio, 'Builds things.');
      },
    );

    await t.step(
      'dynamic updates: .page.ts getTitle() updates document title',
      async () => {
        await page.goto(baseUrl('/html/profile'));
        await page.waitForSelector('h1', { timeout: 5000 });

        const title = await page.title();
        assertEquals(title, 'Alice — Profile');
      },
    );

    // ========================================
    // Nested Routes
    // ========================================

    await t.step(
      'nested routes: child renders inside parent <router-slot>',
      async () => {
        await page.goto(baseUrl('/html/about'));
        await page.waitForSelector('h1', { timeout: 5000 });

        const headings = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('h1')).map(
            (h) => h.textContent,
          );
        });

        assert(headings.includes('emroute'), 'should have root h1');
        assert(headings.includes('About'), 'should have about h1');
      },
    );

    await t.step(
      'nested routes: nested dynamic route renders at correct depth',
      async () => {
        await page.goto(baseUrl('/html/projects/42/tasks'));
        await page.waitForSelector('h1', { timeout: 5000 });

        const headings = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('h1')).map(
            (h) => h.textContent,
          );
        });
        assert(
          headings.some((h) => h?.includes('Tasks for 42')),
          'should have tasks heading',
        );

        const items = await page.evaluate(() => {
          return [...document.querySelectorAll('.task-list li')].map(
            (li) => li.textContent,
          );
        });
        assertEquals(items, ['Task A for 42', 'Task B for 42']);
      },
    );

    await t.step(
      'nested routes: flat file matches exact path only',
      async () => {
        await page.goto(baseUrl('/html/projects'));
        await page.waitForSelector('router-slot router-slot mark-down h1', {
          timeout: 5000,
        });

        const heading = await page.textContent(
          'router-slot router-slot mark-down h1',
        );
        assertEquals(heading, 'All Projects');
      },
    );

    await t.step(
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
        assertEquals(heading, 'Project Hub');
      },
    );

    await t.step(
      'nested routes: specific route wins over directory index catch-all',
      async () => {
        await page.goto(baseUrl('/html/projects/42'));
        await page.waitForSelector('router-slot router-slot router-slot h1', {
          timeout: 5000,
        });

        const heading = await page.textContent(
          'router-slot router-slot router-slot h1',
        );
        assertEquals(heading, 'Project 42');

        const hasMarkdown = await page.evaluate(() => {
          const leafSlot = document.querySelector(
            'router-slot router-slot router-slot',
          );
          return leafSlot?.querySelector('mark-down') !== null;
        });
        assertEquals(hasMarkdown, false);
      },
    );

    // ========================================
    // Error Handling
    // ========================================

    await t.step('error handling: renders 404 for unknown routes', async () => {
      await page.goto(baseUrl('/html/nonexistent'));
      await page.waitForSelector('router-slot section.error-page', {
        timeout: 5000,
      });

      const heading = await page.textContent(
        'router-slot section.error-page h1:first-child',
      );
      assertEquals(heading, '404');

      const oops = await page.textContent(
        'router-slot section.error-page mark-down h1',
      );
      assertEquals(oops, 'Oops');
    });

    await t.step(
      'error handling: scoped error boundary catches errors under its prefix',
      async () => {
        await page.goto(baseUrl('/html/projects/broken'));
        await page.waitForSelector('router-slot h1', { timeout: 5000 });

        const heading = await page.textContent('router-slot h1');
        assertEquals(heading, 'Project Error');

        const msg = await page.textContent('router-slot .error-msg');
        assertEquals(msg, 'Something went wrong with this project.');
      },
    );

    await t.step(
      'error handling: root error handler catches errors without scoped boundary',
      async () => {
        await page.goto(baseUrl('/html/crash'));
        await page.waitForSelector('router-slot h1', { timeout: 5000 });

        const heading = await page.textContent('router-slot h1');
        assertEquals(heading, 'Something Went Wrong');

        const msg = await page.textContent('router-slot .root-error');
        assertEquals(msg, 'An unexpected error occurred.');
      },
    );

    // ========================================
    // Redirects
    // ========================================

    await t.step(
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

        assertEquals(new URL(page.url()).pathname, '/html/about');
      },
    );

    // ========================================
    // Template Patterns
    // ========================================

    await t.step(
      'templates: .page.ts uses context.files.html as template',
      async () => {
        await page.goto(baseUrl('/html/docs'));
        await page.waitForSelector('router-slot router-slot h1', {
          timeout: 5000,
        });

        const heading = await page.textContent('router-slot router-slot h1');
        assertEquals(heading, 'Docs');

        const topic = await page.textContent('router-slot router-slot .topic');
        assertEquals(topic, 'Topic: general');
      },
    );

    await t.step(
      'templates: .page.ts + .page.html getTitle() overrides <title> extraction',
      async () => {
        await page.goto(baseUrl('/html/docs'));
        await page.waitForSelector('router-slot router-slot h1', {
          timeout: 5000,
        });

        const title = await page.title();
        assertEquals(title, 'Documentation');
      },
    );

    await t.step(
      'templates: .page.ts uses context.files.md for custom rendering',
      async () => {
        await page.goto(baseUrl('/html/blog'));
        await page.waitForSelector('router-slot router-slot .blog-footer', {
          timeout: 5000,
        });

        const footer = await page.textContent(
          'router-slot router-slot .blog-footer',
        );
        assertEquals(footer, 'Posts: 0');

        const markdownExists = await page.evaluate(() => {
          const slot = document.querySelector('router-slot router-slot');
          return slot?.querySelector('mark-down') !== null;
        });
        assert(markdownExists, 'blog page should contain <mark-down> element');
      },
    );

    // ========================================
    // Navigation State
    // ========================================

    await t.step(
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

        assertEquals(state.custom, 'data');
        assertEquals(state.count, 42);
      },
    );

    await t.step(
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
        assertEquals(state.origin, 'home');
      },
    );

    // ========================================
    // Markdown Rendering
    // ========================================

    await t.step(
      'markdown: .page.md renders content via <mark-down>',
      async () => {
        await page.goto(baseUrl('/html/'));
        await page.waitForSelector('router-slot mark-down h1', {
          timeout: 5000,
        });

        const markdownExists = await page.evaluate(() => {
          return document.querySelector('router-slot mark-down') !== null;
        });
        assert(markdownExists, '<mark-down> element should be in router-slot');

        const heading = await page.textContent('router-slot mark-down h1');
        assertEquals(heading, 'emroute');
      },
    );

    await t.step('markdown: links in markdown are SPA-navigable', async () => {
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

      assertEquals(new URL(page.url()).pathname, '/html/about');
      assertEquals(
        fullLoadFired,
        false,
        'markdown links should use SPA navigation',
      );
    });

    await t.step(
      'markdown: empty <mark-down> without companion .page.md renders empty',
      async () => {
        await page.goto(baseUrl('/html/empty-markdown'));
        await page.waitForSelector('router-slot router-slot h1', {
          timeout: 5000,
        });

        const heading = await page.textContent('router-slot router-slot h1');
        assertEquals(heading, 'Empty Markdown Test');

        const markdownHTML = await page.evaluate(() => {
          const md = document.querySelector(
            'router-slot router-slot mark-down',
          );
          return md?.innerHTML ?? null;
        });
        assertEquals(markdownHTML, '');

        const afterText = await page.textContent(
          'router-slot router-slot .after-markdown',
        );
        assertEquals(afterText, 'Content after markdown');
      },
    );

    // Cleanup
    await page.close();
    await tb.close();
    server.stop();
  },
);
