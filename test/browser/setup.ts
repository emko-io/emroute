/**
 * Browser Test Setup
 *
 * Generates routes manifest from fixture files using the route generator,
 * starts the dev server, and manages Playwright browser lifecycle.
 */

import { createDevServer, type DevServer } from '../../server/dev.server.ts';
import { denoServerRuntime } from '../../server/server.deno.ts';
import { generateManifestCode, generateRoutesManifest } from '../../tool/route.generator.ts';
import type { FileSystem } from '../../tool/fs.type.ts';
import { WidgetRegistry } from '../../src/widget/widget.registry.ts';
import type { MarkdownRenderer } from '../../src/type/markdown.type.ts';
import { AstRenderer, initParser, MarkdownParser } from 'jsr:@emkodev/emko-md@0.1.0-beta.4/parser';
import { externalWidget } from './fixtures/assets/external.widget.ts';

import { type Browser, chromium, type Page } from 'npm:playwright@1.50.1';

const PORT = Deno.env.get('TEST_PORT') ? Number(Deno.env.get('TEST_PORT')) : 4100;
const FIXTURES_DIR = 'test/browser/fixtures';
const ROUTES_DIR = `${FIXTURES_DIR}/routes`;

let server: DevServer | null = null;
let browser: Browser | null = null;

/** Adapt Deno APIs to the FileSystem interface used by the route generator. */
function createFs(): FileSystem {
  return {
    readDir: (path: string) => denoServerRuntime.readDir(path),
    async writeTextFile(path: string, content: string): Promise<void> {
      await Deno.writeTextFile(path, content);
    },
    async exists(path: string): Promise<boolean> {
      return (await denoServerRuntime.stat(path)) !== null;
    },
  };
}

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

export async function startServer(options?: {
  watch?: boolean;
  spa?: 'none' | 'leaf' | 'root' | 'only';
}): Promise<void> {
  if (server) return;

  // Generate manifest from fixture route files
  const fs = createFs();
  const result = await generateRoutesManifest(ROUTES_DIR, fs);

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

  // Write manifest for the bundler to pick up
  const code = generateManifestCode(result, '@emkodev/emroute');
  await Deno.writeTextFile(`${FIXTURES_DIR}/routes.manifest.ts`, code);

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
    './fixtures/assets/emko_md_parser_bg.wasm',
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

  server = await createDevServer(
    {
      port: PORT,
      entryPoint: 'main.ts',
      routesManifest: result,
      appRoot: FIXTURES_DIR,
      widgetsDir: `${FIXTURES_DIR}/widgets`,
      widgets: manualWidgets,
      watch: options?.watch ?? false,
      markdownRenderer,
      spa: options?.spa,
    },
    denoServerRuntime,
  );

  // Wait for bundle to complete
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

export function stopServer(): void {
  if (!server) return;
  try {
    server.bundleProcess?.kill();
  } catch {
    // Bundle process may have already exited
  }
  server.watchHandle?.close();
  server.handle.shutdown();
  server = null;
}

export async function launchBrowser(): Promise<Browser> {
  browser = await chromium.launch();
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export async function newPage(): Promise<Page> {
  if (!browser) throw new Error('Browser not launched');
  return await browser.newPage();
}

export function baseUrl(path = '/'): string {
  return `http://localhost:${PORT}${path}`;
}

globalThis.addEventListener('unload', () => {
  try {
    server?.bundleProcess?.kill();
  } catch {
    // Bundle process may have already exited (watch: false)
  }
  server?.handle?.shutdown();
  server = null;
});
