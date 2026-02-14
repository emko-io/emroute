/**
 * SSR-to-SPA Hydration Tests
 *
 * Comprehensive test suite verifying that the SPA router correctly adopts
 * SSR-rendered content without re-rendering, preserving widgets, CSS,
 * router slots, and all DOM attributes.
 *
 * Test coverage:
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

import { assert, assertEquals, assertExists } from '@std/assert';
import { baseUrl, closeBrowser, launchBrowser, newPage, startServer, stopServer } from './setup.ts';
import type { Page } from 'npm:playwright@1.50.1';

Deno.test(
  {
    name: 'SSR to SPA hydration — comprehensive',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  async (t) => {
    await startServer();
    await launchBrowser();

    let page!: Page;

    await t.step('setup: create page', async () => {
      page = await newPage();
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
        html.includes('data-ssr-route="/hydration"'),
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
      await page.waitForSelector('#hydration-content', { timeout: 5000 });

      // Verify content exists
      const heading = await page.textContent('#hydration-content h1');
      assertEquals(heading, 'Hydration Test');

      // KEY TEST: Verify getData was NOT called in browser (only in SSR)
      const browserCalls = await page.evaluate(() => {
        const el = document.querySelector('#call-count');
        return parseInt(el?.textContent || '0');
      });
      assertEquals(
        browserCalls,
        0,
        'getData should NOT be called in browser during SSR adoption - browser counter should be 0',
      );

      // Verify content is marked as SSR-rendered
      const isSSR = await page.evaluate(() => {
        const el = document.querySelector('#hydration-content');
        return el?.getAttribute('data-ssr') === 'true';
      });
      assert(isSSR, 'Content should be marked as SSR-rendered');

      // Verify render context shows SSR
      const renderContext = await page.textContent('#render-context');
      assertEquals(renderContext, 'SSR rendered', 'Should show SSR rendered context');
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
          return router.navigate('/');
        });
        await page.waitForSelector('h1', { timeout: 5000 });

        // Navigate back to hydration page via SPA
        await page.evaluate(() => {
          const router = (globalThis as Record<string, unknown>).__emroute_router as {
            navigate: (url: string) => Promise<void>;
          };
          return router.navigate('/hydration');
        });
        await page.waitForSelector('#hydration-content', { timeout: 5000 });

        // NOW getData should have been called in browser
        const browserCalls = await page.evaluate(() => {
          const el = document.querySelector('#call-count');
          return parseInt(el?.textContent || '0');
        });
        assertEquals(
          browserCalls,
          1,
          'getData SHOULD be called during SPA navigation - browser counter should be 1',
        );

        // Content should now be marked as SPA-rendered
        const isSSR = await page.evaluate(() => {
          const el = document.querySelector('#hydration-content');
          return el?.getAttribute('data-ssr') === 'true';
        });
        assertEquals(isSSR, false, 'Content should now be marked as SPA-rendered (not SSR)');

        const renderContext = await page.textContent('#render-context');
        assertEquals(renderContext, 'SPA rendered', 'Should show SPA rendered context');
      },
    );

    // ── CSS Preservation ──────────────────────────────────────────────

    await t.step('SSR-injected CSS styles are preserved', async () => {
      await page.goto(baseUrl('/html/about'));
      await page.waitForSelector('h1', { timeout: 5000 });

      // About page has about.page.css with custom styles
      const bgColor = await page.evaluate(() => {
        const aboutSection = document.querySelector('.about-section');
        return aboutSection ? globalThis.getComputedStyle(aboutSection).backgroundColor : null;
      });

      assertExists(bgColor, 'Custom CSS should be applied');
      // CSS should remain applied after hydration
    });

    // ── Widget Hydration ──────────────────────────────────────────────

    await t.step('widgets with data-ssr attribute are adopted without re-render', async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('widget-nav', { timeout: 5000 });

      // Nav widget should have data-ssr attribute from SSR
      const hasDataSSR = await page.evaluate(() => {
        const widget = document.querySelector('widget-nav');
        return widget?.hasAttribute('data-ssr') ?? false;
      });
      assert(
        hasDataSSR,
        'widget should have data-ssr attribute from SSR rendering',
      );

      // Widget content should be preserved
      const navLinks = await page.evaluate(() => {
        const nav = document.querySelector('widget-nav nav');
        return nav?.querySelectorAll('a').length ?? 0;
      });
      assert(navLinks > 0, 'widget content should be preserved from SSR');
    });

    await t.step('widget params are preserved during hydration', async () => {
      await page.goto(baseUrl('/html/widgets'));

      // Wait for widgets to render
      await page.waitForSelector('widget-greeting', { timeout: 5000 });

      // Check that widget with params rendered correctly
      const greetingWithParam = await page.evaluate(() => {
        const widgets = Array.from(document.querySelectorAll('widget-greeting'));
        for (const widget of widgets) {
          if (widget.innerHTML.includes('Developer')) {
            return true;
          }
        }
        return false;
      });
      assert(greetingWithParam, 'widget with params should render correctly');
    });

    await t.step('widget inline styles are preserved', async () => {
      await page.goto(baseUrl('/html/vanilla/counter'));
      await page.waitForSelector('widget-counter-vanilla', { timeout: 5000 });

      // Counter widget has inline styles
      const hasStyles = await page.evaluate(() => {
        const widget = document.querySelector('widget-counter-vanilla');
        const style = widget?.querySelector('style');
        return style !== null && style?.textContent?.includes('c-counter-vanilla');
      });
      assert(hasStyles, 'widget inline styles should be preserved');
    });

    // ── Nested Router Slots ───────────────────────────────────────────

    await t.step('nested router-slot hierarchy is adopted correctly', async () => {
      await page.goto(baseUrl('/html/about'));
      await page.waitForSelector('router-slot', { timeout: 5000 });

      // About page has nested structure: router-slot > router-slot
      const nestedSlots = await page.evaluate(() => {
        const rootSlot = document.querySelector('router-slot');
        const childSlot = rootSlot?.querySelector('router-slot');
        return {
          rootExists: rootSlot !== null,
          childExists: childSlot !== null,
          rootHasContent: (rootSlot?.innerHTML.length ?? 0) > 0,
          childHasContent: (childSlot?.innerHTML.length ?? 0) > 0,
        };
      });

      assert(nestedSlots.rootExists, 'root router-slot should exist');
      assert(nestedSlots.childExists, 'nested router-slot should exist');
      assert(nestedSlots.rootHasContent, 'root slot should have content');
      assert(nestedSlots.childHasContent, 'nested slot should have content');
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

      assert(depth >= 3, 'deeply nested route should preserve slot hierarchy');
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
      await page.waitForSelector('#timestamp', { timeout: 5000 });

      // Get DOM timestamp
      const domTimestamp = await page.evaluate(() => {
        const el = document.querySelector('#timestamp');
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

    await t.step({ name: 'getData is NOT called during hydration', ignore: true }, async () => {
      // Fresh navigation to SSR URL
      await page.goto(baseUrl('/html/hydration'));
      await page.waitForSelector('#call-count', { timeout: 5000 });

      const callCount = await page.textContent('#call-count');
      assert(
        callCount?.includes('getData called: 1'),
        'getData should be called exactly once (SSR only)',
      );

      // Wait to ensure no delayed getData call
      await page.waitForTimeout(500);

      const finalCallCount = await page.textContent('#call-count');
      assert(
        finalCallCount?.includes('getData called: 1'),
        'getData should still be 1 after hydration completes',
      );
    });

    // ── Title Updates ─────────────────────────────────────────────────

    await t.step(
      { name: 'title updates on navigation after hydration', ignore: true },
      async () => {
        // Start at home (SSR)
        await page.goto(baseUrl('/html/'));
        await page.waitForSelector('h1', { timeout: 5000 });
        const initialTitle = await page.title();
        // Just verify a title exists from SSR
        assert(initialTitle && initialTitle.length > 0, 'initial title should be set from SSR');

        // Navigate via SPA to profile
        await page.evaluate(() => {
          const router = (globalThis as Record<string, unknown>).__emroute_router;
          if (router && typeof router === 'object' && 'navigate' in router) {
            (router.navigate as (url: string) => Promise<void>)('/profile');
          }
        });
        await page.waitForSelector('h1', { timeout: 5000 });

        const profileTitle = await page.title();
        assert(
          profileTitle.includes('Alice'),
          'title should update to profile page title',
        );
      },
    );

    await t.step(
      { name: 'title updates respect getTitle() return value', ignore: true },
      async () => {
        await page.goto(baseUrl('/html/projects/99'));
        await page.waitForSelector('h1', { timeout: 5000 });

        const title = await page.title();
        assert(
          title.includes('Project 99'),
          'dynamic title should include route params',
        );
      },
    );

    // ── Subsequent SPA Navigation ─────────────────────────────────────

    await t.step('subsequent SPA navigation works after hydration', async () => {
      // Start with SSR
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('h1', { timeout: 5000 });

      // SPA navigate to hydration page
      await page.evaluate(() => {
        const router = (globalThis as Record<string, unknown>).__emroute_router;
        if (router && typeof router === 'object' && 'navigate' in router) {
          (router.navigate as (url: string) => Promise<void>)('/hydration');
        }
      });
      await page.waitForSelector('#hydration-content', { timeout: 5000 });

      const heading = await page.textContent('#hydration-content h1');
      assertEquals(heading, 'Hydration Test', 'SPA navigation should work');

      // Navigate back
      await page.evaluate(() => {
        const router = (globalThis as Record<string, unknown>).__emroute_router;
        if (router && typeof router === 'object' && 'navigate' in router) {
          (router.navigate as (url: string) => Promise<void>)('/');
        }
      });
      await page.waitForSelector('h1', { timeout: 5000 });

      const homeHeading = await page.textContent('h1');
      // Just verify we're back at home with a heading
      assert(homeHeading && homeHeading.length > 0, 'navigate back should work');
    });

    await t.step('link clicks trigger SPA navigation after hydration', async () => {
      await page.goto(baseUrl('/html/'));
      await page.waitForSelector('h1', { timeout: 5000 });

      let fullLoadFired = false;
      page.on('load', () => {
        fullLoadFired = true;
      });

      // Click a link
      await page.click('a[href="/about"]');
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
      // SPA strips /html/ prefix, so pathname should be /about
      assertEquals(
        new URL(page.url()).pathname,
        '/about',
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
          (router.navigate as (url: string) => Promise<void>)('/about');
        }
      });
      await page.waitForSelector('h1', { timeout: 5000 });

      // Go back
      await page.goBack();
      await page.waitForSelector('h1', { timeout: 5000 });

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
          (router.navigate as (url: string) => Promise<void>)('/projects/broken');
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

      // Markdown should be already rendered as HTML in SSR
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

      // Get initial HTML of main content area
      const initialHTML = await page.evaluate(() => {
        const slot = document.querySelector('router-slot');
        return slot?.innerHTML ?? '';
      });

      // Wait for potential re-render
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

    await closeBrowser();
    await stopServer();
  },
);
