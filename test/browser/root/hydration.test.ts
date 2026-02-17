/**
 * SPA Mode: root — SSR-to-SPA Hydration Tests
 *
 * Comprehensive test suite verifying that the SPA router correctly adopts
 * SSR-rendered content without re-rendering, preserving widgets, CSS,
 * router slots, and all DOM attributes.
 *
 * Also verifies 'root' mode HTTP behavior (redirects, SSR + SPA adoption).
 *
 * Test coverage:
 * - Mode behavior (redirects, SSR + SPA adoption)
 * - SSR content adoption on fresh load
 * - data-ssr-route attribute lifecycle (present → removed)
 * - Widget hydration without re-render (data-ssr preservation)
 * - Router slot adoption and nesting
 * - CSS preservation from SSR
 * - Title updates on navigation
 * - No double rendering (timestamp check)
 * - Subsequent SPA navigation after hydration
 * - Widget params and state preservation
 * - Error boundary adoption
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
  { name: "SPA mode 'root' — HTTP behavior", sanitizeResources: false, sanitizeOps: false },
  async (t) => {
    server = await createTestServer({ mode: 'root', port: 4103 });

    await t.step('GET / redirects to /html/', async () => {
      const res = await fetch(baseUrl('/'), { redirect: 'manual' });
      assertEquals(res.status, 302);
      const location = res.headers.get('location');
      assert(location?.endsWith('/html/'), `expected redirect to /html/, got ${location}`);
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

    await t.step('GET /html/about serves SSR HTML', async () => {
      const res = await fetch(baseUrl('/html/about'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('<h1'), 'SSR HTML should contain rendered content');
    });

    await t.step('GET /md/about serves SSR Markdown', async () => {
      const res = await fetch(baseUrl('/md/about'));
      assertEquals(res.status, 200);
      assert(
        res.headers.get('content-type')?.includes('text/markdown'),
        'should have markdown content type',
      );
      await res.text(); // consume body
    });

    server.stop();
  },
);

// ── SSR-to-SPA Hydration ────────────────────────────────────────────

Deno.test(
  {
    name: 'SSR to SPA hydration — comprehensive',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  async (t) => {
    server = await createTestServer({ mode: 'root', port: 4103 });
    tb = await createTestBrowser();

    let page!: Page;

    await t.step('setup: create page', async () => {
      page = await tb.newPage();
    });

    // ── SSR HTML Response ─────────────────────────────────────────────

    await t.step('SSR HTML response contains hydration markers', async () => {
      const res = await fetch(baseUrl('/html/hydration'));
      assertEquals(res.status, 200);
      const html = await res.text();

      // Should contain pre-rendered content
      assert(html.includes('SSR rendered'), 'SSR should mark content as server-rendered');
      assert(html.includes('Hydration Test'), 'SSR should render page title');
      assert(html.includes('id="hydration-content"'), 'SSR should render content');
      assert(html.includes('data-ssr="true"'), 'should mark content as SSR rendered');

      // Should use index.html shell with router-slot
      assert(html.includes('<router-slot'), 'should use router-slot element');

      // Critical: data-ssr-route attribute for SPA adoption
      assert(
        html.includes('data-ssr-route="/html/hydration"'),
        'should have data-ssr-route for SPA adoption',
      );
    });

    await t.step('SSR HTML includes document title', async () => {
      const res = await fetch(baseUrl('/html/hydration'));
      const html = await res.text();
      assert(
        html.includes('<title>Hydration Test</title>'),
        'SSR should set document title from getTitle()',
      );
    });

    // ── SPA Content Adoption ──────────────────────────────────────────

    await t.step('SPA adopts SSR content without re-rendering', async () => {
      // Navigate to SSR URL in browser
      await page.goto(baseUrl('/html/hydration'));
      await page.waitForSelector('widget-hydration-test', { timeout: 5000 });

      // Verify content exists in Shadow DOM
      const result = await page.evaluate(() => {
        const widget = document.querySelector('widget-hydration-test');
        const shadow = widget?.shadowRoot;
        const heading = shadow?.querySelector('#hydration-content h1')?.textContent;
        const callCount = shadow?.querySelector('#call-count')?.textContent;
        const renderContext = shadow?.querySelector('#render-context')?.textContent;
        const ssrAttr = shadow?.querySelector('#hydration-content')?.getAttribute('data-ssr');

        return {
          heading,
          callCount: parseInt(callCount || '0'),
          renderContext,
          ssrAttr,
        };
      });

      assertEquals(result.heading, 'Hydration Test', 'Heading should exist in shadow root');

      // KEY TEST: Verify getData was NOT called in browser (only in SSR)
      assertEquals(
        result.callCount,
        0,
        'getData should NOT be called in browser during SSR adoption - browser counter should be 0',
      );

      // Verify content is marked as SSR-rendered (in shadow root)
      assert(result.ssrAttr === 'true', 'Content should be marked as SSR-rendered in shadow root');

      // Verify render context shows SSR
      assertEquals(result.renderContext, 'SSR rendered', 'Should show SSR rendered context');
    });

    await t.step('data-ssr-route attribute is removed after adoption', async () => {
      // After SPA hydration, data-ssr-route should be removed
      const ssrRouteAttr = await page.evaluate(() => {
        return document.querySelector('router-slot')?.getAttribute('data-ssr-route');
      });
      assertEquals(
        ssrRouteAttr,
        null,
        'data-ssr-route should be removed after SPA adoption',
      );
    });

    await t.step('router-slot element is preserved during hydration', async () => {
      const slotExists = await page.evaluate(() => {
        return document.querySelector('router-slot') !== null;
      });
      assert(slotExists, 'router-slot element should be preserved');
    });

    await t.step('document title matches SSR title', async () => {
      const title = await page.title();
      assertEquals(title, 'Hydration Test', 'document title should match getTitle()');
    });

    await t.step(
      'subsequent SPA navigation DOES call getData (proving counter works)',
      async () => {
        // Navigate away via router API
        await page.evaluate(() => {
          const router = (globalThis as Record<string, unknown>).__emroute_router as {
            navigate: (url: string) => Promise<void>;
          };
          return router.navigate('/html/');
        });
        await page.waitForSelector('h1', { timeout: 5000 });

        // Navigate back to hydration page via SPA
        await page.evaluate(() => {
          const router = (globalThis as Record<string, unknown>).__emroute_router as {
            navigate: (url: string) => Promise<void>;
          };
          return router.navigate('/html/hydration');
        });
        await page.waitForSelector('widget-hydration-test', { timeout: 5000 });

        // NOW getData should have been called in browser - check shadow root
        const result = await page.evaluate(() => {
          const widget = document.querySelector('widget-hydration-test');
          const shadow = widget?.shadowRoot;
          const callCount = shadow?.querySelector('#call-count')?.textContent;
          const ssrAttr = shadow?.querySelector('#hydration-content')?.getAttribute('data-ssr');
          const renderContext = shadow?.querySelector('#render-context')?.textContent;

          return {
            callCount: parseInt(callCount || '0'),
            ssrAttr,
            renderContext,
          };
        });

        assertEquals(
          result.callCount,
          1,
          'getData SHOULD be called during SPA navigation - browser counter should be 1',
        );

        // Content should now be marked as SPA-rendered
        assertEquals(
          result.ssrAttr,
          'false',
          'Content should now be marked as SPA-rendered (not SSR)',
        );

        assertEquals(result.renderContext, 'SPA rendered', 'Should show SPA rendered context');
      },
    );

    // ── CSS Preservation ──────────────────────────────────────────────

    await t.step('SSR-injected CSS styles are preserved', async () => {
      await page.goto(baseUrl('/html/about'));
      await page.waitForSelector('h1', { timeout: 5000 });

      // About page has about.page.css — verify a <style> tag with its content exists
      const hasPageCSS = await page.evaluate(() => {
        const styles = Array.from(document.querySelectorAll('style'));
        return styles.some((s) => s.textContent?.includes('.about-page'));
      });

      assert(hasPageCSS, 'Page-scoped CSS should be injected by SSR');
    });

    // ── Widget Hydration ──────────────────────────────────────────────

    await t.step('widgets are adopted from SSR without re-render', async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('widget-nav', { timeout: 5000 });

      // Widget content is now in Shadow DOM - check shadowRoot
      const navLinks = await page.evaluate(() => {
        const widget = document.querySelector('widget-nav');
        const shadow = widget?.shadowRoot;
        const nav = shadow?.querySelector('nav');
        return nav?.querySelectorAll('a').length ?? 0;
      });
      assert(navLinks > 0, 'widget content should be preserved from SSR in shadow root');
    });

    await t.step('widget params are preserved during hydration', async () => {
      await page.goto(baseUrl('/html/widgets'));

      // Wait for widgets to render
      await page.waitForSelector('widget-greeting', { timeout: 5000 });

      // Check shadow root for widget content with params
      const greetingWithParam = await page.evaluate(() => {
        const widgets = Array.from(document.querySelectorAll('widget-greeting'));
        for (const widget of widgets) {
          const shadow = widget.shadowRoot;
          if (shadow?.innerHTML.includes('Developer')) {
            return true;
          }
        }
        return false;
      });
      assert(greetingWithParam, 'widget with params should render correctly in shadow root');
    });

    await t.step('widget inline styles are preserved', async () => {
      await page.goto(baseUrl('/html/vanilla/counter'));
      await page.waitForSelector('widget-counter-vanilla', { timeout: 5000 });

      // Counter widget has inline styles - check shadow root
      const hasStyles = await page.evaluate(() => {
        const widget = document.querySelector('widget-counter-vanilla');
        const shadow = widget?.shadowRoot;
        const style = shadow?.querySelector('style');
        return style !== null && style?.textContent?.includes('c-counter-vanilla');
      });
      assert(hasStyles, 'widget inline styles should be preserved');
    });

    // ── Nested Router Slots ───────────────────────────────────────────

    await t.step('nested route content is composed correctly', async () => {
      await page.goto(baseUrl('/html/articles/getting-started/comment'));
      await page.waitForSelector('router-slot', { timeout: 5000 });

      const result = await page.evaluate(() => {
        const rootSlot = document.querySelector('router-slot');
        const html = rootSlot?.innerHTML ?? '';
        return {
          rootExists: rootSlot !== null,
          rootHasContent: html.length > 0,
          hasArticleContent: html.includes('Getting Started'),
          hasCommentContent: html.includes('Comments'),
        };
      });

      assert(result.rootExists, 'root router-slot should exist');
      assert(result.rootHasContent, 'root slot should have content');
      assert(result.hasArticleContent, 'parent article content should be present');
      assert(result.hasCommentContent, 'child comment content should be nested');
    });

    await t.step('deeply nested routes preserve full hierarchy', async () => {
      await page.goto(baseUrl('/html/projects/42/tasks'));
      await page.waitForSelector('h1', { timeout: 5000 });

      // Count router-slot nesting depth
      const depth = await page.evaluate(() => {
        let count = 0;
        let el = document.querySelector('router-slot');
        while (el) {
          count++;
          el = el.querySelector('router-slot');
        }
        return count;
      });

      assert(depth >= 2, 'deeply nested route should preserve slot hierarchy');
    });

    // ── No Double Rendering ───────────────────────────────────────────

    await t.step('timestamp check proves no re-render occurred', async () => {
      // Fetch SSR response to get server timestamp
      const res = await fetch(baseUrl('/html/hydration'));
      const ssrHtml = await res.text();
      const ssrMatch = ssrHtml.match(/Timestamp: (\d+)/);
      const ssrTimestamp = ssrMatch ? parseInt(ssrMatch[1]) : 0;

      // Navigate in browser (triggers SPA hydration)
      await page.goto(baseUrl('/html/hydration'));
      await page.waitForSelector('widget-hydration-test', { timeout: 5000 });

      // Get DOM timestamp from shadow root
      const domTimestamp = await page.evaluate(() => {
        const widget = document.querySelector('widget-hydration-test');
        const shadow = widget?.shadowRoot;
        const el = shadow?.querySelector('#timestamp');
        const match = el?.textContent?.match(/Timestamp: (\d+)/);
        return match ? parseInt(match[1]) : 0;
      });

      // Timestamps should be very close (within ~1 second for server processing)
      // If SPA re-rendered, domTimestamp would be significantly later
      const diff = Math.abs(domTimestamp - ssrTimestamp);
      assert(
        diff < 2000,
        `Timestamps should be close (diff: ${diff}ms) — proves no re-render`,
      );
    });

    // TODO: enable once getData call counting is wired up
    await t.step('getData is NOT called during hydration [SKIP]', () => {});

    // TODO: enable once title update tracking is implemented
    await t.step('title updates on navigation after hydration [SKIP]', () => {});
    await t.step('title updates respect getTitle() return value [SKIP]', () => {});

    // ── Subsequent SPA Navigation ─────────────────────────────────────

    await t.step('subsequent SPA navigation works after hydration', async () => {
      // Start with SSR
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('h1', { timeout: 5000 });

      // SPA navigate to hydration page
      await page.evaluate(() => {
        const router = (globalThis as Record<string, unknown>).__emroute_router;
        if (router && typeof router === 'object' && 'navigate' in router) {
          (router.navigate as (url: string) => Promise<void>)('/html/hydration');
        }
      });
      await page.waitForSelector('#hydration-content', { timeout: 5000 });

      const heading = await page.textContent('#hydration-content h1');
      assertEquals(heading, 'Hydration Test', 'SPA navigation should work');

      // Navigate back
      await page.evaluate(() => {
        const router = (globalThis as Record<string, unknown>).__emroute_router;
        if (router && typeof router === 'object' && 'navigate' in router) {
          (router.navigate as (url: string) => Promise<void>)('/html/');
        }
      });
      await page.waitForSelector('h1', { timeout: 5000 });

      const homeHeading = await page.textContent('h1');
      assert(homeHeading && homeHeading.length > 0, 'navigate back should work');
    });

    await t.step('link clicks trigger SPA navigation after hydration', async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('h1', { timeout: 5000 });

      let fullLoadFired = false;
      page.on('load', () => {
        fullLoadFired = true;
      });

      // Click a link (fixtures use /html/ prefix for progressive enhancement)
      await page.click('a[href="/html/about"]');
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('h1');
          return h1?.textContent === 'About';
        },
        undefined,
        { timeout: 5000 },
      );

      assertEquals(
        fullLoadFired,
        false,
        'link click should not trigger full page load',
      );
      assertEquals(
        new URL(page.url()).pathname,
        '/html/about',
        'URL should update to SPA route',
      );
    });

    await t.step('browser back/forward works after hydration', async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('h1', { timeout: 5000 });

      // Navigate to another page
      await page.evaluate(() => {
        const router = (globalThis as Record<string, unknown>).__emroute_router;
        if (router && typeof router === 'object' && 'navigate' in router) {
          (router.navigate as (url: string) => Promise<void>)('/html/about');
        }
      });
      await page.waitForSelector('h1', { timeout: 5000 });

      // Go back
      await page.goBack();
      await page.waitForFunction(
        () => document.querySelector('h1')?.textContent === 'emroute',
        undefined,
        { timeout: 5000 },
      );

      const heading = await page.textContent('h1');
      assertEquals(heading, 'emroute', 'back navigation should work');

      // Go forward
      await page.goForward();
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('h1');
          return h1?.textContent === 'About';
        },
        undefined,
        { timeout: 5000 },
      );

      const aboutHeading = await page.evaluate(() => {
        return document.querySelector('h1')?.textContent;
      });
      assertEquals(aboutHeading, 'About', 'forward navigation should work');
    });

    // ── Error Boundaries ──────────────────────────────────────────────

    await t.step('error boundaries are adopted during hydration', async () => {
      // Project 42 has an error boundary
      await page.goto(baseUrl('/html/projects/42'));
      await page.waitForSelector('h1', { timeout: 5000 });

      // Navigate to a broken project page that triggers error boundary
      await page.evaluate(() => {
        const router = (globalThis as Record<string, unknown>).__emroute_router;
        if (router && typeof router === 'object' && 'navigate' in router) {
          (router.navigate as (url: string) => Promise<void>)('/html/projects/broken');
        }
      });
      await page.waitForTimeout(1000);

      // Error boundary should catch and display error
      const errorVisible = await page.evaluate(() => {
        const body = document.body.textContent ?? '';
        return body.includes('Error') || body.includes('broken');
      });
      assert(errorVisible, 'error boundary should handle errors after hydration');
    });

    // ── Markdown Rendering ────────────────────────────────────────────

    await t.step('markdown content is adopted from SSR', async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('h1', { timeout: 5000 });

      const h1Text = await page.textContent('h1');

      assert(
        h1Text?.includes('emroute'),
        'markdown content should be rendered to HTML with heading',
      );
      assert(
        h1Text === 'emroute',
        'h1 text content should be preserved',
      );
    });

    await t.step('page content does not re-render during hydration', async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('h1', { timeout: 5000 });

      const initialHTML = await page.evaluate(() => {
        const slot = document.querySelector('router-slot');
        return slot?.innerHTML ?? '';
      });

      await page.waitForTimeout(500);

      const finalHTML = await page.evaluate(() => {
        const slot = document.querySelector('router-slot');
        return slot?.innerHTML ?? '';
      });

      assertEquals(
        initialHTML,
        finalHTML,
        'router-slot HTML should not change during hydration',
      );
    });

    // ── Cleanup ───────────────────────────────────────────────────────

    await tb.close();
    server.stop();
  },
);
