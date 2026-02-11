/**
 * SPA Mode Configuration — Browser Tests
 *
 * Tests the four SPA modes ('none', 'leaf', 'root', 'only') at the HTTP level.
 * Each mode controls how the server handles non-file requests and whether
 * SSR (/html/*, /md/*) handlers are active.
 *
 * The server is stopped and restarted for each mode.
 */

import { assert, assertEquals } from '@std/assert';
import { baseUrl, startServer, stopServer } from './setup.ts';

// ---------------------------------------------------------------------------
// Mode: 'none' — all non-file requests redirect to /html/*
// ---------------------------------------------------------------------------

Deno.test(
  { name: "spa mode 'none'", sanitizeResources: false, sanitizeOps: false },
  async (t) => {
    await startServer({ spa: 'none' });

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
      assert(html.includes('<h1'), 'SSR HTML response should contain rendered content');
      assertEquals(res.headers.get('content-type'), 'text/html; charset=utf-8');
    });

    await t.step('GET /md/about serves SSR Markdown', async () => {
      const res = await fetch(baseUrl('/md/about'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('About'), 'SSR Markdown response should contain content');
      assert(
        res.headers.get('content-type')?.includes('text/markdown'),
        'should have markdown content type',
      );
    });

    await stopServer();
  },
);

// ---------------------------------------------------------------------------
// Mode: 'leaf' — root redirects to /html/, other paths serve SPA shell
// ---------------------------------------------------------------------------

Deno.test(
  { name: "spa mode 'leaf'", sanitizeResources: false, sanitizeOps: false },
  async (t) => {
    await startServer({ spa: 'leaf' });

    await t.step('GET / redirects to /html/', async () => {
      const res = await fetch(baseUrl('/'), { redirect: 'manual' });
      assertEquals(res.status, 302);
      const location = res.headers.get('location');
      assert(location?.endsWith('/html/'), `expected redirect to /html/, got ${location}`);
    });

    await t.step('GET /about serves SPA shell (no redirect)', async () => {
      const res = await fetch(baseUrl('/about'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('<router-slot'), 'SPA shell should contain <router-slot>');
      assert(html.includes('<script'), 'SPA shell should contain script tag');
      assertEquals(res.headers.get('content-type'), 'text/html; charset=utf-8');
    });

    await t.step('SPA shell includes SSR hint comment', async () => {
      const res = await fetch(baseUrl('/about'));
      const html = await res.text();
      assert(
        html.includes('Single Page Application'),
        'SPA shell should include SSR hint for LLMs',
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
    });

    await stopServer();
  },
);

// ---------------------------------------------------------------------------
// Mode: 'root' (default) — all non-file requests serve SPA shell
// ---------------------------------------------------------------------------

Deno.test(
  { name: "spa mode 'root'", sanitizeResources: false, sanitizeOps: false },
  async (t) => {
    await startServer({ spa: 'root' });

    await t.step('GET / serves SPA shell', async () => {
      const res = await fetch(baseUrl('/'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('<router-slot'), 'SPA shell should contain <router-slot>');
      assert(html.includes('<script'), 'SPA shell should contain script tag');
    });

    await t.step('GET /about serves SPA shell (no redirect)', async () => {
      const res = await fetch(baseUrl('/about'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('<router-slot'), 'SPA shell should contain <router-slot>');
    });

    await t.step('SPA shell includes SSR hint', async () => {
      const res = await fetch(baseUrl('/about'));
      const html = await res.text();
      assert(
        html.includes('Single Page Application'),
        'SPA shell should include SSR hint',
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
    });

    await stopServer();
  },
);

// ---------------------------------------------------------------------------
// Mode: 'only' — SPA shell for all non-file requests, no SSR handlers
// ---------------------------------------------------------------------------

Deno.test(
  { name: "spa mode 'only'", sanitizeResources: false, sanitizeOps: false },
  async (t) => {
    await startServer({ spa: 'only' });

    await t.step('GET / serves SPA shell', async () => {
      const res = await fetch(baseUrl('/'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('<router-slot'), 'SPA shell should contain <router-slot>');
    });

    await t.step('GET /about serves SPA shell', async () => {
      const res = await fetch(baseUrl('/about'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('<router-slot'), 'SPA shell should contain <router-slot>');
    });

    await t.step('SPA shell does NOT include SSR hint', async () => {
      const res = await fetch(baseUrl('/about'));
      const html = await res.text();
      assertEquals(
        html.includes('Single Page Application'),
        false,
        'only mode should not include SSR hint (no SSR endpoints exist)',
      );
    });

    await t.step('GET /html/about does NOT serve SSR HTML', async () => {
      const res = await fetch(baseUrl('/html/about'));
      // /html/about is a "file-like" path (has no extension, but starts with /html/)
      // Actually /html/about has no extension, so isFileRequest returns false,
      // and since spa='only' skips the SSR handler, it falls through to SPA shell
      const html = await res.text();
      // Should NOT contain SSR-rendered content with data-ssr-route
      assertEquals(
        html.includes('data-ssr-route'),
        false,
        'only mode should not SSR-render /html/* routes',
      );
    });

    await t.step('GET /md/about does NOT serve SSR Markdown', async () => {
      const res = await fetch(baseUrl('/md/about'));
      // Same as above — /md/about has no extension, falls through to SPA shell
      const contentType = res.headers.get('content-type');
      assert(
        contentType?.includes('text/html'),
        `only mode should serve HTML for /md/*, got ${contentType}`,
      );
      await res.text(); // consume body
    });

    await stopServer();
  },
);
