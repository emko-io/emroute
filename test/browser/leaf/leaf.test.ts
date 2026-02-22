/**
 * SPA Mode: leaf — SSR + JS Bundles (No Router)
 *
 * Tests 'leaf' mode where SSR HTML is served with JavaScript bundles
 * but without the emroute SPA router. Widgets hydrate as islands,
 * embedded apps can use hash routing.
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { createTestServer, type TestServer } from '../shared/setup.ts';

let server: TestServer;

function baseUrl(path = '/'): string {
  return server.baseUrl(path);
}

describe("SPA mode 'leaf'", () => {
  beforeAll(async () => {
    server = await createTestServer({ mode: 'leaf', port: 4102 });
  });

  afterAll(() => {
    server.stop();
  });

  test('GET / redirects to /html/', async () => {
    const res = await fetch(baseUrl('/'), { redirect: 'manual' });
    expect(res.status).toEqual(302);
    const location = res.headers.get('location');
    expect(location?.endsWith('/html/')).toBeTruthy();
  });

  test('GET /about redirects to /html/about', async () => {
    const res = await fetch(baseUrl('/about'), { redirect: 'manual' });
    expect(res.status).toEqual(302);
    const location = res.headers.get('location');
    expect(location?.endsWith('/html/about')).toBeTruthy();
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
