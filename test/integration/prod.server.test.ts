/**
 * Emroute Server Tests
 *
 * Smoke tests for createEmrouteServer using the browser test fixtures.
 * Verifies the full pipeline: route discovery → manifest writing →
 * SSR rendering → handleRequest.
 */

import { assertEquals, assertStringIncludes } from '@std/assert';
import { createEmrouteServer } from '../../server/prod.server.ts';
import { denoServerRuntime } from '../../server/server.deno.ts';
import { WidgetRegistry } from '../../src/widget/widget.registry.ts';
import { externalWidget } from '../browser/fixtures/assets/external.widget.ts';
import type { EmrouteServer } from '../../server/server-api.type.ts';

const FIXTURES_DIR = 'test/browser/fixtures';

const TEST_PERMISSIONS: Deno.TestDefinition['permissions'] = {
  read: true,
  write: true,
  env: true,
  net: true,
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
    appRoot: FIXTURES_DIR,
    routesDir: `${FIXTURES_DIR}/routes`,
    widgetsDir: `${FIXTURES_DIR}/widgets`,
    widgets: manualWidgets,
    spa,
    title: 'Test App',
  }, denoServerRuntime);
}

// ── Construction ───────────────────────────────────────────────────────

Deno.test({ name: 'createEmrouteServer - constructs with routesDir', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer();
  assertEquals(server.manifest.routes.length > 0, true);
  assertEquals(server.htmlRouter !== null, true);
  assertEquals(server.mdRouter !== null, true);
}});

Deno.test({ name: 'createEmrouteServer - only mode has null routers', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer('only');
  assertEquals(server.htmlRouter, null);
  assertEquals(server.mdRouter, null);
}});

Deno.test({ name: 'createEmrouteServer - throws without routesDir or manifest', permissions: TEST_PERMISSIONS, fn: async () => {
  try {
    await createEmrouteServer({ appRoot: FIXTURES_DIR }, denoServerRuntime);
    throw new Error('Should have thrown');
  } catch (e) {
    assertStringIncludes((e as Error).message, 'routesDir or routesManifest');
  }
}});

// ── Manifest writing ──────────────────────────────────────────────────

Deno.test({ name: 'createEmrouteServer - writes routes manifest file', permissions: TEST_PERMISSIONS, fn: async () => {
  await createTestEmrouteServer();
  const content = await Deno.readTextFile(`${FIXTURES_DIR}/routes.manifest.g.ts`);
  assertStringIncludes(content, 'routesManifest');
  assertStringIncludes(content, 'pattern:');
}});

Deno.test({ name: 'createEmrouteServer - writes widgets manifest file', permissions: TEST_PERMISSIONS, fn: async () => {
  await createTestEmrouteServer();
  const content = await Deno.readTextFile(`${FIXTURES_DIR}/widgets.manifest.g.ts`);
  assertStringIncludes(content, 'widgetsManifest');
}});

Deno.test({ name: 'createEmrouteServer - exposes widgetEntries', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer();
  assertEquals(server.widgetEntries.length > 0, true);
  assertEquals(typeof server.widgetEntries[0].name, 'string');
  assertEquals(typeof server.widgetEntries[0].tagName, 'string');
}});

Deno.test({ name: 'createEmrouteServer - exposes shell', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer();
  assertStringIncludes(server.shell, '<!DOCTYPE html>');
  assertStringIncludes(server.shell, '<router-slot>');
}});

// ── SSR HTML ───────────────────────────────────────────────────────────

Deno.test({ name: 'handleRequest - SSR HTML renders /html', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer();
  const response = await server.handleRequest(req('/html'));

  assertEquals(response !== null, true);
  assertEquals(response!.status, 200);

  const html = await response!.text();
  assertStringIncludes(html, '<!DOCTYPE html>');
  assertStringIncludes(html, '<router-slot');
  assertStringIncludes(html, 'data-ssr-route="/html"');
}});

Deno.test({ name: 'handleRequest - SSR HTML renders /html/about', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer();
  const response = await server.handleRequest(req('/html/about'));

  assertEquals(response !== null, true);
  assertEquals(response!.status, 200);

  const html = await response!.text();
  assertStringIncludes(html, '<!DOCTYPE html>');
}});

Deno.test({ name: 'handleRequest - SSR HTML returns correct content-type', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer();
  const response = await server.handleRequest(req('/html'));

  assertEquals(response!.headers.get('Content-Type'), 'text/html; charset=utf-8');
}});

Deno.test({ name: 'handleRequest - SSR HTML 404 for unknown route', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer();
  const response = await server.handleRequest(req('/html/nonexistent'));

  assertEquals(response !== null, true);
  assertEquals(response!.status, 404);
}});

Deno.test({ name: 'handleRequest - SSR HTML trailing slash redirects', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer();
  const response = await server.handleRequest(req('/html/about/'));

  assertEquals(response !== null, true);
  assertEquals(response!.status, 301);
}});

// ── SSR Markdown ───────────────────────────────────────────────────────

Deno.test({ name: 'handleRequest - SSR Markdown renders /md', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer();
  const response = await server.handleRequest(req('/md'));

  assertEquals(response !== null, true);
  assertEquals(response!.status, 200);
  assertEquals(
    response!.headers.get('Content-Type'),
    'text/markdown; charset=utf-8; variant=CommonMark',
  );
}});

Deno.test({ name: 'handleRequest - SSR Markdown 404', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer();
  const response = await server.handleRequest(req('/md/nonexistent'));

  assertEquals(response !== null, true);
  assertEquals(response!.status, 404);
}});

// ── Bare paths ─────────────────────────────────────────────────────────

Deno.test({ name: 'handleRequest - bare / redirects to /html/ in none mode', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer('none');
  const response = await server.handleRequest(req('/'));

  assertEquals(response !== null, true);
  assertEquals(response!.status, 302);
  assertStringIncludes(response!.headers.get('Location') ?? '', '/html/');
}});

Deno.test({ name: 'handleRequest - bare /about redirects to /html/about in none mode', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer('none');
  const response = await server.handleRequest(req('/about'));

  assertEquals(response !== null, true);
  assertEquals(response!.status, 302);
  assertStringIncludes(response!.headers.get('Location') ?? '', '/html/about');
}});

Deno.test({ name: 'handleRequest - bare / redirects to /html/ in root mode', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer('root');
  const response = await server.handleRequest(req('/'));

  assertEquals(response !== null, true);
  assertEquals(response!.status, 302);
  assertStringIncludes(response!.headers.get('Location') ?? '', '/html/');
}});

Deno.test({ name: 'handleRequest - bare / redirects to /html/ in only mode', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer('only');
  const response = await server.handleRequest(req('/'));

  assertEquals(response !== null, true);
  assertEquals(response!.status, 302);
  assertStringIncludes(response!.headers.get('Location') ?? '', '/html/');
}});

// ── File requests ──────────────────────────────────────────────────────

Deno.test({ name: 'handleRequest - returns null for file requests', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer();
  const response = await server.handleRequest(req('/main.js'));

  assertEquals(response, null);
}});

Deno.test({ name: 'handleRequest - returns null for CSS requests', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer();
  const response = await server.handleRequest(req('/main.css'));

  assertEquals(response, null);
}});

// ── Only mode ──────────────────────────────────────────────────────────

Deno.test({ name: 'handleRequest - only mode skips SSR for /html/*', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer('only');
  const response = await server.handleRequest(req('/html/about'));

  assertEquals(response !== null, true);
  assertEquals(response!.status, 200);

  const html = await response!.text();
  assertStringIncludes(html, '<router-slot></router-slot>');
}});

// ── Leaf mode ──────────────────────────────────────────────────────────

Deno.test({ name: 'handleRequest - leaf mode redirects / to /html/', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer('leaf');
  const response = await server.handleRequest(req('/'));

  assertEquals(response !== null, true);
  assertEquals(response!.status, 302);
  assertStringIncludes(response!.headers.get('Location') ?? '', '/html/');
}});

Deno.test({ name: 'handleRequest - leaf mode redirects /about to /html/about', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer('leaf');
  const response = await server.handleRequest(req('/about'));

  assertEquals(response !== null, true);
  assertEquals(response!.status, 302);
  assertStringIncludes(response!.headers.get('Location') ?? '', '/html/about');
}});

// ── Rebuild ────────────────────────────────────────────────────────────

Deno.test({ name: 'rebuild - re-discovers routes and rewrites manifests', permissions: TEST_PERMISSIONS, fn: async () => {
  const server = await createTestEmrouteServer();
  const routeCountBefore = server.manifest.routes.length;

  await server.rebuild();

  assertEquals(server.manifest.routes.length, routeCountBefore);

  // Verify manifest files still exist after rebuild
  const routesContent = await Deno.readTextFile(`${FIXTURES_DIR}/routes.manifest.g.ts`);
  assertStringIncludes(routesContent, 'routesManifest');
}});
