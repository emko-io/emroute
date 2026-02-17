/**
 * SPA Mode: leaf — SSR + JS Bundles (No Router)
 *
 * Tests 'leaf' mode where SSR HTML is served with JavaScript bundles
 * but without the emroute SPA router. Widgets hydrate as islands,
 * embedded apps can use hash routing.
 */

import { assert, assertEquals } from '@std/assert';
import { createTestServer, type TestServer } from '../shared/setup.ts';

let server: TestServer;

function baseUrl(path = '/'): string {
  return server.baseUrl(path);
}

Deno.test(
  { name: "SPA mode 'leaf'", sanitizeResources: false, sanitizeOps: false },
  async (t) => {
    server = await createTestServer({ mode: 'leaf', port: 4102 });

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
