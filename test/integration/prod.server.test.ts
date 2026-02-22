/**
 * Emroute Server Tests
 *
 * Smoke tests for createEmrouteServer using the browser test fixtures.
 * Verifies the full pipeline: route discovery → manifest writing →
 * bundling → SSR rendering → handleRequest.
 */

import { test, expect, describe, beforeAll } from 'bun:test';
import { createEmrouteServer } from '../../server/emroute.server.ts';
import { BunFsRuntime } from '../../runtime/bun/fs/bun-fs.runtime.ts';
import { WidgetRegistry } from '../../src/widget/widget.registry.ts';
import { externalWidget } from '../browser/fixtures/assets/external.widget.ts';
import type { EmrouteServer } from '../../server/server-api.type.ts';

const FIXTURES_DIR = 'test/browser/fixtures';
const runtime = new BunFsRuntime(FIXTURES_DIR);
const APP_ROOT = `${process.cwd()}/${FIXTURES_DIR}`;

/** Create a request to the server. */
function req(path: string): Request {
  return new Request(`http://localhost${path}`);
}

/** Create emroute server with test fixtures. */
async function createTestEmrouteServer(
  spa: 'none' | 'leaf' | 'root' | 'only' = 'root',
): Promise<EmrouteServer> {
  const manualWidgets = new WidgetRegistry();
  manualWidgets.add(externalWidget);

  return await createEmrouteServer({
    routesDir: 'routes',
    widgetsDir: 'widgets',
    widgets: manualWidgets,
    spa,
    title: 'Test App',
    moduleLoader: (path: string) => import(APP_ROOT + path),
  }, runtime);
}

// Shared server instances — created once in setup, reused across all tests.
const serverCache: Partial<Record<string, EmrouteServer>> = {};
let ready: Promise<void>;

async function getServer(mode: 'none' | 'leaf' | 'root' | 'only' = 'root'): Promise<EmrouteServer> {
  await ready;
  return serverCache[mode]!;
}

// ── Setup ─────────────────────────────────────────────────────────────

describe('prod server', () => {
  beforeAll(async () => {
    ready = (async () => {
      for (const mode of ['none', 'leaf', 'root', 'only'] as const) {
        serverCache[mode] = await createTestEmrouteServer(mode);
      }
    })();
    await ready;
  });

  test('setup - create servers for all modes', async () => {
    const server = await getServer('root');
    expect(server.manifest.routes.length > 0).toBeTruthy();
    expect(server.htmlRouter !== null).toBeTruthy();
    expect(server.mdRouter !== null).toBeTruthy();
  });

  test('createEmrouteServer - only mode has null routers', async () => {
    const server = await getServer('only');
    expect(server.htmlRouter).toEqual(null);
    expect(server.mdRouter).toEqual(null);
  });

  // ── Manifest writing ──────────────────────────────────────────────────

  test('createEmrouteServer - writes routes manifest file', async () => {
    await getServer('root');
    const content = await Bun.file(`${FIXTURES_DIR}/routes.manifest.g.ts`).text();
    expect(content).toContain('routesManifest');
    expect(content).toContain('pattern:');
  });

  test('createEmrouteServer - writes widgets manifest file', async () => {
    await getServer('root');
    const content = await Bun.file(`${FIXTURES_DIR}/widgets.manifest.g.ts`).text();
    expect(content).toContain('widgetsManifest');
  });

  test('createEmrouteServer - exposes widgetEntries', async () => {
    const server = await getServer('root');
    expect(server.widgetEntries.length > 0).toBeTruthy();
    expect(typeof server.widgetEntries[0].name).toEqual('string');
    expect(typeof server.widgetEntries[0].tagName).toEqual('string');
  });

  test('createEmrouteServer - exposes shell with import map and script tag', async () => {
    const server = await getServer('root');
    expect(server.shell).toContain('<!DOCTYPE html>');
    expect(server.shell).toContain('<router-slot>');
    expect(server.shell).toContain('<script type="importmap">');
    expect(server.shell).toContain('@emkodev/emroute/spa');
    expect(server.shell).toContain('<script type="module" src="/app.js">');
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

  test('handleRequest - bare / serves SPA shell in root mode', async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(200);
    expect(await response!.text()).toContain('<!DOCTYPE html>');
  });

  test('handleRequest - bare / serves SPA shell in only mode', async () => {
    const server = await getServer('only');
    const response = await server.handleRequest(req('/'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(200);
    expect(await response!.text()).toContain('<!DOCTYPE html>');
  });

  test('handleRequest - bare /about serves SPA shell in root mode', async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/about'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(200);
    expect(await response!.text()).toContain('<!DOCTYPE html>');
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

  test('handleRequest - returns null for nonexistent files', async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/nonexistent.js'));

    expect(response).toEqual(null);
  });

  // ── Only mode ──────────────────────────────────────────────────────────

  test('handleRequest - only mode serves shell for /html/*', async () => {
    const server = await getServer('only');
    const response = await server.handleRequest(req('/html/about'));

    expect(response !== null).toBeTruthy();
    expect(response!.status).toEqual(200);

    const html = await response!.text();
    expect(html).toContain('<router-slot>');
    // Only mode has no SSR content — slot is empty
    expect(html).toContain('<script type="importmap">');
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

  // ── Rebuild ────────────────────────────────────────────────────────────

  test('rebuild - re-discovers routes and rewrites manifests', async () => {
    const server = await getServer('root');
    const routeCountBefore = server.manifest.routes.length;

    await server.rebuild();

    expect(server.manifest.routes.length).toEqual(routeCountBefore);

    // Verify manifest files still exist after rebuild
    const routesContent = await Bun.file(`${FIXTURES_DIR}/routes.manifest.g.ts`).text();
    expect(routesContent).toContain('routesManifest');
  });
});
