/**
 * Development Server (Runtime-Agnostic)
 *
 * - Bundles entry point with `deno bundle --watch`
 * - Serves static files (HTML, MD, WASM, bundled JS)
 * - Handles /md/* and /html/* SSR routes via router
 * - SPA fallback serves app's index.html (generated or consumer-provided)
 * - Auto-generates routes manifest from routesDir
 * - Auto-discovers widgets from widgetsDir
 * - Watches for route and widget file changes and regenerates manifests
 */

import { SSR_HTML_PREFIX, SSR_MD_PREFIX, stripSsrPrefix } from '../src/route/route.core.ts';
import { SsrHtmlRouter } from '../src/renderer/ssr/html.renderer.ts';
import { SsrMdRouter } from '../src/renderer/ssr/md.renderer.ts';
import type { RoutesManifest } from '../src/type/route.type.ts';
import type { MarkdownRenderer } from '../src/type/markdown.type.ts';
import type { SpaMode, WidgetManifestEntry } from '../src/type/widget.type.ts';
import { generateManifestCode, generateRoutesManifest } from '../tool/route.generator.ts';
import { discoverWidgets, generateWidgetsManifestCode } from '../tool/widget.generator.ts';
import type { FileSystem } from '../tool/fs.type.ts';
import type { ServerHandle, ServerRuntime, WatchHandle } from './server.type.ts';
import { WidgetRegistry } from '../src/widget/widget.registry.ts';
import type { WidgetComponent } from '../src/component/widget.component.ts';
import { escapeHtml } from '../src/util/html.util.ts';

export type { SpaMode };

/**
 * Compute a path relative to appRoot.
 * Both inputs are assumed relative to CWD.
 */
function relativeToAppRoot(appRoot: string, path: string): string {
  const normalizedRoot = appRoot === '.' ? '' : appRoot.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\.\//, '');
  if (normalizedRoot && normalizedPath.startsWith(normalizedRoot + '/')) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }
  return normalizedPath;
}

/**
 * Find a WidgetComponent export from a module.
 * Supports `export default`, named instance exports, and class exports.
 */
function extractWidgetExport(
  mod: Record<string, unknown>,
): WidgetComponent | null {
  for (const value of Object.values(mod)) {
    if (!value) continue;
    // Instance export (e.g. `export const foo = new FooWidget()`)
    if (typeof value === 'object' && 'getData' in value) {
      return value as WidgetComponent;
    }
    // Class export (e.g. `export default FooWidget`)
    if (typeof value === 'function' && value.prototype?.getData) {
      return new (value as new () => WidgetComponent)();
    }
  }
  return null;
}

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

/** Adapt ServerRuntime to FileSystem interface for generators */
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

/** Generate main.ts content based on server config */
function generateMainTs(
  spa: SpaMode,
  hasRoutes: boolean,
  hasWidgets: boolean,
  importPath: string,
): string {
  const imports: string[] = [];
  const body: string[] = [];

  imports.push(`import { ComponentElement } from '${importPath}/spa';`);

  if (hasRoutes) {
    imports.push(`import { routesManifest } from './routes.manifest.ts';`);
  }

  if (hasWidgets) {
    imports.push(`import { widgetsManifest } from './widgets.manifest.ts';`);
    body.push('for (const entry of widgetsManifest.widgets) {');
    body.push(
      '  const mod = await widgetsManifest.moduleLoaders![entry.modulePath]() as Record<string, unknown>;',
    );
    body.push('  for (const exp of Object.values(mod)) {');
    body.push("    if (exp && typeof exp === 'object' && 'getData' in exp) {");
    body.push('      ComponentElement.register(exp as any, entry.files);');
    body.push('      break;');
    body.push('    }');
    body.push("    if (typeof exp === 'function' && exp.prototype?.getData) {");
    body.push(
      '      ComponentElement.registerClass(exp as new () => any, entry.name, entry.files);',
    );
    body.push('      break;');
    body.push('    }');
    body.push('  }');
    body.push('}');
  }

  if (spa !== 'none' && hasRoutes) {
    imports.push(`import { createSpaHtmlRouter } from '${importPath}/spa';`);
    if (spa === 'leaf') {
      body.push("if (location.pathname === '/') {");
      body.push("  location.replace('/html/');");
      body.push('} else {');
      body.push('  await createSpaHtmlRouter(routesManifest);');
      body.push('}');
    } else {
      body.push('await createSpaHtmlRouter(routesManifest);');
    }
  }

  return `/** Auto-generated entry point — do not edit. */\n${imports.join('\n')}\n\n${
    body.join('\n')
  }\n`;
}

/** Build a complete HTML shell with script tag */
function buildSpaHtml(title: string, scriptTag: string, styleTag = ''): string {
  const styleLink = styleTag ? `\n  ${styleTag}` : '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>${styleLink}
</head>
<body>
  <router-slot></router-slot>
${scriptTag}
</body>
</html>`;
}

/** Inject SSR-rendered content into an HTML shell */
function injectSsrContent(
  html: string,
  content: string,
  title: string | undefined,
  ssrRoute?: string,
): string {
  const slotPattern = /<router-slot\b[^>]*>.*?<\/router-slot>/s;
  if (!slotPattern.test(html)) return html;

  const ssrAttr = ssrRoute ? ` data-ssr-route="${ssrRoute}"` : '';
  html = html.replace(slotPattern, `<router-slot${ssrAttr}>${content}</router-slot>`);

  if (title) {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  }

  return html;
}

/** Check if path looks like a file request (has extension) */
function isFileRequest(pathname: string): boolean {
  const lastSegment = pathname.split('/').pop() || '';
  return lastSegment.includes('.');
}

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

const BUNDLE_DIR = '.build';
const BUNDLE_WARMUP_DELAY = 2000;
const WATCH_DEBOUNCE_DELAY = 100;
const GENERATED_MAIN = '_main.generated.ts';

/**
 * Resolve a URL pathname to a safe filesystem path within the given root.
 * Returns null if the resolved path escapes the root (path traversal).
 */
function safePath(root: string, pathname: string): string | null {
  // Decode percent-encoded sequences so %2e%2e/... can't bypass the check
  const decoded = decodeURIComponent(pathname);
  // Collapse any /../ sequences via URL resolution, then take the pathname
  const normalized = new URL(decoded, 'file:///').pathname;
  const resolved = root + normalized;
  // The resolved path must start with root + '/' (or equal root exactly)
  if (resolved !== root && !resolved.startsWith(root + '/')) return null;
  return resolved;
}

export interface DevServer {
  handle: ServerHandle;
  watchHandle?: WatchHandle;
  bundleProcess?: { kill(): void };
}

/**
 * Create a development server. Not intended for production use.
 *
 * Uses permissive CORS (`*`), does not set a Content-Security-Policy,
 * and binds to all interfaces. For production, deploy your own HTTP
 * server and use the SSR renderers directly.
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

  const fs = createFileSystemAdapter(runtime);

  // ---------------------------------------------------------------------------
  // Routes manifest
  // ---------------------------------------------------------------------------

  let routesManifest: RoutesManifest;

  if (routesDir) {
    const result = await generateRoutesManifest(routesDir, fs);
    routesManifest = result;
    routesManifest.moduleLoaders = createServerModuleLoaders(routesManifest, appRoot, runtime);

    const code = generateManifestCode(result, '@emkodev/emroute');
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

  // ---------------------------------------------------------------------------
  // Widget discovery
  // ---------------------------------------------------------------------------

  let widgets: WidgetRegistry | undefined = config.widgets;
  let widgetFiles: Record<string, { html?: string; md?: string; css?: string }> =
    config.widgetFiles ?? {};
  let discoveredWidgetEntries: WidgetManifestEntry[] = [];

  if (widgetsDir) {
    const widgetPathPrefix = relativeToAppRoot(appRoot, widgetsDir);
    discoveredWidgetEntries = await discoverWidgets(widgetsDir, fs, widgetPathPrefix);

    // Write widgets manifest for the SPA bundle
    const widgetManifestCode = generateWidgetsManifestCode(
      discoveredWidgetEntries,
      '@emkodev/emroute',
    );
    await runtime.writeTextFile(`${appRoot}/widgets.manifest.ts`, widgetManifestCode);

    console.log(`Scanned ${widgetsDir}/`);
    console.log(`  ${discoveredWidgetEntries.length} widgets`);

    // Eagerly import all widget modules for SSR
    const ssrWidgets = new WidgetRegistry();
    const rootUrl = new URL(appRoot + '/', `file://${runtime.cwd()}/`);

    for (const entry of discoveredWidgetEntries) {
      try {
        const fileUrl = new URL(entry.modulePath, rootUrl).href;
        const mod = await import(fileUrl) as Record<string, unknown>;
        const instance = extractWidgetExport(mod);
        if (!instance) {
          console.warn(`[Widgets] No widget export found in ${entry.modulePath}`);
          continue;
        }
        ssrWidgets.add(instance);
      } catch (e) {
        console.error(`[Widgets] Failed to load ${entry.modulePath}:`, e);
      }
    }

    // Merge with manually provided widgets (manual wins on collision)
    if (widgets) {
      for (const widget of widgets) {
        ssrWidgets.add(widget);
      }
    }
    widgets = ssrWidgets;

    // Build widgetFiles record from discovered entries
    const discoveredFiles: Record<string, { html?: string; md?: string; css?: string }> = {};
    for (const entry of discoveredWidgetEntries) {
      if (entry.files) discoveredFiles[entry.name] = entry.files;
    }
    widgetFiles = { ...discoveredFiles, ...widgetFiles };
  }

  // ---------------------------------------------------------------------------
  // SSR routers
  // ---------------------------------------------------------------------------

  const baseUrl = `http://localhost:${config.port}`;
  const { markdownRenderer } = config;
  let ssrHtmlRouter = new SsrHtmlRouter(routesManifest, {
    baseUrl,
    markdownRenderer,
    widgets,
    widgetFiles,
  });
  let ssrMdRouter = new SsrMdRouter(routesManifest, { baseUrl, widgets, widgetFiles });

  async function regenerateRoutes(): Promise<void> {
    if (!routesDir) return;

    const result = await generateRoutesManifest(routesDir, fs);
    routesManifest = result;
    routesManifest.moduleLoaders = createServerModuleLoaders(routesManifest, appRoot, runtime);

    const code = generateManifestCode(result, '@emkodev/emroute');
    await runtime.writeTextFile(`${appRoot}/routes.manifest.ts`, code);

    ssrHtmlRouter = new SsrHtmlRouter(routesManifest, {
      baseUrl,
      markdownRenderer,
      widgets,
      widgetFiles,
    });
    ssrMdRouter = new SsrMdRouter(routesManifest, { baseUrl, widgets, widgetFiles });

    console.log(`Routes regenerated: ${result.routes.length} routes`);
  }

  async function regenerateWidgets(): Promise<void> {
    if (!widgetsDir) return;

    const widgetPathPrefix = relativeToAppRoot(appRoot, widgetsDir);
    discoveredWidgetEntries = await discoverWidgets(widgetsDir, fs, widgetPathPrefix);
    const widgetManifestCode = generateWidgetsManifestCode(
      discoveredWidgetEntries,
      '@emkodev/emroute',
    );
    await runtime.writeTextFile(`${appRoot}/widgets.manifest.ts`, widgetManifestCode);

    // Re-import widget modules for SSR
    const ssrWidgets = new WidgetRegistry();
    const rootUrl = new URL(appRoot + '/', `file://${runtime.cwd()}/`);

    for (const entry of discoveredWidgetEntries) {
      try {
        const fileUrl = new URL(entry.modulePath, rootUrl).href;
        const mod = await import(fileUrl) as Record<string, unknown>;
        const instance = extractWidgetExport(mod);
        if (!instance) {
          console.warn(`[Widgets] No widget export found in ${entry.modulePath}`);
          continue;
        }
        ssrWidgets.add(instance);
      } catch (e) {
        console.error(`[Widgets] Failed to load ${entry.modulePath}:`, e);
      }
    }

    if (config.widgets) {
      for (const widget of config.widgets) {
        ssrWidgets.add(widget);
      }
    }
    widgets = ssrWidgets;

    const discoveredFiles: Record<string, { html?: string; md?: string; css?: string }> = {};
    for (const entry of discoveredWidgetEntries) {
      if (entry.files) discoveredFiles[entry.name] = entry.files;
    }
    widgetFiles = { ...discoveredFiles, ...(config.widgetFiles ?? {}) };

    // Update SSR routers with new widgets
    ssrHtmlRouter = new SsrHtmlRouter(routesManifest, {
      baseUrl,
      markdownRenderer,
      widgets,
      widgetFiles,
    });
    ssrMdRouter = new SsrMdRouter(routesManifest, { baseUrl, widgets, widgetFiles });

    console.log(`Widgets regenerated: ${discoveredWidgetEntries.length} widgets`);
  }

  // ---------------------------------------------------------------------------
  // Detect consumer files + generate entry point
  // ---------------------------------------------------------------------------

  const hasConsumerEntryPoint = config.entryPoint !== undefined &&
    (await runtime.stat(`${appRoot}/${config.entryPoint}`)) !== null;
  const hasConsumerIndex = (await runtime.stat(`${appRoot}/${spaRoot}`)) !== null;
  const hasMainCss = (await runtime.stat(`${appRoot}/main.css`)) !== null;

  // entryPoint always stores the full CWD-relative path for the bundler
  let entryPoint: string;
  if (hasConsumerEntryPoint) {
    entryPoint = `${appRoot}/${config.entryPoint!}`;
  } else {
    // Generate main.ts from config
    const hasRoutes = routesDir !== undefined || config.routesManifest !== undefined;
    const hasWidgets = widgetsDir !== undefined;
    const mainCode = generateMainTs(spa, hasRoutes, hasWidgets, '@emkodev/emroute');
    entryPoint = `${appRoot}/${GENERATED_MAIN}`;
    await runtime.writeTextFile(entryPoint, mainCode);
    console.log(`Generated ${GENERATED_MAIN} (spa: '${spa}')`);
  }

  // ---------------------------------------------------------------------------
  // Bundle
  // ---------------------------------------------------------------------------

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

  await new Promise((resolve) => setTimeout(resolve, BUNDLE_WARMUP_DELAY));

  // ---------------------------------------------------------------------------
  // HTML shell construction
  // ---------------------------------------------------------------------------

  const indexPath = `${appRoot}/${spaRoot}`;

  /** Build the script tag for the HTML shell */
  function buildScriptTag(): string {
    // Use the entry point path (not the build output path) — the server
    // resolves static files from .build/ first, so /main.js → .build/main.js.
    const srcPath = entryPoint.replace(/\.ts$/, '.js');
    return `<script type="module" src="/${srcPath}"></script>`;
  }

  /** Build the stylesheet link tag (if main.css exists) */
  function buildStyleTag(): string {
    return hasMainCss ? `<link rel="stylesheet" href="/main.css">` : '';
  }

  /** Get the full SPA HTML shell (consumer-provided or generated) */
  async function getSpaShell(): Promise<string> {
    const scriptTag = buildScriptTag();
    const styleTag = buildStyleTag();

    if (hasConsumerIndex) {
      let html = await runtime.readTextFile(indexPath);
      if (styleTag) html = html.replace('</head>', `  ${styleTag}\n</head>`);
      html = html.replace('</body>', `${scriptTag}\n</body>`);
      return html;
    }

    return buildSpaHtml(title, scriptTag, styleTag);
  }

  /** Build SSR HTML response: inject content + script into shell */
  async function buildSsrHtmlShell(
    content: string,
    ssrTitle: string | undefined,
    ssrRoute?: string,
  ): Promise<string> {
    let html = await getSpaShell();
    html = injectSsrContent(html, content, ssrTitle, ssrRoute);
    return html;
  }

  // ---------------------------------------------------------------------------
  // Request handler
  // ---------------------------------------------------------------------------

  /** Resolve file path safely from app root; returns 403 on traversal */
  function resolveFilePathOrForbid(pathname: string): string | Response {
    const resolved = safePath(appRoot, pathname);
    if (!resolved) return new Response('Forbidden', { status: 403 });
    return resolved;
  }

  async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Handle /md/* routes — SSR Markdown (skip in 'only' mode)
    if (
      spa !== 'only' &&
      (pathname.startsWith(SSR_MD_PREFIX) || pathname + '/' === SSR_MD_PREFIX)
    ) {
      try {
        const { markdown, status } = await ssrMdRouter.render(pathname);
        return new Response(markdown, {
          status,
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8; variant=CommonMark',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        console.error(`[MD] Error rendering ${pathname}:`, e);
        return new Response('Internal Server Error', { status: 500 });
      }
    }

    // Handle /html/* routes — SSR HTML (skip in 'only' mode)
    if (
      spa !== 'only' &&
      (pathname.startsWith(SSR_HTML_PREFIX) || pathname + '/' === SSR_HTML_PREFIX)
    ) {
      try {
        const result = await ssrHtmlRouter.render(pathname);
        const ssrTitle = result.title ?? title;
        const ssrRoute = stripSsrPrefix(pathname);
        const shell = await buildSsrHtmlShell(result.html, ssrTitle, ssrRoute);
        return new Response(shell, {
          status: result.status,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        console.error(`[HTML] Error rendering ${pathname}:`, e);
        return new Response('Internal Server Error', { status: 500 });
      }
    }

    // SPA fallback — serve HTML shell for non-file requests
    if (!isFileRequest(pathname)) {
      // 'none' mode: redirect all non-file requests to /html/*
      if (spa === 'none') {
        const route = pathname === '/' ? '' : pathname.slice(1);
        return Response.redirect(new URL(`${SSR_HTML_PREFIX}${route}`, url.origin), 302);
      }

      // 'leaf' mode: redirect root to /html/, serve SPA shell for other paths
      if (spa === 'leaf' && pathname === '/') {
        return Response.redirect(new URL(SSR_HTML_PREFIX, url.origin), 302);
      }

      // 'root' and 'only' modes + 'leaf' non-root: serve SPA shell
      try {
        let html = await getSpaShell();

        // Inject SSR hint for LLMs and text clients (skip in 'only' mode)
        if (spa !== 'only') {
          const ssrHint = `<!-- This is a Single Page Application. For machine-readable content, ` +
            `prefix any route with ${SSR_MD_PREFIX} for Markdown or ${SSR_HTML_PREFIX} for pre-rendered HTML. -->`;
          html = html.replace('</head>', `${ssrHint}\n</head>`);
        }

        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        console.error(`[SPA] Error building HTML shell:`, e);
        return new Response('Internal Server Error', { status: 500 });
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
    const buildPath = safePath(BUNDLE_DIR, pathname);
    if (buildPath) {
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
    }

    // Serve static files from app root / monorepo
    if (!isAllowedStaticFile(pathname)) {
      return new Response('Not Found', { status: 404 });
    }
    const filePathResult = resolveFilePathOrForbid(pathname);
    if (filePathResult instanceof Response) return filePathResult;
    const filePath = filePathResult;
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

  // ---------------------------------------------------------------------------
  // Start server
  // ---------------------------------------------------------------------------

  const handle = runtime.serve(config.port, async (req) => {
    const response = await handleRequest(req);
    // Redirect responses (from Response.redirect()) have immutable headers
    if (response.status >= 300 && response.status < 400) return response;
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    return response;
  });

  console.warn('This is a development server. Do not use in production.');
  console.log(`Development server running at http://localhost:${config.port}/`);
  console.log(`  Mode: spa='${spa}'`);
  if (spa !== 'only') {
    console.log(`  SSR HTML: http://localhost:${config.port}${SSR_HTML_PREFIX}*`);
    console.log(`  SSR Markdown: http://localhost:${config.port}${SSR_MD_PREFIX}*`);
  }

  // ---------------------------------------------------------------------------
  // File watching
  // ---------------------------------------------------------------------------

  let watchHandle: WatchHandle | undefined;

  if (watch && runtime.watchDir) {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const watchPaths: string[] = [];

    if (routesDir) {
      watchPaths.push(routesDir);
    }

    if (widgetsDir) {
      // Only add widgetsDir if it's not a subdirectory of routesDir
      if (!routesDir || !widgetsDir.startsWith(routesDir)) {
        watchPaths.push(widgetsDir);
      }
    }

    if (watchPaths.length > 0) {
      // Watch the first path; if two paths, set up two watchers
      const handlers: WatchHandle[] = [];

      for (const watchPath of watchPaths) {
        const wh = runtime.watchDir(watchPath, (event) => {
          const isRouteFile = event.paths.some(
            (p) =>
              p.endsWith('.page.ts') || p.endsWith('.page.html') || p.endsWith('.page.md') ||
              p.endsWith('.page.css') || p.endsWith('.error.ts') || p.endsWith('.redirect.ts'),
          );
          const isWidgetFile = event.paths.some((p) => p.endsWith('.widget.ts'));

          if (!isRouteFile && !isWidgetFile) return;

          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(async () => {
            try {
              if (isRouteFile) await regenerateRoutes();
              if (isWidgetFile) await regenerateWidgets();
            } catch (e) {
              console.error('Failed to regenerate:', e);
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
    bundleProcess: { kill: () => bundleProcess.kill() },
  };
}
