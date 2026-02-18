/**
 * Development Server
 *
 * Thin wrapper around createEmrouteServer that adds dev-specific concerns:
 * - Entry point generation + bundling (deno bundle --watch)
 * - Build output serving (.build/ directory)
 * - URL aliases (e.g. WASM files from packages)
 * - File watching with auto-rebuild
 * - Permissive CORS headers
 *
 * For production, use createEmrouteServer directly.
 */

import { type BasePath, DEFAULT_BASE_PATH } from '../src/route/route.core.ts';
import type { RoutesManifest } from '../src/type/route.type.ts';
import type { MarkdownRenderer } from '../src/type/markdown.type.ts';
import type { SpaMode } from '../src/type/widget.type.ts';
import type { ServerHandle, ServerRuntime, WatchHandle } from './server.type.ts';
import { WidgetRegistry } from '../src/widget/widget.registry.ts';
import { escapeHtml } from '../src/util/html.util.ts';
import { createEmrouteServer, generateMainTs } from './prod.server.ts';

export type { SpaMode };

/** Build a complete HTML shell with script and style tags. */
function buildDevShell(title: string, scriptTag: string, styleTag = ''): string {
  const styleLink = styleTag ? `\n  ${styleTag}` : '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>${styleLink}
  <style>@view-transition { navigation: auto; } router-slot { display: contents; }</style>
</head>
<body>
  <router-slot></router-slot>
${scriptTag}
</body>
</html>`;
}

// ── Static file helpers ───────────────────────────────────────────────

const STATIC_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.md',
  '.txt',
  '.wasm',
  '.map',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.avif',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.mp4',
  '.webm',
  '.ogg',
  '.mp3',
  '.wav',
  '.pdf',
]);

function isAllowedStaticFile(pathname: string): boolean {
  const dot = pathname.lastIndexOf('.');
  if (dot === -1) return false;
  return STATIC_EXTENSIONS.has(pathname.slice(dot).toLowerCase());
}

/**
 * Resolve a URL pathname to a safe filesystem path within the given root.
 * Returns null if the resolved path escapes the root (path traversal).
 */
function safePath(root: string, pathname: string): string | null {
  const decoded = decodeURIComponent(pathname);
  const normalized = new URL(decoded, 'file:///').pathname;
  const resolved = root + normalized;
  if (resolved !== root && !resolved.startsWith(root + '/')) return null;
  return resolved;
}

// ── Config ────────────────────────────────────────────────────────────

const BUNDLE_DIR = '.build';
const BUNDLE_WARMUP_DELAY = 2000;
const WATCH_DEBOUNCE_DELAY = 100;
const GENERATED_MAIN = '_main.g.ts';

export interface DevServerConfig {
  /** Port to serve on */
  port: number;

  /** Entry point to bundle (e.g. 'main.ts'). When omitted, a main.ts is generated. */
  entryPoint?: string;

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

  /** Widget registry for server-side widget rendering (manual registration) */
  widgets?: WidgetRegistry;

  /**
   * Discovered widget file paths, keyed by widget name.
   * @deprecated Use `widgetsDir` instead — the server auto-discovers widget files.
   */
  widgetFiles?: Record<string, { html?: string; md?: string; css?: string }>;

  /** Widgets directory to scan (auto-discovers widgets) */
  widgetsDir?: string;

  /** SPA rendering mode (default: 'root') */
  spa?: SpaMode;

  /** Base paths for SSR endpoints (default: { html: '/html', md: '/md' }) */
  basePath?: BasePath;

  /** Custom HTTP response headers added to every response */
  responseHeaders?: Record<string, string>;
}

export interface DevServer {
  handle: ServerHandle;
  watchHandle?: WatchHandle;
  bundleProcess?: { kill(): void };
}

// ── createDevServer ───────────────────────────────────────────────────

/**
 * Create a development server. Not intended for production use.
 *
 * Uses permissive CORS (`*`), does not set a Content-Security-Policy,
 * and binds to all interfaces. For production, use `createEmrouteServer`
 * with `serve()` or your own HTTP server.
 */
export async function createDevServer(
  config: DevServerConfig,
  runtime: ServerRuntime,
): Promise<DevServer> {
  const {
    routesDir,
    watch = routesDir !== undefined,
    appRoot = '.',
    spaRoot = 'index.html',
    title = 'eMroute App',
    aliases = {},
    widgetsDir,
    spa = 'root',
  } = config;

  const basePath = config.basePath ?? DEFAULT_BASE_PATH;

  // ---------------------------------------------------------------------------
  // Detect consumer files + generate entry point
  // ---------------------------------------------------------------------------

  const hasConsumerEntryPoint = config.entryPoint !== undefined &&
    (await runtime.stat(`${appRoot}/${config.entryPoint}`)) !== null;
  const hasConsumerIndex = (await runtime.stat(`${appRoot}/${spaRoot}`)) !== null;
  const hasMainCss = (await runtime.stat(`${appRoot}/main.css`)) !== null;

  let entryPoint: string;
  if (hasConsumerEntryPoint) {
    entryPoint = `${appRoot}/${config.entryPoint!}`;
  } else {
    const hasRoutes = routesDir !== undefined || config.routesManifest !== undefined;
    const hasWidgets = widgetsDir !== undefined;
    const mainCode = generateMainTs(
      spa,
      hasRoutes,
      hasWidgets,
      '@emkodev/emroute',
      basePath,
    );
    entryPoint = `${appRoot}/${GENERATED_MAIN}`;
    await runtime.writeTextFile(entryPoint, mainCode);
    console.log(`Generated ${GENERATED_MAIN} (spa: '${spa}')`);
  }

  // ---------------------------------------------------------------------------
  // Build HTML shell with script/style tags
  // ---------------------------------------------------------------------------

  const scriptTag = spa !== 'none'
    ? `<script type="module" src="/${
      entryPoint.replace(/^\.\//, '').replace(/\.ts$/, '.js')
    }"></script>`
    : '';
  const styleTag = hasMainCss ? `<link rel="stylesheet" href="/main.css">` : '';

  let shell: string;
  if (hasConsumerIndex) {
    shell = await runtime.readTextFile(`${appRoot}/${spaRoot}`);
    if (styleTag) shell = shell.replace('</head>', `  ${styleTag}\n</head>`);
    if (scriptTag) shell = shell.replace('</body>', `${scriptTag}\n</body>`);
  } else {
    shell = buildDevShell(title, scriptTag, styleTag);
  }

  // ---------------------------------------------------------------------------
  // Create emroute server (SSR, manifests, bare paths)
  // ---------------------------------------------------------------------------

  const emroute = await createEmrouteServer({
    appRoot,
    routesDir,
    routesManifest: config.routesManifest,
    widgetsDir,
    widgets: config.widgets,
    spa,
    basePath,
    baseUrl: `http://localhost:${config.port}`,
    shell,
    title,
    markdownRenderer: config.markdownRenderer,
    responseHeaders: {
      'Access-Control-Allow-Origin': '*',
      ...config.responseHeaders,
    },
  }, runtime);

  // ---------------------------------------------------------------------------
  // Bundle (skip for 'none' mode — no JS to serve)
  // ---------------------------------------------------------------------------

  let bundleProcess: { kill(): void } | undefined;

  if (spa !== 'none') {
    const bundleEntry = entryPoint.replace(/^\.\//, '');
    const bundleOutput = `${BUNDLE_DIR}/${bundleEntry.replace(/\.ts$/, '.js')}`;
    await runtime.mkdir(BUNDLE_DIR, { recursive: true });

    const proc = new Deno.Command('deno', {
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

    bundleProcess = { kill: () => proc.kill() };
    await new Promise((resolve) => setTimeout(resolve, BUNDLE_WARMUP_DELAY));
  }

  // ---------------------------------------------------------------------------
  // Request handler — delegates to emroute, then serves static files
  // ---------------------------------------------------------------------------

  async function handleRequest(req: Request): Promise<Response> {
    // SSR routes + bare paths
    const response = await emroute.handleRequest(req);
    if (response) return response;

    // File request — serve from aliases, .build/, or appRoot
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Check aliases (e.g., WASM files resolved from packages)
    if (aliases[pathname]) {
      const aliasResponse = await runtime.serveStaticFile(req, aliases[pathname]);
      if (aliasResponse.status === 200) {
        if (pathname.endsWith('.wasm')) {
          const body = await aliasResponse.arrayBuffer();
          return new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'application/wasm' },
          });
        }
        return aliasResponse;
      }
    }

    // Try build output first (for bundled JS)
    const buildPath = safePath(BUNDLE_DIR, pathname);
    if (buildPath) {
      const buildResponse = await runtime.serveStaticFile(req, buildPath);
      if (buildResponse.status === 200) {
        const body = await buildResponse.text();
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        });
      }
    }

    // Serve static files from app root
    if (!isAllowedStaticFile(pathname)) {
      return new Response('Not Found', { status: 404 });
    }

    const filePath = safePath(appRoot, pathname);
    if (!filePath) {
      return new Response('Forbidden', { status: 403 });
    }

    const fileResponse = await runtime.serveStaticFile(req, filePath);

    // Markdown as text
    if (pathname.endsWith('.md') && fileResponse.status === 200) {
      const body = await fileResponse.text();
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // WASM files
    if (pathname.endsWith('.wasm') && fileResponse.status === 200) {
      const body = await fileResponse.arrayBuffer();
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/wasm' },
      });
    }

    return fileResponse;
  }

  // ---------------------------------------------------------------------------
  // Start server — uses emroute.serve() pattern with dev static file layer
  // ---------------------------------------------------------------------------

  const devResponseHeaders = {
    'Access-Control-Allow-Origin': '*',
    ...config.responseHeaders,
  };

  const handle = runtime.serve(config.port, async (req) => {
    const response = await handleRequest(req);
    if (response.status >= 300 && response.status < 400) return response;
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    for (const [k, v] of Object.entries(devResponseHeaders)) {
      response.headers.set(k, v);
    }
    return response;
  });

  console.warn('This is a development server. Do not use in production.');
  console.log(`Development server running at http://localhost:${config.port}/`);
  console.log(`  Mode: spa='${spa}'`);
  if (spa !== 'only') {
    console.log(`  SSR HTML: http://localhost:${config.port}${basePath.html}/*`);
    console.log(`  SSR Markdown: http://localhost:${config.port}${basePath.md}/*`);
  }

  // ---------------------------------------------------------------------------
  // File watching — triggers emroute.rebuild()
  // ---------------------------------------------------------------------------

  let watchHandle: WatchHandle | undefined;

  if (watch && runtime.watchDir) {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const watchPaths: string[] = [];
    if (routesDir) watchPaths.push(routesDir);
    if (widgetsDir && (!routesDir || !widgetsDir.startsWith(routesDir))) {
      watchPaths.push(widgetsDir);
    }

    if (watchPaths.length > 0) {
      const handlers: WatchHandle[] = [];

      for (const watchPath of watchPaths) {
        const wh = runtime.watchDir(watchPath, (event) => {
          const isRouteFile = event.paths.some(
            (p) =>
              p.endsWith('.page.ts') || p.endsWith('.page.html') || p.endsWith('.page.md') ||
              p.endsWith('.page.css') || p.endsWith('.error.ts') || p.endsWith('.redirect.ts'),
          );
          const isWidgetFile = event.paths.some((p) =>
            p.endsWith('.widget.ts') || p.endsWith('.widget.css')
          );

          if (!isRouteFile && !isWidgetFile) return;

          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(async () => {
            try {
              await emroute.rebuild();
              console.log('Rebuilt routes and widgets');
            } catch (e) {
              console.error('Failed to rebuild:', e);
            }
          }, WATCH_DEBOUNCE_DELAY);
        });
        handlers.push(wh);
      }

      watchHandle = {
        close() {
          for (const h of handlers) h.close();
        },
      };

      console.log(`  Watching ${watchPaths.join(', ')} for changes`);
    }
  }

  return {
    handle,
    watchHandle,
    bundleProcess,
  };
}
