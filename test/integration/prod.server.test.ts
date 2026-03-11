/**
 * Emroute Server Tests
 *
 * Smoke tests for Emroute using the browser test fixtures.
 * Verifies the full pipeline: route discovery → manifest resolution →
 * bundling → SSR rendering → handleRequest.
 */

import { test, expect, describe, beforeAll } from 'bun:test';
import { resolve } from 'node:path';
import { Emroute } from '../../server/emroute.server.ts';
import { buildClientBundles } from '../../server/build.util.ts';
import { BunFsRuntime } from '../../runtime/bun/fs/bun-fs.runtime.ts';
import { WIDGETS_MANIFEST_PATH, type RuntimeConfig } from '../../runtime/abstract.runtime.ts';
import type { WidgetManifestEntry } from '../../core/type/widget.type.ts';

const FIXTURES_DIR = 'test/browser/fixtures';

/** Create a request to the server. */
function req(path: string): Request {
  return new Request(`http://localhost${path}`);
}

const runtimeConfig: RuntimeConfig = {
  routesDir: '/routes',
  widgetsDir: '/widgets',
};

/** Create emroute server with test fixtures. */
async function createTestEmroute(
  spa: 'none' | 'leaf' | 'root' | 'only' = 'root',
): Promise<Emroute> {
  const runtime = new BunFsRuntime(FIXTURES_DIR, runtimeConfig);

  // Build client bundles for modes that need them
  if (spa === 'root' || spa === 'only' || spa === 'leaf') {
    await buildClientBundles({
      runtime,
      root: resolve(FIXTURES_DIR),
      spa,
    });
  }

  // Add external widget to the manifest (lives outside widgetsDir)
  await appendWidgetManifestEntry(runtime, {
    name: 'external',
    modulePath: '/assets/external.widget.ts',
    tagName: 'widget-external',
  });

  return await Emroute.create({
    spa,
    title: 'Test App',
  }, runtime);
}

/** Append a widget entry to the manifest without overwriting existing entries. */
async function appendWidgetManifestEntry(
  runtime: BunFsRuntime,
  entry: WidgetManifestEntry,
): Promise<void> {
  const res = await runtime.query(WIDGETS_MANIFEST_PATH);
  const entries: WidgetManifestEntry[] = res.ok ? await res.json() : [];
  if (!entries.some((e) => e.name === entry.name)) {
    entries.push(entry);
    entries.sort((a, b) => a.name.localeCompare(b.name));
    await runtime.command(WIDGETS_MANIFEST_PATH, { body: JSON.stringify(entries) });
  }
}

// Shared server instances — created once in setup, reused across all tests.
const serverCache: Partial<Record<string, Emroute>> = {};
let ready: Promise<void>;

async function getServer(mode: 'none' | 'leaf' | 'root' | 'only' = 'root'): Promise<Emroute> {
  await ready;
  return serverCache[mode]!;
}

// ── Setup ─────────────────────────────────────────────────────────────

describe('prod server', () => {
  beforeAll(async () => {
    ready = (async () => {
      for (const mode of ['none', 'leaf', 'root', 'only'] as const) {
        serverCache[mode] = await createTestEmroute(mode);
      }
    })();
    await ready;
  });

  test('setup - create servers for all modes', async () => {
    const server = await getServer('root');
    expect(server.htmlRenderer !== null).toBeTruthy();
    expect(server.mdRenderer !== null).toBeTruthy();
  });

  test('createEmroute - only mode has null renderers', async () => {
    const server = await getServer('only');
    expect(server.htmlRenderer).toEqual(null);
    expect(server.mdRenderer).toEqual(null);
  });

  // ── None mode ────────────────────────────────────────────────────────

  test('none mode - has SSR routers', async () => {
    const server = await getServer('none');
    expect(server.htmlRenderer).not.toEqual(null);
    expect(server.mdRenderer).not.toEqual(null);
  });

  test('none mode - SSR HTML renders content', async () => {
    const server = await getServer('none');
    const response = await server.handleRequest(req('/html'));
    const html = await response!.text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<router-slot');
    expect(html).toContain('data-ssr-route');
  });

  // ── Only mode — no SSR ──────────────────────────────────────────────

  test('only mode - /html/* redirects to /app/*', async () => {
    const server = await getServer('only');
    const response = await server.handleRequest(req('/html/about'));
    expect(response!.status).toEqual(302);
    expect(response!.headers.get('Location') ?? '').toContain('/app/about');
  });

  test('only mode - /md/* redirects to /app/*', async () => {
    const server = await getServer('only');
    const response = await server.handleRequest(req('/md'));
    expect(response!.status).toEqual(302);
    expect(response!.headers.get('Location') ?? '').toContain('/app/');
  });

  // ── Manifest resolution ─────────────────────────────────────────────

  test('createEmroute - exposes shell', async () => {
    const server = await getServer('root');
    expect(server.shell).toContain('<!DOCTYPE html>');
    expect(server.shell).toContain('<router-slot>');
  });

  test('shell contains emroute base import map entries', async () => {
    const server = await getServer('root');
    expect(server.shell).toContain('@emkodev/emroute/spa');
    expect(server.shell).toContain('/emroute.js');
  });

  test('shell contains user importmap.json entries', async () => {
    const server = await getServer('root');
    expect(server.shell).toContain('@emkodev/emkoma/');
    expect(server.shell).toContain('test-lib');
    expect(server.shell).toContain('/vendor/test-lib.js');
  });

  // ── SSR HTML ───────────────────────────────────────────────────────────

  test('handleRequest - SSR HTML renders /html', async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/html'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(200);

    const html = await response!.text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<router-slot');
    expect(html).toContain('data-ssr-route="/html"');
  });

  test('handleRequest - SSR HTML renders /html/about', async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/html/about'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(200);

    const html = await response!.text();
    expect(html).toContain('<!DOCTYPE html>');
  });

  test('handleRequest - SSR HTML returns correct content-type', async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/html'));

    expect(response!.headers.get('Content-Type')).toEqual('text/html; charset=utf-8');
  });

  test('handleRequest - SSR HTML 404 for unknown route', async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/html/nonexistent'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(404);
  });

  test('handleRequest - SSR HTML trailing slash redirects', async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/html/about/'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(301);
  });

  // ── SSR Markdown ───────────────────────────────────────────────────────

  test('handleRequest - SSR Markdown renders /md', async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/md'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(200);
    expect(
      response!.headers.get('Content-Type'),
    ).toEqual('text/markdown; charset=utf-8; variant=CommonMark');
  });

  test('handleRequest - SSR Markdown 404', async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/md/nonexistent'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(404);
  });

  // ── Bare paths ─────────────────────────────────────────────────────────

  test('handleRequest - bare / redirects to /html/ in none mode', async () => {
    const server = await getServer('none');
    const response = await server.handleRequest(req('/'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(302);
    expect(response!.headers.get('Location') ?? '').toContain('/html/');
  });

  test('handleRequest - bare /about redirects to /html/about in none mode', async () => {
    const server = await getServer('none');
    const response = await server.handleRequest(req('/about'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(302);
    expect(response!.headers.get('Location') ?? '').toContain('/html/about');
  });

  test('handleRequest - bare / redirects to /app/ in root mode', async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(302);
    expect(response!.headers.get('Location') ?? '').toContain('/app/');
  });

  test('handleRequest - bare / redirects to /app/ in only mode', async () => {
    const server = await getServer('only');
    const response = await server.handleRequest(req('/'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(302);
    expect(response!.headers.get('Location') ?? '').toContain('/app/');
  });

  test('handleRequest - bare /about redirects to /app/about in root mode', async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/about'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(302);
    expect(response!.headers.get('Location') ?? '').toContain('/app/about');
  });

  // ── File requests ──────────────────────────────────────────────────────

  test('handleRequest - serves bundled emroute.js', async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/emroute.js'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(200);
    expect(response!.headers.get('Content-Type')).toEqual('application/javascript; charset=utf-8');
  });

  test('handleRequest - serves bundled app.js', async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/app.js'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(200);
    expect(response!.headers.get('Content-Type')).toEqual('application/javascript; charset=utf-8');
  });

  test('handleRequest - nonexistent file returns null', async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/nonexistent.js'));

    expect(response).toEqual(null);
  });

  // ── Only mode ──────────────────────────────────────────────────────────

  test('handleRequest - only mode serves shell for /app/*', async () => {
    const server = await getServer('only');
    const response = await server.handleRequest(req('/app/about'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(200);

    const html = await response!.text();
    expect(html).toContain('<router-slot>');
  });

  // ── Leaf mode ──────────────────────────────────────────────────────────

  test('handleRequest - leaf mode redirects / to /html/', async () => {
    const server = await getServer('leaf');
    const response = await server.handleRequest(req('/'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(302);
    expect(response!.headers.get('Location') ?? '').toContain('/html/');
  });

  test('handleRequest - leaf mode redirects /about to /html/about', async () => {
    const server = await getServer('leaf');
    const response = await server.handleRequest(req('/about'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(302);
    expect(response!.headers.get('Location') ?? '').toContain('/html/about');
  });
});
