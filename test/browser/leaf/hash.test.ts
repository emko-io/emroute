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

import { assert, assertEquals } from '@std/assert';
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

Deno.test(
  { name: 'Hash router — leaf mode', sanitizeResources: false, sanitizeOps: false },
  async (t) => {
    server = await createTestServer({ mode: 'leaf', port: 4106, entryPoint: 'hash-main.ts' });
    tb = await createTestBrowser();

    await t.step('hash-app page renders SSR content', async () => {
      const res = await fetch(baseUrl('/html/hash-app'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('Hash Mini-App'), 'should contain page heading');
      assert(html.includes('<hash-slot'), 'should contain hash-slot element');
    });

    await t.step('hash links navigate in-place', async () => {
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
      assert(content.includes('Settings'), `hash-slot should contain Settings, got: ${content}`);

      await page.close();
    });

    await t.step('dynamic route params render correctly', async () => {
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
      assert(content.includes('User 42'), `should contain User 42, got: ${content}`);

      await page.close();
    });

    await t.step('back/forward works with hash history', async () => {
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
      assert(content.includes('Settings'), `back should show Settings, got: ${content}`);

      // Go back again → should show Dashboard
      await page.goBack();
      await page.waitForFunction(() =>
        document.querySelector('hash-slot')?.innerHTML?.includes('Dashboard')
      );
      content = await page.evaluate(() => document.querySelector('hash-slot')?.innerHTML ?? '');
      assert(content.includes('Dashboard'), `back should show Dashboard, got: ${content}`);

      // Go forward → should show Settings again
      await page.goForward();
      await page.waitForFunction(() =>
        document.querySelector('hash-slot')?.innerHTML?.includes('Settings')
      );
      content = await page.evaluate(() => document.querySelector('hash-slot')?.innerHTML ?? '');
      assert(content.includes('Settings'), `forward should show Settings, got: ${content}`);

      await page.close();
    });

    await t.step('title updates on hash navigation', async () => {
      const page = await tb.newPage();
      await page.goto(baseUrl('/html/hash-app'));

      await page.click('a[href="#/settings"]');
      await page.waitForFunction(() =>
        document.querySelector('hash-slot')?.innerHTML?.includes('Settings')
      );
      let title = await page.title();
      assertEquals(title, 'Settings');

      await page.click('a[href="#/users/42"]');
      await page.waitForFunction(() =>
        document.querySelector('hash-slot')?.innerHTML?.includes('User 42')
      );
      title = await page.title();
      assertEquals(title, 'User 42');

      await page.close();
    });

    await t.step('unmatched hash shows not-found', async () => {
      const page = await tb.newPage();
      await page.goto(baseUrl('/html/hash-app#/nonexistent'));

      await page.waitForFunction(() =>
        document.querySelector('hash-slot')?.innerHTML?.includes('Not Found')
      );

      const content = await page.evaluate(() =>
        document.querySelector('hash-slot')?.innerHTML ?? ''
      );
      assert(content.includes('Not Found'), `should show Not Found, got: ${content}`);

      await page.close();
    });

    await t.step('programmatic navigate works via globalThis.__emroute_hash_router', async () => {
      const page = await tb.newPage();
      await page.goto(baseUrl('/html/hash-app'));

      // Wait for hash router to initialize (module scripts are async)
      await page.waitForFunction(() => (globalThis as Record<string, unknown>).__emroute_hash_router);

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
      assert(content.includes('Settings'), `navigate() should work, got: ${content}`);

      await page.close();
    });

    await t.step('initial hash renders on page load', async () => {
      const page = await tb.newPage();
      await page.goto(baseUrl('/html/hash-app#/settings'));

      await page.waitForFunction(() =>
        document.querySelector('hash-slot')?.innerHTML?.includes('Settings')
      );

      const content = await page.evaluate(() =>
        document.querySelector('hash-slot')?.innerHTML ?? ''
      );
      assert(content.includes('Settings'), `initial hash should render, got: ${content}`);

      await page.close();
    });

    await tb.close();
    server.stop();
  },
);
