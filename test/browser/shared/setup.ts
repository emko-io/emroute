/**
 * Browser Test Setup — Shared Factory
 *
 * Provides factory functions for creating test servers and browsers.
 * Each test file creates its own server instance with a specific SPA mode and port.
 */

import { createEmrouteServer } from '../../../server/emroute.server.ts';
import { BunFsRuntime } from '../../../runtime/bun/fs/bun-fs.runtime.ts';
import {
  type RuntimeConfig,
} from '../../../runtime/abstract.runtime.ts';

import { WidgetRegistry } from '../../../src/widget/widget.registry.ts';
import type { MarkdownRenderer } from '../../../src/type/markdown.type.ts';
// @ts-types="../../../server/vendor/emko-md.vendor.d.ts"
import { createMarkdownRender } from '../../../server/vendor/emko-md.vendor.js';
import { externalWidget } from '../fixtures/assets/external.widget.ts';
import type { SpaMode } from '../../../src/type/widget.type.ts';

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
  entryPoint?: string;
}): Promise<TestServer> {
  const { mode, port, entryPoint: customEntry } = options;

  // Consumer main.ts creates the SPA router — only use it for modes that need routing.
  const defaultEntry = (mode === 'root' || mode === 'only') ? 'main.ts' : undefined;
  const entryPoint = customEntry ?? defaultEntry;

  const runtimeConfig: RuntimeConfig = {
    routesDir: '/routes',
    widgetsDir: '/widgets',
  };

  if (entryPoint) {
    runtimeConfig.entryPoint = `/${entryPoint}`;
  }

  // Create runtime with config (auto-discovers routes + widgets manifests)
  const runtime = new BunFsRuntime(FIXTURES_DIR, runtimeConfig);

  // Create server-side emko-md renderer
  const markdownRenderer: MarkdownRenderer = { render: createMarkdownRender() };

  // Manual widget registry for widgets outside widgetsDir (e.g. external/vendor)
  const manualWidgets = new WidgetRegistry();
  manualWidgets.add(externalWidget);

  // Create emroute server (reads manifests from runtime, bundles via virtual plugin)
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
