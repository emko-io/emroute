/**
 * SPA Renderer — Browser Tests
 *
 * Tests the SPA HTML renderer in a real browser via Playwright.
 * Uses the dev server to serve test fixture routes.
 *
 * Route types covered:
 * - .page.md (markdown content via <mark-down> element)
 * - .page.html (HTML template with <title> extraction)
 * - .page.ts (custom PageComponent with getData/renderHTML)
 * - .page.ts + .page.html (template pattern via context.files.html)
 * - .page.ts + .page.md (markdown in context.files.md)
 * - Flat file vs directory index (exact match vs catch-all)
 * - Nested dynamic routes (/projects/:id/tasks)
 * - Redirects (.redirect.ts)
 * - Error boundaries (.error.ts)
 * - Root error handler (error.ts)
 */

import { assert, assertEquals } from '@std/assert';
import { baseUrl, closeBrowser, launchBrowser, newPage, startServer, stopServer } from './setup.ts';
import type { Page } from 'npm:playwright@1.50.1';

Deno.test({ name: 'SPA renderer', sanitizeResources: false, sanitizeOps: false }, async (t) => {
  await startServer();
  await launchBrowser();

  let page!: Page;

  await t.step('setup: create page', async () => {
    page = await newPage();
  });

  // --- Markdown rendering ---

  await t.step('markdown page renders content via <mark-down>', async () => {
    await page.goto(baseUrl('/'));
    await page.waitForSelector('router-slot mark-down h1', { timeout: 5000 });

    // <mark-down> element should exist inside <router-slot>
    const markdownExists = await page.evaluate(() => {
      return document.querySelector('router-slot mark-down') !== null;
    });
    assert(markdownExists, '<mark-down> element should be in router-slot');

    const heading = await page.textContent('router-slot mark-down h1');
    assertEquals(heading, 'emroute');
  });

  await t.step('markdown links are SPA-navigable', async () => {
    await page.goto(baseUrl('/'));
    await page.waitForSelector('router-slot mark-down h1', { timeout: 5000 });

    let fullLoadFired = false;
    page.on('load', () => {
      fullLoadFired = true;
    });
    fullLoadFired = false;

    // Click "About" link rendered from markdown [About](/about)
    await page.click('a[href="/about"]');
    await page.waitForFunction(
      () => {
        const h1 = document.querySelector('router-slot router-slot h1');
        return h1?.textContent === 'About';
      },
      undefined,
      { timeout: 5000 },
    );

    assertEquals(new URL(page.url()).pathname, '/about');
    assertEquals(fullLoadFired, false);
  });

  // --- Custom .page.ts component ---

  await t.step('.page.ts component renders with getData', async () => {
    await page.goto(baseUrl('/projects/42'));
    await page.waitForSelector('router-slot router-slot router-slot h1', { timeout: 5000 });

    const heading = await page.textContent('router-slot router-slot router-slot h1');
    assertEquals(heading, 'Project 42');

    const idText = await page.textContent('router-slot router-slot router-slot .project-id');
    assertEquals(idText, 'ID: 42');
  });

  await t.step('.page.ts component extracts URL params', async () => {
    await page.goto(baseUrl('/projects/99'));
    await page.waitForSelector('router-slot router-slot router-slot h1', { timeout: 5000 });

    const heading = await page.textContent('router-slot router-slot router-slot h1');
    assertEquals(heading, 'Project 99');

    // deno-lint-ignore no-explicit-any
    const params = await page.evaluate(() => (globalThis as any).__testRouter.getParams());
    assertEquals(params.id, '99');
  });

  // --- Flat file vs directory index ---

  await t.step('flat file matches exact path only', async () => {
    await page.goto(baseUrl('/projects'));
    await page.waitForSelector('router-slot router-slot mark-down h1', { timeout: 5000 });

    const heading = await page.textContent('router-slot router-slot mark-down h1');
    assertEquals(heading, 'All Projects');
  });

  await t.step('directory index catches unmatched children', async () => {
    await page.goto(baseUrl('/projects/unknown/extra'));
    await page.waitForSelector('router-slot router-slot router-slot mark-down h1', {
      timeout: 5000,
    });

    const heading = await page.textContent('router-slot router-slot router-slot mark-down h1');
    assertEquals(heading, 'Project Hub');
  });

  await t.step('specific route wins over directory index catch-all', async () => {
    await page.goto(baseUrl('/projects/42'));
    await page.waitForSelector('router-slot router-slot router-slot h1', { timeout: 5000 });

    // Should be the .page.ts component, not the catch-all
    const heading = await page.textContent('router-slot router-slot router-slot h1');
    assertEquals(heading, 'Project 42');

    // Leaf slot renders directly from .page.ts, no <mark-down> element
    const hasMarkdown = await page.evaluate(() => {
      const leafSlot = document.querySelector('router-slot router-slot router-slot');
      return leafSlot?.querySelector('mark-down') !== null;
    });
    assertEquals(hasMarkdown, false);
  });

  // --- Navigation ---

  await t.step('back navigation restores previous page', async () => {
    await page.goto(baseUrl('/'));
    await page.waitForSelector('router-slot mark-down h1', { timeout: 5000 });

    // deno-lint-ignore no-explicit-any
    await page.evaluate(async () => await (globalThis as any).__testRouter.navigate('/about'));
    await page.waitForFunction(
      () => {
        const h1 = document.querySelector('router-slot router-slot h1');
        return h1?.textContent === 'About';
      },
      undefined,
      { timeout: 5000 },
    );

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
    assertEquals(new URL(page.url()).pathname, '/');
  });

  await t.step('programmatic router.navigate() updates content', async () => {
    await page.goto(baseUrl('/'));
    await page.waitForSelector('router-slot mark-down h1', { timeout: 5000 });

    // deno-lint-ignore no-explicit-any
    await page.evaluate(async () => await (globalThis as any).__testRouter.navigate('/about'));
    await page.waitForFunction(
      () => {
        const h1 = document.querySelector('router-slot router-slot h1');
        return h1?.textContent === 'About';
      },
      undefined,
      { timeout: 5000 },
    );

    assertEquals(new URL(page.url()).pathname, '/about');
  });

  await t.step('/html/ link triggers full navigation, not SPA', async () => {
    await page.goto(baseUrl('/'));
    await page.waitForSelector('router-slot mark-down h1', { timeout: 5000 });

    let fullLoadFired = false;
    page.on('load', () => {
      fullLoadFired = true;
    });

    // Inject an /html/ link to test that SSR-prefixed links trigger full navigation
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.href = '/html/about';
      a.textContent = 'HTML About';
      document.querySelector('router-slot')?.appendChild(a);
    });

    await page.click('a[href="/html/about"]');
    await page.waitForURL('**/html/about', { timeout: 5000 });

    assertEquals(fullLoadFired, true);
    assert(page.url().includes('/html/about'));
  });

  await t.step('hash navigation includes hash in URL', async () => {
    await page.goto(baseUrl('/'));
    await page.waitForSelector('router-slot mark-down h1', { timeout: 5000 });

    // deno-lint-ignore no-explicit-any
    await page.evaluate(async () =>
      await (globalThis as any).__testRouter.navigate('/about#section-1')
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
    const sectionExists = await page.evaluate(() => document.getElementById('section-1') !== null);
    assert(sectionExists, 'anchor target element should exist');
  });

  // --- Router events ---

  await t.step('router events fire on navigation', async () => {
    await page.goto(baseUrl('/'));
    await page.waitForSelector('router-slot mark-down h1', { timeout: 5000 });

    const events = await page.evaluate(async () => {
      const collected: Array<{ type: string; pathname: string }> = [];
      // deno-lint-ignore no-explicit-any
      const router = (globalThis as any).__testRouter;
      router.addEventListener((event: { type: string; pathname: string }) => {
        collected.push({ type: event.type, pathname: event.pathname });
      });
      await router.navigate('/about');
      return collected;
    });

    const navigateEvent = events.find((e: { type: string }) => e.type === 'navigate');
    const loadEvent = events.find((e: { type: string }) => e.type === 'load');
    assert(navigateEvent, 'navigate event should fire');
    assert(loadEvent, 'load event should fire');
    assertEquals(navigateEvent!.pathname, '/about');
  });

  // --- Error handling ---

  await t.step('renders 404 for unknown routes', async () => {
    await page.goto(baseUrl('/nonexistent'));
    await page.waitForSelector('router-slot section.error-page', { timeout: 5000 });

    const heading = await page.textContent('router-slot section.error-page h1:first-child');
    assertEquals(heading, '404');

    // Markdown content from 404.page.md should also be rendered
    const oops = await page.textContent('router-slot section.error-page mark-down h1');
    assertEquals(oops, 'Oops');
  });

  // --- .page.ts + .page.html (template pattern) ---

  await t.step('.page.ts uses context.files.html as template', async () => {
    await page.goto(baseUrl('/docs'));
    await page.waitForSelector('router-slot router-slot h1', { timeout: 5000 });

    const heading = await page.textContent('router-slot router-slot h1');
    assertEquals(heading, 'Docs');

    const topic = await page.textContent('router-slot router-slot .topic');
    assertEquals(topic, 'Topic: general');
  });

  await t.step('.page.ts getTitle() overrides <title> extraction', async () => {
    await page.goto(baseUrl('/docs'));
    await page.waitForSelector('router-slot router-slot h1', { timeout: 5000 });

    const title = await page.title();
    assertEquals(title, 'Documentation');
  });

  // --- .page.ts + .page.md (markdown in context) ---

  await t.step('.page.ts uses context.files.md for custom rendering', async () => {
    await page.goto(baseUrl('/blog'));
    await page.waitForSelector('router-slot router-slot .blog-footer', { timeout: 5000 });

    const footer = await page.textContent('router-slot router-slot .blog-footer');
    assertEquals(footer, 'Posts: 0');

    // The markdown content should be rendered via <mark-down>
    const markdownExists = await page.evaluate(() => {
      const slot = document.querySelector('router-slot router-slot');
      return slot?.querySelector('mark-down') !== null;
    });
    assert(markdownExists, 'blog page should contain <mark-down> element');
  });

  // --- Nested dynamic routes ---

  await t.step('nested dynamic route renders at correct depth', async () => {
    await page.goto(baseUrl('/projects/42/tasks'));
    await page.waitForSelector(
      'router-slot router-slot router-slot router-slot h1',
      { timeout: 5000 },
    );

    const heading = await page.textContent(
      'router-slot router-slot router-slot router-slot h1',
    );
    assertEquals(heading, 'Tasks for 42');

    const items = await page.evaluate(() => {
      const slot = document.querySelector(
        'router-slot router-slot router-slot router-slot',
      );
      return [...(slot?.querySelectorAll('.task-list li') ?? [])].map(
        (li) => li.textContent,
      );
    });
    assertEquals(items, ['Task A for 42', 'Task B for 42']);
  });

  // --- Redirects ---

  await t.step('redirect navigates to target route', async () => {
    await page.goto(baseUrl('/'));
    await page.waitForSelector('router-slot mark-down h1', { timeout: 5000 });

    // deno-lint-ignore no-explicit-any
    await page.evaluate(async () => await (globalThis as any).__testRouter.navigate('/old'));
    await page.waitForFunction(
      () => {
        const h1 = document.querySelector('router-slot router-slot h1');
        return h1?.textContent === 'About';
      },
      undefined,
      { timeout: 5000 },
    );

    assertEquals(new URL(page.url()).pathname, '/about');
  });

  // --- Forward navigation ---

  await t.step('forward navigation after back', async () => {
    await page.goto(baseUrl('/'));
    await page.waitForSelector('router-slot mark-down h1', { timeout: 5000 });

    // deno-lint-ignore no-explicit-any
    await page.evaluate(async () => await (globalThis as any).__testRouter.navigate('/about'));
    await page.waitForFunction(
      () => {
        const h1 = document.querySelector('router-slot router-slot h1');
        return h1?.textContent === 'About';
      },
      undefined,
      { timeout: 5000 },
    );

    await page.goBack();
    await page.waitForFunction(
      () => {
        const h1 = document.querySelector('router-slot mark-down h1');
        return h1?.textContent === 'emroute';
      },
      undefined,
      { timeout: 5000 },
    );

    await page.goForward();
    await page.waitForFunction(
      () => {
        const h1 = document.querySelector('router-slot router-slot h1');
        return h1?.textContent === 'About';
      },
      undefined,
      { timeout: 5000 },
    );

    assertEquals(new URL(page.url()).pathname, '/about');
  });

  // --- getData into HTML template ---

  await t.step('.page.ts injects getData result into HTML template', async () => {
    await page.goto(baseUrl('/profile'));
    await page.waitForSelector('router-slot router-slot h1', { timeout: 5000 });

    const heading = await page.textContent('router-slot router-slot h1');
    assertEquals(heading, 'Alice');

    const role = await page.textContent('router-slot router-slot .role');
    assertEquals(role, 'Role: Engineer');

    const bio = await page.textContent('router-slot router-slot .bio');
    assertEquals(bio, 'Builds things.');

    const title = await page.title();
    assertEquals(title, 'Alice — Profile');
  });

  // --- Widget error containment ---

  await t.step('failing widget shows error without breaking the page', async () => {
    await page.goto(baseUrl('/about'));
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
    const widgetError = await page.waitForSelector('widget-failing .c-error', { timeout: 5000 });
    const errorText = await widgetError.textContent();
    assert(errorText?.includes('Widget data fetch failed'), 'widget should show its error');
  });

  await t.step('does not intercept external links', async () => {
    await page.goto(baseUrl('/'));
    await page.waitForSelector('router-slot mark-down h1', { timeout: 5000 });

    const href = await page.getAttribute('a[href="https://example.com"]', 'href');
    assertEquals(href, 'https://example.com');
  });

  // Cleanup
  await page.close();
  await closeBrowser();
  await stopServer();
});
