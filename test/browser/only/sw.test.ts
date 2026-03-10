/**
 * Service Worker — Offline PWA Browser Tests
 *
 * Tests the ServiceWorker-based offline PWA in `only` mode.
 * Verifies that after the SW installs and precaches, pages
 * render from cache even when the server is stopped.
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import {
  createTestBrowser,
  createTestServer,
  buildTestSW,
  type TestBrowser,
  type TestServer,
} from '../shared/setup.ts';
import type { Page } from 'playwright';

const PORT = 4108;
let server: TestServer;
let tb: TestBrowser;

function baseUrl(path = '/'): string {
  return server.baseUrl(path);
}

describe('ServiceWorker offline PWA', () => {
  beforeAll(async () => {
    server = await createTestServer({ mode: 'only', port: PORT });
    await buildTestSW();
    tb = await createTestBrowser();
  });

  afterAll(async () => {
    await tb?.close();
    server?.stop();
  });

  test('SW registers and activates', async () => {
    const page = await tb.newPage();
    try {
      await page.goto(baseUrl('/app/'));
      await page.waitForFunction(() => document.querySelector('router-slot')?.innerHTML !== '');

      // Register SW
      const swState = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.register('/sw.js', { type: 'module' });
        // Wait for the SW to activate
        const sw = reg.installing ?? reg.waiting ?? reg.active;
        if (!sw) return 'no-sw';
        if (sw.state === 'activated') return 'activated';
        return new Promise<string>((resolve) => {
          sw.addEventListener('statechange', () => {
            if (sw.state === 'activated') resolve('activated');
          });
        });
      });

      expect(swState).toEqual('activated');
    } finally {
      await page.close();
    }
  });

  test('pages render offline after SW precache', async () => {
    const page = await tb.newPage();
    try {
      // Load page and register SW
      await page.goto(baseUrl('/app/'));
      await page.waitForFunction(() => document.querySelector('router-slot')?.innerHTML !== '');

      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.register('/sw.js', { type: 'module' });
        const sw = reg.installing ?? reg.waiting ?? reg.active;
        if (!sw) throw new Error('No SW');
        if (sw.state !== 'activated') {
          await new Promise<void>((resolve) => {
            sw.addEventListener('statechange', () => {
              if (sw.state === 'activated') resolve();
            });
          });
        }
        // Ensure the SW controls this page
        if (!navigator.serviceWorker.controller) {
          await new Promise<void>((resolve) => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve());
          });
        }
      });

      // Stop the server — simulate offline
      server.stop();

      // Navigate to the about page (should be served from SW cache)
      await page.goto(`http://localhost:${PORT}/app/about`, { waitUntil: 'load' });

      // The SW should serve the shell and the SPA should render
      const html = await page.content();
      expect(html).toContain('router-slot');
    } finally {
      await page.close();
      // Restart server for other tests
      server = await createTestServer({ mode: 'only', port: PORT });
    }
  });
});
