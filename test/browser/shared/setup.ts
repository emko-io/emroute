/**
 * Browser Test Setup — Shared Factory
 *
 * Provides factory functions for creating test servers and browsers.
 * Each test file creates its own server instance with a specific SPA mode and port.
 */

import { createEmrouteServer, generateMainTs } from '../../../server/emroute.server.ts';
import { DenoFsRuntime } from '../../../server/runtime/deno/fs/deno-fs.runtime.ts';
import {
  generateManifestCode,
  generateRoutesManifest,
} from '../../../server/generator/route.generator.ts';
import { DEFAULT_BASE_PATH } from '../../../src/route/route.core.ts';
import { WidgetRegistry } from '../../../src/widget/widget.registry.ts';
import type { MarkdownRenderer } from '../../../src/type/markdown.type.ts';
import { AstRenderer, initParser, MarkdownParser } from 'jsr:@emkodev/emko-md@0.1.0-beta.4/parser';
import { externalWidget } from '../fixtures/assets/external.widget.ts';
import type { SpaMode } from '../../../src/type/widget.type.ts';

import { type Browser, chromium, type Page } from 'npm:playwright@1.58.2';

const FIXTURES_DIR = 'test/browser/fixtures';

export interface TestServer {
  server: Deno.HttpServer;
  stop(): void;
  baseUrl(path?: string): string;
}

export async function createTestServer(options: {
  mode: SpaMode;
  port: number;
  entryPoint?: string;
}): Promise<TestServer> {
  const { mode, port, entryPoint: customEntry } = options;

  const runtime = new DenoFsRuntime(FIXTURES_DIR);

  // Generate manifest from fixture route files (paths are Runtime-relative)
  const result = await generateRoutesManifest('/routes', runtime);

  // Write manifest for the bundler to pick up (with /html basePath for SPA patterns)
  const code = generateManifestCode(result, '@emkodev/emroute', DEFAULT_BASE_PATH.html);
  await runtime.command('/routes.manifest.g.ts', { body: code });

  // Create server-side module loaders for SSR (direct file:// imports, no transpile)
  const rootUrl = new URL(FIXTURES_DIR + '/', `file://${Deno.cwd()}/`);
  const moduleLoaders: Record<string, () => Promise<unknown>> = {};

  for (const route of result.routes) {
    if (route.files?.ts) {
      const fileUrl = new URL(route.files.ts.slice(1), rootUrl).href;
      moduleLoaders[route.files.ts] = () => import(fileUrl);
    }
    if (route.modulePath.endsWith('.ts')) {
      const fileUrl = new URL(route.modulePath.slice(1), rootUrl).href;
      moduleLoaders[route.modulePath] = () => import(fileUrl);
    }
  }
  for (const boundary of result.errorBoundaries) {
    const fileUrl = new URL(boundary.modulePath.slice(1), rootUrl).href;
    moduleLoaders[boundary.modulePath] = () => import(fileUrl);
  }
  if (result.errorHandler) {
    const fileUrl = new URL(result.errorHandler.modulePath.slice(1), rootUrl).href;
    moduleLoaders[result.errorHandler.modulePath] = () => import(fileUrl);
  }
  for (const [_, statusRoute] of result.statusPages) {
    if (statusRoute.modulePath.endsWith('.ts')) {
      const fileUrl = new URL(statusRoute.modulePath.slice(1), rootUrl).href;
      moduleLoaders[statusRoute.modulePath] = () => import(fileUrl);
    }
  }

  result.moduleLoaders = moduleLoaders;

  // Create server-side emko-md renderer
  const wasmUrl = new URL(
    '../fixtures/assets/emko_md_parser_bg.wasm',
    import.meta.url,
  );
  await initParser({ module_or_path: wasmUrl });
  const mdParser = new MarkdownParser();
  const astRenderer = new AstRenderer();
  const markdownRenderer: MarkdownRenderer = {
    render(markdown: string): string {
      mdParser.set_text(markdown);
      const ast = JSON.parse(mdParser.parse_to_json());
      return astRenderer.render(ast);
    },
  };

  // Manual widget registry for widgets outside widgetsDir (e.g. external/vendor)
  const manualWidgets = new WidgetRegistry();
  manualWidgets.add(externalWidget);

  // Consumer main.ts creates the SPA router — only use it for modes that need routing.
  // For 'none'/'leaf', let the server generate a mode-appropriate entry point.
  // A custom entryPoint overrides this logic (e.g. hash routing tests).
  const defaultEntry = (mode === 'root' || mode === 'only') ? 'main.ts' : undefined;
  const consumerEntry = customEntry ?? defaultEntry;

  // Generate entry point if needed
  let entryPointName: string | undefined;
  if (consumerEntry) {
    entryPointName = consumerEntry;
  } else if (mode !== 'none') {
    const hasRoutes = true;
    const hasWidgets = true;
    const mainCode = generateMainTs(mode, hasRoutes, hasWidgets, '@emkodev/emroute');
    entryPointName = '_main.g.ts';
    await runtime.command(`/${entryPointName}`, { body: mainCode });
  }

  // Create emroute server
  const emroute = await createEmrouteServer({
    routesManifest: result,
    widgetsDir: 'widgets',
    widgets: manualWidgets,
    entryPoint: entryPointName,
    markdownRenderer,
    spa: mode,
    baseUrl: `http://localhost:${port}`,
  }, runtime);

  // Serve — server transpiles .ts on-the-fly, no bundling needed
  const server = Deno.serve({ port, onListen() {} }, async (req) => {
    return await emroute.handleRequest(req) ?? new Response('Not Found', { status: 404 });
  });

  return {
    server,
    stop() {
      server.shutdown();
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
