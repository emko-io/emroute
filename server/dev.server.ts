/**
 * Development Server (Runtime-Agnostic)
 *
 * - Bundles entry point with `deno bundle --watch`
 * - Serves static files (HTML, MD, WASM, bundled JS)
 * - Handles /md/* and /html/* SSR routes via router
 * - SPA fallback serves app's index.html
 * - Auto-generates routes manifest from routesDir
 * - Watches for route file changes and regenerates manifest
 */

import { SSR_HTML_PREFIX, SSR_MD_PREFIX } from '../src/route/route.core.ts';
import { SsrHtmlRouter } from '../src/renderer/ssr/html.renderer.ts';
import { SsrMdRouter } from '../src/renderer/ssr/md.renderer.ts';
import type { RoutesManifest } from '../src/type/route.type.ts';
import type { MarkdownRenderer } from '../src/type/markdown.type.ts';
import { generateManifestCode, generateRoutesManifest } from '../tool/route.generator.ts';
import type { FileSystem } from '../tool/fs.type.ts';
import type { ServerHandle, ServerRuntime, WatchHandle } from './server.type.ts';
import type { WidgetRegistry } from '../src/widget/widget.registry.ts';

export interface DevServerConfig {
  /** Port to serve on */
  port: number;

  /** Entry point to bundle (e.g. 'routes/index.page.ts') */
  entryPoint: string;

  /** Routes directory to scan (auto-generates manifest) */
  routesDir?: string;

  /** Routes manifest (alternative to routesDir) */
  routesManifest?: RoutesManifest;

  /** Watch for changes (default: true if routesDir provided) */
  watch?: boolean;

  /** Root directory for app files (default: '.') */
  appRoot?: string;

  /** SPA fallback file (default: 'index.html') */
  spaRoot?: string;

  /** Page title (used for SSR HTML shell) */
  title?: string;

  /** URL path aliases to local files (e.g., { '/assets/foo.wasm': '/abs/path/to/foo.wasm' }) */
  aliases?: Record<string, string>;

  /** Markdown renderer for server-side <mark-down> expansion in SSR HTML */
  markdownRenderer?: MarkdownRenderer;

  /** Widget registry for server-side widget rendering */
  widgets?: WidgetRegistry;
}

/** Create module loaders for server-side SSR imports */
function createServerModuleLoaders(
  manifest: RoutesManifest,
  appRoot: string,
  runtime: ServerRuntime,
): Record<string, () => Promise<unknown>> {
  const loaders: Record<string, () => Promise<unknown>> = {};

  const modulePaths = new Set<string>();
  for (const route of manifest.routes) {
    if (route.files?.ts) modulePaths.add(route.files.ts);
    if (route.modulePath.endsWith('.ts')) modulePaths.add(route.modulePath);
  }
  for (const boundary of manifest.errorBoundaries) {
    modulePaths.add(boundary.modulePath);
  }
  if (manifest.errorHandler) {
    modulePaths.add(manifest.errorHandler.modulePath);
  }
  for (const [_, statusRoute] of manifest.statusPages) {
    if (statusRoute.modulePath.endsWith('.ts')) {
      modulePaths.add(statusRoute.modulePath);
    }
  }

  // Resolve relative paths to absolute file:// URLs
  const rootUrl = new URL(appRoot + '/', `file://${runtime.cwd()}/`);

  for (const path of modulePaths) {
    const fileUrl = new URL(path, rootUrl).href;
    loaders[path] = () => import(fileUrl);
  }

  return loaders;
}

/** Adapt ServerRuntime to FileSystem interface for route generator */
function createFileSystemAdapter(runtime: ServerRuntime): FileSystem {
  return {
    readDir: (path: string) => runtime.readDir(path),
    writeTextFile(_path: string, _content: string): Promise<void> {
      return Promise.reject(new Error('writeTextFile not supported in dev server'));
    },
    async exists(path: string): Promise<boolean> {
      const stat = await runtime.stat(path);
      return stat !== null;
    },
  };
}

/** Inject SSR-rendered content into the app's index.html shell */
async function buildSsrHtmlShell(
  runtime: ServerRuntime,
  indexPath: string,
  content: string,
  title: string | undefined,
  ssrRoute?: string,
): Promise<string> {
  let html: string;
  try {
    html = await runtime.readTextFile(indexPath);
  } catch {
    return buildFallbackHtmlShell(content, title ?? 'eMroute App');
  }

  // Inject SSR content into <router-slot>
  const slotPattern = /<router-slot\b[^>]*>[\s\S]*?<\/router-slot>/;
  if (!slotPattern.test(html)) {
    return buildFallbackHtmlShell(content, title ?? 'eMroute App');
  }

  const ssrAttr = ssrRoute ? ` data-ssr-route="${ssrRoute}"` : '';
  html = html.replace(slotPattern, `<router-slot${ssrAttr}>${content}</router-slot>`);

  // Replace <title> content if SSR returned a title
  if (title) {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  }

  return html;
}

/** Fallback HTML shell when index.html is missing or has no <router-slot> */
function buildFallbackHtmlShell(content: string, title: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body>
${content}
</body>
</html>`;
}

/** Check if path looks like a file request (has extension) */
function isFileRequest(pathname: string): boolean {
  const lastSegment = pathname.split('/').pop() || '';
  return lastSegment.includes('.');
}

const BUNDLE_DIR = '.build';

export interface DevServer {
  handle: ServerHandle;
  watchHandle?: WatchHandle;
  bundleProcess?: { kill(): void };
}

export async function createDevServer(
  config: DevServerConfig,
  runtime: ServerRuntime,
): Promise<DevServer> {
  const {
    port,
    entryPoint,
    routesDir,
    watch = routesDir !== undefined,
    appRoot = '.',
    spaRoot = 'index.html',
    title = 'eMroute App',
    aliases = {},
  } = config;

  // Generate or use provided manifest
  let routesManifest: RoutesManifest;

  if (routesDir) {
    const fs = createFileSystemAdapter(runtime);
    const result = await generateRoutesManifest(routesDir, fs);
    routesManifest = result;
    routesManifest.moduleLoaders = createServerModuleLoaders(routesManifest, appRoot, runtime);

    // Write manifest file so the bundle can import it
    const code = generateManifestCode(result, '@emkodev/eMroute');
    await runtime.writeTextFile(`${appRoot}/routes.manifest.ts`, code);

    console.log(`Scanned ${routesDir}/`);
    console.log(
      `  ${result.routes.length} routes, ${result.errorBoundaries.length} error boundaries`,
    );

    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.warn(warning);
      }
    }
  } else if (config.routesManifest) {
    routesManifest = config.routesManifest;
  } else {
    throw new Error('Either routesDir or routesManifest must be provided');
  }

  // Initialize SSR routers
  const baseUrl = `http://localhost:${port}`;
  const { markdownRenderer, widgets } = config;
  let ssrHtmlRouter = new SsrHtmlRouter(routesManifest, { baseUrl, markdownRenderer, widgets });
  let ssrMdRouter = new SsrMdRouter(routesManifest, { baseUrl, widgets });

  // Regenerate manifest, write file, and update SSR routers
  async function regenerateRoutes(): Promise<void> {
    if (!routesDir) return;

    const fs = createFileSystemAdapter(runtime);
    const result = await generateRoutesManifest(routesDir, fs);
    routesManifest = result;
    routesManifest.moduleLoaders = createServerModuleLoaders(routesManifest, appRoot, runtime);

    // Write manifest file — deno bundle --watch will pick up the change
    const code = generateManifestCode(result, '@emkodev/eMroute');
    await runtime.writeTextFile(`${appRoot}/routes.manifest.ts`, code);

    ssrHtmlRouter = new SsrHtmlRouter(routesManifest, { baseUrl, markdownRenderer, widgets });
    ssrMdRouter = new SsrMdRouter(routesManifest, { baseUrl, widgets });

    console.log(`Routes regenerated: ${result.routes.length} routes`);
  }

  // Start deno bundle with --watch
  const bundleOutput = `${BUNDLE_DIR}/${entryPoint.replace(/\.ts$/, '.js')}`;
  await runtime.mkdir(BUNDLE_DIR + '/' + entryPoint.replace(/\/[^/]+$/, ''), { recursive: true });

  const bundleProcess = new Deno.Command('deno', {
    args: [
      'bundle',
      '--platform',
      'browser',
      ...(watch ? ['--watch'] : []),
      entryPoint,
      '-o',
      bundleOutput,
    ],
    stdout: 'inherit',
    stderr: 'inherit',
  }).spawn();

  // Give the initial bundle a moment to complete
  await new Promise((resolve) => setTimeout(resolve, 2000));

  /** Resolve file path from app root */
  function resolveFilePath(pathname: string): string {
    return appRoot + pathname;
  }

  const indexPath = `${appRoot}/${spaRoot}`;

  async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Handle /md/* routes — SSR Markdown
    if (pathname.startsWith(SSR_MD_PREFIX) || pathname + '/' === SSR_MD_PREFIX) {
      try {
        const { markdown, status } = await ssrMdRouter.render(pathname);
        return new Response(markdown, {
          status,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        console.error(`[MD] Error rendering ${pathname}:`, e);
        return new Response(`Error: ${e}`, { status: 500 });
      }
    }

    // Handle /html/* routes — SSR HTML using the app's index.html as shell
    if (pathname.startsWith(SSR_HTML_PREFIX) || pathname + '/' === SSR_HTML_PREFIX) {
      try {
        const result = await ssrHtmlRouter.render(pathname);
        const ssrTitle = result.title ?? title;
        // Strip /html/ prefix for the route path SPA will compare against
        const ssrRoute = pathname.startsWith(SSR_HTML_PREFIX)
          ? '/' + pathname.slice(SSR_HTML_PREFIX.length)
          : pathname;
        const shell = await buildSsrHtmlShell(
          runtime,
          indexPath,
          result.html,
          ssrTitle,
          ssrRoute,
        );
        return new Response(shell, {
          status: result.status,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        console.error(`[HTML] Error rendering ${pathname}:`, e);
        return new Response(`Error: ${e}`, { status: 500 });
      }
    }

    // SPA fallback — serve app's index.html for non-file requests
    if (!isFileRequest(pathname)) {
      try {
        let html = await runtime.readTextFile(indexPath);

        // Inject SSR hint for LLMs and text clients
        const ssrHint = `<!-- This is a Single Page Application. For machine-readable content, ` +
          `prefix any route with ${SSR_MD_PREFIX} for Markdown or ${SSR_HTML_PREFIX} for pre-rendered HTML. -->`;
        html = html.replace('</head>', `${ssrHint}\n</head>`);

        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        console.error(`[SPA] Error reading index.html:`, e);
        return new Response('index.html not found', { status: 500 });
      }
    }

    // Check aliases (e.g., WASM files resolved from packages)
    if (aliases[pathname]) {
      const response = await runtime.serveStaticFile(req, aliases[pathname]);
      if (response.status === 200) {
        if (pathname.endsWith('.wasm')) {
          const body = await response.arrayBuffer();
          return new Response(body, {
            status: 200,
            headers: {
              'Content-Type': 'application/wasm',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
        return response;
      }
    }

    // Try build output first (for bundled JS)
    const buildPath = BUNDLE_DIR + pathname;
    const buildResponse = await runtime.serveStaticFile(req, buildPath);
    if (buildResponse.status === 200) {
      const body = await buildResponse.text();
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Serve static files from app root / monorepo
    const filePath = resolveFilePath(pathname);
    const response = await runtime.serveStaticFile(req, filePath);

    // Markdown as text
    if (pathname.endsWith('.md') && response.status === 200) {
      const body = await response.text();
      return new Response(body, {
        status: response.status,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // WASM files
    if (pathname.endsWith('.wasm') && response.status === 200) {
      const body = await response.arrayBuffer();
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/wasm',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return response;
  }

  const handle = runtime.serve(port, handleRequest);

  console.log(`Development server running at http://localhost:${port}/`);
  console.log(`  SPA: http://localhost:${port}/`);
  console.log(`  SSR HTML: http://localhost:${port}${SSR_HTML_PREFIX}*`);
  console.log(`  SSR Markdown: http://localhost:${port}${SSR_MD_PREFIX}*`);

  // Set up file watching
  let watchHandle: WatchHandle | undefined;

  if (watch && routesDir && runtime.watchDir) {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    watchHandle = runtime.watchDir(routesDir, (event) => {
      const isRouteFile = event.paths.some(
        (p) =>
          p.endsWith('.page.ts') || p.endsWith('.page.html') || p.endsWith('.page.md') ||
          p.endsWith('.error.ts') || p.endsWith('.redirect.ts'),
      );

      if (!isRouteFile) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          await regenerateRoutes();
        } catch (e) {
          console.error('Failed to regenerate routes:', e);
        }
      }, 100);
    });

    console.log(`  Watching ${routesDir}/ for changes`);
  }

  return {
    handle,
    watchHandle,
    bundleProcess: { kill: () => bundleProcess.kill() },
  };
}
