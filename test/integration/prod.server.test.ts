/**
 * Emroute Server Tests
 *
 * Smoke tests for createEmrouteServer using the browser test fixtures.
 * Verifies the full pipeline: route discovery → manifest writing →
 * bundling → SSR rendering → handleRequest.
 */

import { assertEquals, assertStringIncludes } from '@std/assert';
import { createEmrouteServer } from '../../server/emroute.server.ts';
import { DenoFsRuntime } from '../../runtime/deno/fs/deno-fs.runtime.ts';
import { WidgetRegistry } from '../../src/widget/widget.registry.ts';
import { externalWidget } from '../browser/fixtures/assets/external.widget.ts';
import type { EmrouteServer } from '../../server/server-api.type.ts';

const FIXTURES_DIR = 'test/browser/fixtures';
const runtime = new DenoFsRuntime(FIXTURES_DIR);
const APP_ROOT = `${Deno.cwd()}/${FIXTURES_DIR}`;

const TEST_PERMISSIONS: Deno.TestDefinition['permissions'] = {
  read: true,
  write: true,
  env: true,
  net: true,
  run: true,
};

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

Deno.test({
  name: 'setup - create servers for all modes',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    ready = (async () => {
      for (const mode of ['none', 'leaf', 'root', 'only'] as const) {
        serverCache[mode] = await createTestEmrouteServer(mode);
      }
    })();
    await ready;

    const server = serverCache['root']!;
    assertEquals(server.manifest.routes.length > 0, true);
    assertEquals(server.htmlRouter !== null, true);
    assertEquals(server.mdRouter !== null, true);
  },
});

Deno.test({
  name: 'createEmrouteServer - only mode has null routers',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('only');
    assertEquals(server.htmlRouter, null);
    assertEquals(server.mdRouter, null);
  },
});

// ── Manifest writing ──────────────────────────────────────────────────

Deno.test({
  name: 'createEmrouteServer - writes routes manifest file',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    await getServer('root');
    const content = await Deno.readTextFile(`${FIXTURES_DIR}/routes.manifest.g.ts`);
    assertStringIncludes(content, 'routesManifest');
    assertStringIncludes(content, 'pattern:');
  },
});

Deno.test({
  name: 'createEmrouteServer - writes widgets manifest file',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    await getServer('root');
    const content = await Deno.readTextFile(`${FIXTURES_DIR}/widgets.manifest.g.ts`);
    assertStringIncludes(content, 'widgetsManifest');
  },
});

Deno.test({
  name: 'createEmrouteServer - exposes widgetEntries',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('root');
    assertEquals(server.widgetEntries.length > 0, true);
    assertEquals(typeof server.widgetEntries[0].name, 'string');
    assertEquals(typeof server.widgetEntries[0].tagName, 'string');
  },
});

Deno.test({
  name: 'createEmrouteServer - exposes shell with import map and script tag',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('root');
    assertStringIncludes(server.shell, '<!DOCTYPE html>');
    assertStringIncludes(server.shell, '<router-slot>');
    assertStringIncludes(server.shell, '<script type="importmap">');
    assertStringIncludes(server.shell, '@emkodev/emroute/spa');
    assertStringIncludes(server.shell, '<script type="module" src="/app.js">');
  },
});

// ── SSR HTML ───────────────────────────────────────────────────────────

Deno.test({
  name: 'handleRequest - SSR HTML renders /html',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/html'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 200);

    const html = await response!.text();
    assertStringIncludes(html, '<!DOCTYPE html>');
    assertStringIncludes(html, '<router-slot');
    assertStringIncludes(html, 'data-ssr-route="/html"');
  },
});

Deno.test({
  name: 'handleRequest - SSR HTML renders /html/about',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/html/about'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 200);

    const html = await response!.text();
    assertStringIncludes(html, '<!DOCTYPE html>');
  },
});

Deno.test({
  name: 'handleRequest - SSR HTML returns correct content-type',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/html'));

    assertEquals(response!.headers.get('Content-Type'), 'text/html; charset=utf-8');
  },
});

Deno.test({
  name: 'handleRequest - SSR HTML 404 for unknown route',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/html/nonexistent'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 404);
  },
});

Deno.test({
  name: 'handleRequest - SSR HTML trailing slash redirects',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/html/about/'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 301);
  },
});

// ── SSR Markdown ───────────────────────────────────────────────────────

Deno.test({
  name: 'handleRequest - SSR Markdown renders /md',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/md'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 200);
    assertEquals(
      response!.headers.get('Content-Type'),
      'text/markdown; charset=utf-8; variant=CommonMark',
    );
  },
});

Deno.test({
  name: 'handleRequest - SSR Markdown 404',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/md/nonexistent'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 404);
  },
});

// ── Bare paths ─────────────────────────────────────────────────────────

Deno.test({
  name: 'handleRequest - bare / redirects to /html/ in none mode',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('none');
    const response = await server.handleRequest(req('/'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 302);
    assertStringIncludes(response!.headers.get('Location') ?? '', '/html/');
  },
});

Deno.test({
  name: 'handleRequest - bare /about redirects to /html/about in none mode',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('none');
    const response = await server.handleRequest(req('/about'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 302);
    assertStringIncludes(response!.headers.get('Location') ?? '', '/html/about');
  },
});

Deno.test({
  name: 'handleRequest - bare / serves SPA shell in root mode',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 200);
    assertStringIncludes(await response!.text(), '<!DOCTYPE html>');
  },
});

Deno.test({
  name: 'handleRequest - bare / serves SPA shell in only mode',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('only');
    const response = await server.handleRequest(req('/'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 200);
    assertStringIncludes(await response!.text(), '<!DOCTYPE html>');
  },
});

Deno.test({
  name: 'handleRequest - bare /about serves SPA shell in root mode',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/about'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 200);
    assertStringIncludes(await response!.text(), '<!DOCTYPE html>');
  },
});

// ── File requests ──────────────────────────────────────────────────────

Deno.test({
  name: 'handleRequest - serves bundled emroute.js',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/emroute.js'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 200);
    assertEquals(response!.headers.get('Content-Type'), 'application/javascript; charset=utf-8');
  },
});

Deno.test({
  name: 'handleRequest - serves bundled app.js',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/app.js'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 200);
    assertEquals(response!.headers.get('Content-Type'), 'application/javascript; charset=utf-8');
  },
});

Deno.test({
  name: 'handleRequest - returns null for nonexistent files',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('root');
    const response = await server.handleRequest(req('/nonexistent.js'));

    assertEquals(response, null);
  },
});

// ── Only mode ──────────────────────────────────────────────────────────

Deno.test({
  name: 'handleRequest - only mode serves shell for /html/*',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('only');
    const response = await server.handleRequest(req('/html/about'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 200);

    const html = await response!.text();
    assertStringIncludes(html, '<router-slot>');
    // Only mode has no SSR content — slot is empty
    assertStringIncludes(html, '<script type="importmap">');
  },
});

// ── Leaf mode ──────────────────────────────────────────────────────────

Deno.test({
  name: 'handleRequest - leaf mode redirects / to /html/',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('leaf');
    const response = await server.handleRequest(req('/'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 302);
    assertStringIncludes(response!.headers.get('Location') ?? '', '/html/');
  },
});

Deno.test({
  name: 'handleRequest - leaf mode redirects /about to /html/about',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('leaf');
    const response = await server.handleRequest(req('/about'));

    assertEquals(response !== null, true);
    assertEquals(response!.status, 302);
    assertStringIncludes(response!.headers.get('Location') ?? '', '/html/about');
  },
});

// ── Rebuild ────────────────────────────────────────────────────────────

Deno.test({
  name: 'rebuild - re-discovers routes and rewrites manifests',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const server = await getServer('root');
    const routeCountBefore = server.manifest.routes.length;

    await server.rebuild();

    assertEquals(server.manifest.routes.length, routeCountBefore);

    // Verify manifest files still exist after rebuild
    const routesContent = await Deno.readTextFile(`${FIXTURES_DIR}/routes.manifest.g.ts`);
    assertStringIncludes(routesContent, 'routesManifest');
  },
});
