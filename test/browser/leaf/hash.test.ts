/**
 * Hash Router — Browser Integration Tests
 *
 * Tests hash-based mini-app routing in leaf mode:
 * - Hash navigation renders correct content
 * - Dynamic route params work
 * - Back/forward with hash history
 * - Nested route hierarchy renders
 * - Title updates on hash navigation
 * - Not-found hash paths show fallback
 * - In root mode, hash changes don't trigger SPA router
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import {
  createTestBrowser,
  createTestServer,
  type TestBrowser,
  type TestServer,
} from '../shared/setup.ts';

let server: TestServer;
let tb: TestBrowser;

function baseUrl(path = '/'): string {
  return server.baseUrl(path);
}

// ── Hash Router in Leaf Mode ────────────────────────────────────────

// See: issues/pending/hash-router-leaf-mode.feature.md
//      issues/pending/hash-router-use-navigation-api.issue.md
describe.skip('Hash router — leaf mode', () => {
  beforeAll(async () => {
    server = await createTestServer({ mode: 'leaf', port: 4106, entryPoint: 'hash-main.ts' });
    tb = await createTestBrowser();
  });

  afterAll(async () => {
    await tb.close();
    server.stop();
  });

  test('hash-app page renders SSR content', async () => {
    const res = await fetch(baseUrl('/html/hash-app'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('Hash Mini-App');
    expect(html).toContain('<hash-slot');
  });

  test('hash links navigate in-place', async () => {
    const page = await tb.newPage();
    await page.goto(baseUrl('/html/hash-app'));

    // Click the Settings hash link
    await page.click('a[href="#/settings"]');
    await page.waitForFunction(() =>
      document.querySelector('hash-slot')?.innerHTML?.includes('Settings')
    );

    const content = await page.evaluate(() =>
      document.querySelector('hash-slot')?.innerHTML ?? ''
    );
    expect(content).toContain('Settings');

    await page.close();
  });

  test('dynamic route params render correctly', async () => {
    const page = await tb.newPage();
    await page.goto(baseUrl('/html/hash-app'));

    // Click the User 42 hash link
    await page.click('a[href="#/users/42"]');
    await page.waitForFunction(() =>
      document.querySelector('hash-slot')?.innerHTML?.includes('User 42')
    );

    const content = await page.evaluate(() =>
      document.querySelector('hash-slot')?.innerHTML ?? ''
    );
    expect(content).toContain('User 42');

    await page.close();
  });

  test('back/forward works with hash history', async () => {
    const page = await tb.newPage();
    await page.goto(baseUrl('/html/hash-app'));

    // Navigate: Dashboard → Settings → User 42
    await page.click('a[href="#/"]');
    await page.waitForFunction(() =>
      document.querySelector('hash-slot')?.innerHTML?.includes('Dashboard')
    );

    await page.click('a[href="#/settings"]');
    await page.waitForFunction(() =>
      document.querySelector('hash-slot')?.innerHTML?.includes('Settings')
    );

    await page.click('a[href="#/users/42"]');
    await page.waitForFunction(() =>
      document.querySelector('hash-slot')?.innerHTML?.includes('User 42')
    );

    // Go back → should show Settings
    await page.goBack();
    await page.waitForFunction(() =>
      document.querySelector('hash-slot')?.innerHTML?.includes('Settings')
    );
    let content = await page.evaluate(() => document.querySelector('hash-slot')?.innerHTML ?? '');
    expect(content).toContain('Settings');

    // Go back again → should show Dashboard
    await page.goBack();
    await page.waitForFunction(() =>
      document.querySelector('hash-slot')?.innerHTML?.includes('Dashboard')
    );
    content = await page.evaluate(() => document.querySelector('hash-slot')?.innerHTML ?? '');
    expect(content).toContain('Dashboard');

    // Go forward → should show Settings again
    await page.goForward();
    await page.waitForFunction(() =>
      document.querySelector('hash-slot')?.innerHTML?.includes('Settings')
    );
    content = await page.evaluate(() => document.querySelector('hash-slot')?.innerHTML ?? '');
    expect(content).toContain('Settings');

    await page.close();
  });

  test('title updates on hash navigation', async () => {
    const page = await tb.newPage();
    await page.goto(baseUrl('/html/hash-app'));

    await page.click('a[href="#/settings"]');
    await page.waitForFunction(() =>
      document.querySelector('hash-slot')?.innerHTML?.includes('Settings')
    );
    let title = await page.title();
    expect(title).toEqual('Settings');

    await page.click('a[href="#/users/42"]');
    await page.waitForFunction(() =>
      document.querySelector('hash-slot')?.innerHTML?.includes('User 42')
    );
    title = await page.title();
    expect(title).toEqual('User 42');

    await page.close();
  });

  test('unmatched hash shows not-found', async () => {
    const page = await tb.newPage();
    await page.goto(baseUrl('/html/hash-app#/nonexistent'));

    await page.waitForFunction(() =>
      document.querySelector('hash-slot')?.innerHTML?.includes('Not Found')
    );

    const content = await page.evaluate(() =>
      document.querySelector('hash-slot')?.innerHTML ?? ''
    );
    expect(content).toContain('Not Found');

    await page.close();
  });

  test('programmatic navigate works via globalThis.__emroute_hash_router', async () => {
    const page = await tb.newPage();
    await page.goto(baseUrl('/html/hash-app'));

    // Wait for hash router to initialize (module scripts are async)
    await page.waitForFunction(() =>
      (globalThis as Record<string, unknown>).__emroute_hash_router
    );

    await page.evaluate(() => {
      const router = (globalThis as Record<string, unknown>).__emroute_hash_router as {
        navigate: (hash: string) => void;
      };
      router.navigate('/settings');
    });

    await page.waitForFunction(() =>
      document.querySelector('hash-slot')?.innerHTML?.includes('Settings')
    );

    const content = await page.evaluate(() =>
      document.querySelector('hash-slot')?.innerHTML ?? ''
    );
    expect(content).toContain('Settings');

    await page.close();
  });

  test('initial hash renders on page load', async () => {
    const page = await tb.newPage();
    await page.goto(baseUrl('/html/hash-app#/settings'));

    await page.waitForFunction(() =>
      document.querySelector('hash-slot')?.innerHTML?.includes('Settings')
    );

    const content = await page.evaluate(() =>
      document.querySelector('hash-slot')?.innerHTML ?? ''
    );
    expect(content).toContain('Settings');

    await page.close();
  });
});
