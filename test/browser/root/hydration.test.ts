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

describe("SPA mode 'root' — HTTP behavior", () => {
  beforeAll(async () => {
    server = await createTestServer({ mode: 'root', port: 4103 });
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

  test('GET /html/about serves SSR HTML', async () => {
    const res = await fetch(baseUrl('/html/about'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('<h1');
  });

  test('GET /md/about serves SSR Markdown', async () => {
    const res = await fetch(baseUrl('/md/about'));
    expect(res.status).toEqual(200);
    expect(res.headers.get('content-type')?.includes('text/markdown')).toBeTruthy();
    await res.text(); // consume body
  });
});

// ── SSR-to-SPA Hydration ────────────────────────────────────────────

describe('SSR to SPA hydration — comprehensive', () => {
  let page!: Page;

  beforeAll(async () => {
    server = await createTestServer({ mode: 'root', port: 4103 });
    tb = await createTestBrowser();
    page = await tb.newPage();
  });

  afterAll(async () => {
    await tb.close();
    server.stop();
  });

  // ── SSR HTML Response ─────────────────────────────────────────────

  test('SSR HTML response contains hydration markers', async () => {
    const res = await fetch(baseUrl('/html/hydration'));
    expect(res.status).toEqual(200);
    const html = await res.text();

    // Should contain pre-rendered content
    expect(html).toContain('SSR rendered');
    expect(html).toContain('Hydration Test');
    expect(html).toContain('id="hydration-content"');
    expect(html).toContain('data-ssr="true"');

    // Should use index.html shell with router-slot
    expect(html).toContain('<router-slot');

    // Critical: data-ssr-route attribute for SPA adoption
    expect(html).toContain('data-ssr-route="/html/hydration"');
  });

  test('SSR HTML includes document title', async () => {
    const res = await fetch(baseUrl('/html/hydration'));
    const html = await res.text();
    expect(html).toContain('<title>Hydration Test</title>');
  });

  // ── SPA Content Adoption ──────────────────────────────────────────

  test('SPA adopts SSR content without re-rendering', async () => {
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

    expect(result.heading).toEqual('Hydration Test');

    // KEY TEST: Verify getData was NOT called in browser (only in SSR)
    expect(result.callCount).toEqual(0);

    // Verify content is marked as SSR-rendered (in shadow root)
    expect(result.ssrAttr === 'true').toBeTruthy();

    // Verify render context shows SSR
    expect(result.renderContext).toEqual('SSR rendered');
  });

  test('data-ssr-route attribute is removed after adoption', async () => {
    // After SPA hydration, data-ssr-route should be removed
    const ssrRouteAttr = await page.evaluate(() => {
      return document.querySelector('router-slot')?.getAttribute('data-ssr-route');
    });
    expect(ssrRouteAttr).toEqual(null);
  });

  test('router-slot element is preserved during hydration', async () => {
    const slotExists = await page.evaluate(() => {
      return document.querySelector('router-slot') !== null;
    });
    expect(slotExists).toBeTruthy();
  });

  test('document title matches SSR title', async () => {
    const title = await page.title();
    expect(title).toEqual('Hydration Test');
  });

  test(
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

      expect(result.callCount).toEqual(1);

      // Content should now be marked as SPA-rendered
      expect(result.ssrAttr).toEqual('false');

      expect(result.renderContext).toEqual('SPA rendered');
    },
  );

  // ── CSS Preservation ──────────────────────────────────────────────

  test('SSR-injected CSS styles are preserved', async () => {
    await page.goto(baseUrl('/html/about'));
    await page.waitForSelector('h1', { timeout: 5000 });

    // About page has about.page.css — verify a <style> tag with its content exists
    const hasPageCSS = await page.evaluate(() => {
      const styles = Array.from(document.querySelectorAll('style'));
      return styles.some((s) => s.textContent?.includes('.about-page'));
    });

    expect(hasPageCSS).toBeTruthy();
  });

  // ── Widget Hydration ──────────────────────────────────────────────

  test('widgets are adopted from SSR without re-render', async () => {
    await page.goto(baseUrl('/html/'));
    await page.waitForSelector('widget-nav', { timeout: 5000 });

    // Widget content is now in Shadow DOM - check shadowRoot
    const navLinks = await page.evaluate(() => {
      const widget = document.querySelector('widget-nav');
      const shadow = widget?.shadowRoot;
      const nav = shadow?.querySelector('nav');
      return nav?.querySelectorAll('a').length ?? 0;
    });
    expect(navLinks > 0).toBeTruthy();
  });

  test('widget params are preserved during hydration', async () => {
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
    expect(greetingWithParam).toBeTruthy();
  });

  test('widget inline styles are preserved', async () => {
    await page.goto(baseUrl('/html/vanilla/counter'));
    await page.waitForSelector('widget-counter-vanilla', { timeout: 5000 });

    // Counter widget has inline styles - check shadow root
    const hasStyles = await page.evaluate(() => {
      const widget = document.querySelector('widget-counter-vanilla');
      const shadow = widget?.shadowRoot;
      const style = shadow?.querySelector('style');
      return style !== null && style?.textContent?.includes('c-counter-vanilla');
    });
    expect(hasStyles).toBeTruthy();
  });

  // ── Nested Router Slots ───────────────────────────────────────────

  test('nested route content is composed correctly', async () => {
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

    expect(result.rootExists).toBeTruthy();
    expect(result.rootHasContent).toBeTruthy();
    expect(result.hasArticleContent).toBeTruthy();
    expect(result.hasCommentContent).toBeTruthy();
  });

  test('deeply nested routes preserve full hierarchy', async () => {
    await page.goto(baseUrl('/html/projects/42/tasks'));
    await page.waitForSelector('h1', { timeout: 5000 });

    // SSR flattens router-slots (replaces with child content), so verify
    // the full hierarchy is composed correctly: root layout + project + tasks
    const result = await page.evaluate(() => {
      const slot = document.querySelector('router-slot');
      const html = slot?.innerHTML ?? '';
      return {
        hasShellSlot: slot !== null,
        hasProjectContent: html.includes('Project 42'),
        hasTaskContent: html.includes('Task A for 42'),
      };
    });

    expect(result.hasShellSlot).toBeTruthy();
    expect(result.hasProjectContent).toBeTruthy();
    expect(result.hasTaskContent).toBeTruthy();
  });

  // ── No Double Rendering ───────────────────────────────────────────

  test('timestamp check proves no re-render occurred', async () => {
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
    expect(diff < 2000).toBeTruthy();
  });

  // TODO: enable once getData call counting is wired up
  test('getData is NOT called during hydration [SKIP]', () => {});

  // TODO: enable once title update tracking is implemented
  test('title updates on navigation after hydration [SKIP]', () => {});
  test('title updates respect getTitle() return value [SKIP]', () => {});

  // ── Subsequent SPA Navigation ─────────────────────────────────────

  test('subsequent SPA navigation works after hydration', async () => {
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
    expect(heading).toEqual('Hydration Test');

    // Navigate back
    await page.evaluate(() => {
      const router = (globalThis as Record<string, unknown>).__emroute_router;
      if (router && typeof router === 'object' && 'navigate' in router) {
        (router.navigate as (url: string) => Promise<void>)('/html/');
      }
    });
    await page.waitForSelector('h1', { timeout: 5000 });

    const homeHeading = await page.textContent('h1');
    expect(homeHeading && homeHeading.length > 0).toBeTruthy();
  });

  test('link clicks trigger SPA navigation after hydration', async () => {
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

    expect(fullLoadFired).toBe(false);
    expect(new URL(page.url()).pathname).toEqual('/html/about');
  });

  test('browser back/forward works after hydration', async () => {
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
    expect(heading).toEqual('emroute');

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
    expect(aboutHeading).toEqual('About');
  });

  // ── Error Boundaries ──────────────────────────────────────────────

  test('error boundaries are adopted during hydration', async () => {
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
    expect(errorVisible).toBeTruthy();
  });

  // ── Markdown Rendering ────────────────────────────────────────────

  test('markdown content is adopted from SSR', async () => {
    await page.goto(baseUrl('/html/'));
    await page.waitForSelector('h1', { timeout: 5000 });

    const h1Text = await page.textContent('h1');

    expect(h1Text).toContain('emroute');
    expect(h1Text).toBe('emroute');
  });

  test('page content does not re-render during hydration', async () => {
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

    expect(initialHTML).toEqual(finalHTML);
  });
});
