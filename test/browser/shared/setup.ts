/**
 * Browser Test Setup — Shared Factory
 *
 * Provides factory functions for creating test servers and browsers.
 * Each test file creates its own server instance with a specific SPA mode and port.
 */

import { Emroute } from '../../../server/emroute.server.ts';
import { buildClientBundles } from '../../../server/build.util.ts';
import { BunFsRuntime } from '../../../runtime/bun/fs/bun-fs.runtime.ts';
import type { RuntimeConfig } from '../../../runtime/abstract.runtime.ts';

import { WidgetRegistry } from '../../../core/widget/widget.registry.ts';
import type { MarkdownRenderer } from '../../../core/type/markdown.type.ts';
import { renderMarkdown } from '@emkodev/emkoma/render';
import { externalWidget } from '../fixtures/assets/external.widget.ts';
import type { SpaMode } from '../../../core/type/widget.type.ts';

import { resolve, join } from 'node:path';
import { unlink, cp } from 'node:fs/promises';
import { type Browser, chromium, type Page } from 'playwright';

const FIXTURES_DIR = 'test/browser/fixtures';

const runtimeConfig: RuntimeConfig = {
  routesDir: '/routes',
  widgetsDir: '/widgets',
};

/** One-time setup: clean manifests, copy vendor deps, run initial build. */
let setupPromise: Promise<void> | null = null;

function ensureSetup(): Promise<void> {
  if (!setupPromise) {
    setupPromise = (async () => {
      // Remove stale manifests so the runtime re-scans from .ts sources
      const manifests = ['routes.manifest.json', 'widgets.manifest.json', 'elements.manifest.json'];
      await Promise.all(manifests.map((f) => unlink(`${FIXTURES_DIR}/${f}`).catch(() => {})));

      // Copy emkoma dist into fixtures so browser import map resolves locally
      const emkomaDistSrc = join('node_modules', '@emkodev', 'emkoma', 'dist');
      const emkomaDest = join(FIXTURES_DIR, 'vendor', 'emkoma');
      await cp(emkomaDistSrc, emkomaDest, { recursive: true, force: true });

      // Initial build to create .js modules and manifests
      const runtime = new BunFsRuntime(FIXTURES_DIR, runtimeConfig);
      await buildClientBundles({
        runtime,
        root: resolve(FIXTURES_DIR),
        spa: 'only',
      });
    })();
  }
  return setupPromise;
}

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

  await ensureSetup();

  // Create runtime with config (reads already-built manifests)
  const runtime = new BunFsRuntime(FIXTURES_DIR, runtimeConfig);

  // Build mode-specific bundles (emroute.js, app.js, import map)
  await buildClientBundles({
    runtime,
    root: resolve(FIXTURES_DIR),
    spa: mode,
  });

  // Server-side markdown renderer via emkoma
  const markdownRenderer: MarkdownRenderer = { render: renderMarkdown };

  // Manual widget registry for widgets outside widgetsDir (e.g. external/vendor)
  const manualWidgets = new WidgetRegistry();
  manualWidgets.add(externalWidget);

  // Create emroute server (reads manifests from runtime)
  const emroute = await Emroute.create({
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
