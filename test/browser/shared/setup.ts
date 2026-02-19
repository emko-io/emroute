/**
 * Browser Test Setup — Shared Factory
 *
 * Provides factory functions for creating test servers and browsers.
 * Each test file creates its own server instance with a specific SPA mode and port.
 */

import { createEmrouteServer, generateMainTs } from '../../../server/emroute.server.ts';
import { denoServerRuntime } from '../../../server/server.deno.ts';
import { generateManifestCode, generateRoutesManifest } from '../../../server/generator/route.generator.ts';
import { DEFAULT_BASE_PATH } from '../../../src/route/route.core.ts';
import { WidgetRegistry } from '../../../src/widget/widget.registry.ts';
import type { MarkdownRenderer } from '../../../src/type/markdown.type.ts';
import type { ServerHandle } from '../../../server/server.type.ts';
import { AstRenderer, initParser, MarkdownParser } from 'jsr:@emkodev/emko-md@0.1.0-beta.4/parser';
import { externalWidget } from '../fixtures/assets/external.widget.ts';
import type { SpaMode } from '../../../src/type/widget.type.ts';

import { type Browser, chromium, type Page } from 'npm:playwright@1.58.2';

const FIXTURES_DIR = 'test/browser/fixtures';
const ROUTES_DIR = `${FIXTURES_DIR}/routes`;
const BUNDLE_DIR = '.build';

/**
 * Strip the fixtures directory prefix from generated paths.
 *
 * The route generator produces paths relative to CWD (e.g.
 * 'test/browser/fixtures/routes/index.page.md'), but the SPA router
 * fetches files relative to appRoot. Stripping the prefix makes paths
 * like 'routes/index.page.md' — correct for appRoot='test/browser/fixtures'.
 */
function stripPrefix(path: string): string {
  return path.startsWith(`${FIXTURES_DIR}/`) ? path.slice(FIXTURES_DIR.length + 1) : path;
}

export interface TestServer {
  handle: ServerHandle;
  bundleProcess?: { kill(): void };
  stop(): void;
  baseUrl(path?: string): string;
}

export async function createTestServer(options: {
  mode: SpaMode;
  port: number;
  watch?: boolean;
  entryPoint?: string;
}): Promise<TestServer> {
  const { mode, port, watch = false, entryPoint: customEntry } = options;

  // Generate manifest from fixture route files
  const result = await generateRoutesManifest(ROUTES_DIR, denoServerRuntime);

  // Normalize paths for the dev server's appRoot
  for (const route of result.routes) {
    route.modulePath = stripPrefix(route.modulePath);
    if (route.files) {
      if (route.files.ts) route.files.ts = stripPrefix(route.files.ts);
      if (route.files.html) route.files.html = stripPrefix(route.files.html);
      if (route.files.md) route.files.md = stripPrefix(route.files.md);
      if (route.files.css) route.files.css = stripPrefix(route.files.css);
    }
  }
  for (const [_, route] of result.statusPages) {
    route.modulePath = stripPrefix(route.modulePath);
    if (route.files) {
      if (route.files.ts) route.files.ts = stripPrefix(route.files.ts);
      if (route.files.html) route.files.html = stripPrefix(route.files.html);
      if (route.files.md) route.files.md = stripPrefix(route.files.md);
      if (route.files.css) route.files.css = stripPrefix(route.files.css);
    }
  }
  for (const boundary of result.errorBoundaries) {
    boundary.modulePath = stripPrefix(boundary.modulePath);
  }
  if (result.errorHandler) {
    result.errorHandler.modulePath = stripPrefix(result.errorHandler.modulePath);
  }

  // Write manifest for the bundler to pick up (with /html basePath for SPA patterns)
  const code = generateManifestCode(result, '@emkodev/emroute', DEFAULT_BASE_PATH.html);
  await Deno.writeTextFile(`${FIXTURES_DIR}/routes.manifest.g.ts`, code);

  // Create server-side module loaders for SSR
  const rootUrl = new URL(FIXTURES_DIR + '/', `file://${Deno.cwd()}/`);
  const moduleLoaders: Record<string, () => Promise<unknown>> = {};

  for (const route of result.routes) {
    if (route.files?.ts) {
      const fileUrl = new URL(route.files.ts, rootUrl).href;
      moduleLoaders[route.files.ts] = () => import(fileUrl);
    }
    if (route.modulePath.endsWith('.ts')) {
      const fileUrl = new URL(route.modulePath, rootUrl).href;
      moduleLoaders[route.modulePath] = () => import(fileUrl);
    }
  }
  for (const boundary of result.errorBoundaries) {
    const fileUrl = new URL(boundary.modulePath, rootUrl).href;
    moduleLoaders[boundary.modulePath] = () => import(fileUrl);
  }
  if (result.errorHandler) {
    const fileUrl = new URL(result.errorHandler.modulePath, rootUrl).href;
    moduleLoaders[result.errorHandler.modulePath] = () => import(fileUrl);
  }
  for (const [_, statusRoute] of result.statusPages) {
    if (statusRoute.modulePath.endsWith('.ts')) {
      const fileUrl = new URL(statusRoute.modulePath, rootUrl).href;
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
  let entryPoint: string | undefined;
  if (consumerEntry) {
    entryPoint = `${FIXTURES_DIR}/${consumerEntry}`;
  } else if (mode !== 'none') {
    const hasRoutes = true;
    const hasWidgets = true;
    const mainCode = generateMainTs(mode, hasRoutes, hasWidgets, '@emkodev/emroute');
    entryPoint = `${FIXTURES_DIR}/_main.g.ts`;
    await denoServerRuntime.writeTextFile(entryPoint, mainCode);
  }

  // Create emroute server
  const emroute = await createEmrouteServer({
    appRoot: FIXTURES_DIR,
    routesManifest: result,
    widgetsDir: `${FIXTURES_DIR}/widgets`,
    widgets: manualWidgets,
    markdownRenderer,
    spa: mode,
    baseUrl: `http://localhost:${port}`,
    responseHeaders: { 'Access-Control-Allow-Origin': '*' },
  }, denoServerRuntime);

  // Bundle (skip for 'none' mode)
  let bundleProcess: { kill(): void } | undefined;

  if (mode !== 'none' && entryPoint) {
    const bundleEntry = entryPoint.replace(/^\.\//, '');
    const bundleOutput = `${BUNDLE_DIR}/${bundleEntry.replace(/\.ts$/, '.js')}`;
    await denoServerRuntime.mkdir(BUNDLE_DIR, { recursive: true });

    const args = ['bundle', '--platform', 'browser'];
    if (watch) args.push('--watch');
    args.push(entryPoint, '-o', bundleOutput);

    const proc = new Deno.Command('deno', {
      args,
      stdout: 'inherit',
      stderr: 'inherit',
    }).spawn();

    bundleProcess = { kill: () => proc.kill() };
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Serve
  const handle = denoServerRuntime.serve(port, async (req) => {
    const response = await emroute.handleRequest(req);
    if (response) return response;

    const url = new URL(req.url);
    const pathname = url.pathname;

    // Try .build/ for bundled JS, then appRoot for static files
    const buildResponse = await denoServerRuntime.serveStaticFile(req, `${BUNDLE_DIR}${pathname}`);
    if (buildResponse.status === 200) return buildResponse;

    return await denoServerRuntime.serveStaticFile(req, `${FIXTURES_DIR}${pathname}`);
  });

  return {
    handle,
    bundleProcess,
    stop() {
      try {
        bundleProcess?.kill();
      } catch {
        // Bundle process may have already exited
      }
      handle.shutdown();
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
