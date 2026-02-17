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
// Mode: 'leaf' — no router, redirects bare paths to /html/ (like 'none' but with JS bundles)
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
    });

    await stopServer();
  },
);

// ---------------------------------------------------------------------------
// Mode: 'root' (default) — bare paths redirect to /html/*, SSR + SPA adoption
// ---------------------------------------------------------------------------

Deno.test(
  { name: "spa mode 'root'", sanitizeResources: false, sanitizeOps: false },
  async (t) => {
    await startServer({ spa: 'root' });

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
    });

    await stopServer();
  },
);

// ---------------------------------------------------------------------------
// Mode: 'only' — bare paths redirect to /html/*, no SSR handlers
// ---------------------------------------------------------------------------

Deno.test(
  { name: "spa mode 'only'", sanitizeResources: false, sanitizeOps: false },
  async (t) => {
    await startServer({ spa: 'only' });

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

    await t.step('GET /html/about serves SPA shell (no SSR)', async () => {
      const res = await fetch(baseUrl('/html/about'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('<router-slot'), 'SPA shell should contain <router-slot>');
      // Should NOT contain SSR-rendered content with data-ssr-route
      assertEquals(
        html.includes('data-ssr-route'),
        false,
        'only mode should not SSR-render /html/* routes',
      );
    });

    await t.step('GET /md/about serves SPA shell (no SSR Markdown)', async () => {
      const res = await fetch(baseUrl('/md/about'));
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
