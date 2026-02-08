/**
 * SSR Renderers — Integration Tests
 *
 * Tests SSR HTML (/html/*) and SSR Markdown (/md/*) renderers
 * against the dev server using the same fixtures as the SPA tests.
 *
 * Coverage matrix — every route type x both SSR renderers:
 * - .page.md (markdown fallback)
 * - .page.html (HTML fallback / markdown router-slot fallback)
 * - .page.ts (custom renderHTML/renderMarkdown)
 * - .page.ts + .page.html (template pattern)
 * - .page.ts + .page.md (markdown in context)
 * - Flat file vs directory index
 * - Nested dynamic routes
 * - Redirects
 * - 404
 */

import { assert, assertEquals } from '@std/assert';
import { baseUrl, startServer, stopServer } from './setup.ts';

// ── SSR HTML ─────────────────────────────────────────────────────────

Deno.test(
  { name: 'SSR HTML renderer', sanitizeResources: false, sanitizeOps: false },
  async (t) => {
    await startServer();

    // --- .page.md ---

    await t.step('.page.md renders markdown wrapped in <mark-down>', async () => {
      const res = await fetch(baseUrl('/html/'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('<mark-down>'), 'should wrap md in <mark-down>');
      assert(html.includes('Home'), 'should contain Home heading');
    });

    // --- .page.html ---

    await t.step('.page.html renders HTML content directly', async () => {
      const res = await fetch(baseUrl('/html/about'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('<h1>About</h1>'), 'should contain About heading');
      assert(html.includes('About Page'), 'should contain title text');
      assert(html.includes('section-1'), 'should contain section anchor');
      assert(
        html.includes('<widget-failing>'),
        'should pass through widget tag for client hydration',
      );
    });

    // --- .page.ts ---

    await t.step('.page.ts component renders with getData', async () => {
      const res = await fetch(baseUrl('/html/projects/42'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('Project 42'), 'should contain project name');
      assert(html.includes('ID: 42'), 'should contain project ID');
    });

    // --- .page.ts + .page.html (params) ---

    await t.step('.page.ts + .page.html replaces template slots from params', async () => {
      const res = await fetch(baseUrl('/html/docs'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('Topic: general'), 'should replace {{topic}} in template');
      assert(html.includes('Documentation'), 'should include getTitle result');
    });

    // --- .page.ts + .page.html (getData) ---

    await t.step('.page.ts + .page.html injects getData into template', async () => {
      const res = await fetch(baseUrl('/html/profile'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('Alice'), 'should contain name from getData');
      assert(html.includes('Role: Engineer'), 'should contain role');
      assert(html.includes('Builds things.'), 'should contain bio');
    });

    // --- .page.ts + .page.md ---

    await t.step('.page.ts + .page.md renders markdown + custom content', async () => {
      const res = await fetch(baseUrl('/html/blog'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('<mark-down>'), 'should contain <mark-down> for md content');
      assert(html.includes('Posts: 0'), 'should contain blog footer');
    });

    // --- Nested dynamic ---

    await t.step('nested dynamic route renders full hierarchy', async () => {
      const res = await fetch(baseUrl('/html/projects/42/tasks'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('Project 42'), 'should contain parent project');
      assert(html.includes('Tasks for 42'), 'should contain tasks heading');
      assert(html.includes('Task A for 42'), 'should contain task items');
    });

    // --- Flat file vs directory index ---

    await t.step('flat file renders exact match', async () => {
      const res = await fetch(baseUrl('/html/projects'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('All Projects'), 'should contain flat file content');
    });

    await t.step('directory index catches unmatched children', async () => {
      const res = await fetch(baseUrl('/html/projects/unknown/extra'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('Project Hub'), 'should contain directory index content');
    });

    // --- Redirect ---

    await t.step('redirect returns meta refresh', async () => {
      const res = await fetch(baseUrl('/html/old'), { redirect: 'manual' });
      assertEquals(res.status, 302);
      const html = await res.text();
      assert(html.includes('http-equiv="refresh"'), 'should contain meta refresh');
      assert(html.includes('/about'), 'should contain redirect target');
    });

    // --- 404 ---

    await t.step('returns 404 for unknown routes', async () => {
      const res = await fetch(baseUrl('/html/nonexistent'));
      assertEquals(res.status, 404);
      const html = await res.text();
      assert(html.includes('Not Found'), 'should contain Not Found');
    });

    // --- Error: getData throws ---

    await t.step('getData() throw returns 500 with error', async () => {
      const res = await fetch(baseUrl('/html/crash'));
      assertEquals(res.status, 500);
      const html = await res.text();
      assert(html.includes('Error'), 'should contain error heading');
      assert(html.includes('Simulated crash'), 'should contain error message');
    });

    await stopServer();
  },
);

// ── SSR Markdown ─────────────────────────────────────────────────────

Deno.test(
  { name: 'SSR Markdown renderer', sanitizeResources: false, sanitizeOps: false },
  async (t) => {
    await startServer();

    // --- .page.md ---

    await t.step('.page.md returns raw markdown content', async () => {
      const res = await fetch(baseUrl('/md/'));
      assertEquals(res.status, 200);
      assertEquals(res.headers.get('content-type'), 'text/plain; charset=utf-8');
      const md = await res.text();
      assert(md.includes('# Home'), 'should contain markdown heading');
      assert(md.includes('[About](/about)'), 'should contain markdown link');
    });

    // --- .page.html ---

    await t.step('.page.html falls back to router-slot placeholder', async () => {
      const res = await fetch(baseUrl('/md/about'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('router-slot'), 'should contain router-slot fallback');
    });

    // --- .page.ts ---

    await t.step('.page.ts component renders via renderMarkdown', async () => {
      const res = await fetch(baseUrl('/md/projects/42'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('# Project 42'), 'should contain project heading');
    });

    // --- .page.ts + .page.html (params) ---

    await t.step('.page.ts + .page.html uses renderMarkdown override', async () => {
      const res = await fetch(baseUrl('/md/docs'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('# Docs'), 'should contain docs markdown from override');
    });

    // --- .page.ts + .page.html (getData) ---

    await t.step('.page.ts + .page.html renders markdown from getData', async () => {
      const res = await fetch(baseUrl('/md/profile'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('# Alice'), 'should contain name from getData');
      assert(md.includes('Engineer'), 'should contain role');
    });

    // --- .page.ts + .page.md ---

    await t.step('.page.ts + .page.md returns markdown from context', async () => {
      const res = await fetch(baseUrl('/md/blog'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('# Blog'), 'should contain blog heading from md file');
    });

    // --- Nested dynamic ---

    await t.step('nested dynamic route renders full hierarchy', async () => {
      const res = await fetch(baseUrl('/md/projects/42/tasks'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('# Project 42'), 'should contain parent project');
      assert(md.includes('# Tasks for 42'), 'should contain tasks heading');
      assert(md.includes('- Task A for 42'), 'should contain task items');
    });

    // --- Flat file vs directory index ---

    await t.step('flat file renders exact match', async () => {
      const res = await fetch(baseUrl('/md/projects'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('All Projects'), 'should contain flat file content');
    });

    await t.step('directory index catches unmatched children', async () => {
      const res = await fetch(baseUrl('/md/projects/unknown/extra'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('Project Hub'), 'should contain directory index content');
    });

    // --- Redirect ---

    await t.step('redirect returns plain text with target', async () => {
      const res = await fetch(baseUrl('/md/old'), { redirect: 'manual' });
      assertEquals(res.status, 302);
      const md = await res.text();
      assert(md.includes('/about'), 'should contain redirect target');
    });

    // --- 404 ---

    await t.step('returns 404 for unknown routes', async () => {
      const res = await fetch(baseUrl('/md/nonexistent'));
      assertEquals(res.status, 404);
      const md = await res.text();
      assert(md.includes('Not Found'), 'should contain Not Found');
    });

    // --- Error: getData throws ---

    await t.step('getData() throw returns 500 with error', async () => {
      const res = await fetch(baseUrl('/md/crash'));
      assertEquals(res.status, 500);
      const md = await res.text();
      assert(md.includes('Error'), 'should contain error heading');
      assert(md.includes('Simulated crash'), 'should contain error message');
    });

    await stopServer();
  },
);
