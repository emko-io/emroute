/**
 * Browser Test Setup — Shared Factory
 *
 * Provides factory functions for creating test servers and browsers.
 * Each test file creates its own server instance with a specific SPA mode and port.
 */

import { createEmrouteServer } from '../../../server/emroute.server.ts';
import { buildClientBundles } from '../../../server/build.util.ts';
import { BunFsRuntime } from '../../../runtime/bun/fs/bun-fs.runtime.ts';
import type { RuntimeConfig } from '../../../runtime/abstract.runtime.ts';

import { WidgetRegistry } from '../../../src/widget/widget.registry.ts';
import type { MarkdownRenderer } from '../../../src/type/markdown.type.ts';
import { renderMarkdown } from '@emkodev/emkoma/render';
import { externalWidget } from '../fixtures/assets/external.widget.ts';
import type { SpaMode } from '../../../src/type/widget.type.ts';

import { resolve } from 'node:path';
import { type Browser, chromium, type Page } from 'playwright';

const FIXTURES_DIR = 'test/browser/fixtures';

export interface TestServer {
  server: { stop(): void };
  stop(): void;
  baseUrl(path?: string): string;
}

export async function createTestServer(options: {
  mode: SpaMode;
  port: number;
}): Promise<TestServer> {
  const { mode, port } = options;

  const runtimeConfig: RuntimeConfig = {
    routesDir: '/routes',
    widgetsDir: '/widgets',
  };

  // Create runtime with config (auto-discovers routes + widgets manifests)
  const runtime = new BunFsRuntime(FIXTURES_DIR, runtimeConfig);

  // Build client bundles for modes that need them
  if (mode === 'root' || mode === 'only' || mode === 'leaf') {
    await buildClientBundles({
      runtime,
      root: resolve(FIXTURES_DIR),
      spa: mode,
    });
  }

  // Server-side markdown renderer via emkoma
  const markdownRenderer: MarkdownRenderer = { render: renderMarkdown };

  // Manual widget registry for widgets outside widgetsDir (e.g. external/vendor)
  const manualWidgets = new WidgetRegistry();
  manualWidgets.add(externalWidget);

  // Create emroute server (reads manifests from runtime)
  const emroute = await createEmrouteServer({
    widgets: manualWidgets,
    markdownRenderer,
    spa: mode,
  }, runtime);

  // Serve
  const server = Bun.serve({ port, fetch: async (req) => {
    return await emroute.handleRequest(req) ?? new Response('Not Found', { status: 404 });
  }});

  return {
    server,
    stop() {
      server.stop();
    },
    baseUrl(path = '/') {
      return `http://localhost:${port}${path}`;
    },
  };
}

export interface TestBrowser {
  browser: Browser;
  close(): Promise<void>;
  newPage(): Promise<Page>;
}

export async function createTestBrowser(): Promise<TestBrowser> {
  const browser = await chromium.launch();
  return {
    browser,
    async close() {
      await browser.close();
    },
    async newPage() {
      return await browser.newPage();
    },
  };
}
