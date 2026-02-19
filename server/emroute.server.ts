/**
 * Emroute Server
 *
 * Runtime-agnostic server that handles SSR rendering, manifest generation,
 * static file serving, and route matching. Works with any runtime (Deno,
 * Node, Bun) via the ServerRuntime abstraction.
 *
 * Usage (standalone):
 * ```ts
 * import { createEmrouteServer } from '@emkodev/emroute/server';
 * import { denoServerRuntime } from '@emkodev/emroute/server/deno';
 *
 * const emroute = await createEmrouteServer({
 *   appRoot: '.',
 *   routesDir: 'routes',
 *   widgetsDir: 'widgets',
 *   spa: 'root',
 * }, denoServerRuntime);
 *
 * emroute.serve(3000);
 * ```
 *
 * Usage (composable):
 * ```ts
 * const emroute = await createEmrouteServer(config, runtime);
 *
 * Deno.serve(async (req) => {
 *   if (isApiRoute(req)) return handleApi(req);
 *   const response = await emroute.handleRequest(req);
 *   if (response) return response;
 *   return new Response('Not Found', { status: 404 });
 * });
 * ```
 */

import { type BasePath, DEFAULT_BASE_PATH, prefixManifest } from '../src/route/route.core.ts';
import { SsrHtmlRouter } from '../src/renderer/ssr/html.renderer.ts';
import { SsrMdRouter } from '../src/renderer/ssr/md.renderer.ts';
import type { RoutesManifest } from '../src/type/route.type.ts';
import type { SpaMode, WidgetManifestEntry } from '../src/type/widget.type.ts';
import { generateManifestCode, generateRoutesManifest } from './generator/route.generator.ts';
import { discoverWidgets, generateWidgetsManifestCode } from './generator/widget.generator.ts';
import { WidgetRegistry } from '../src/widget/widget.registry.ts';
import type { WidgetComponent } from '../src/component/widget.component.ts';
import { escapeHtml } from '../src/util/html.util.ts';
import type { ServerRuntime } from './server.type.ts';
import type {
  BuildConfig,
  BuildResult,
  Bundler,
  CompressionEncoding,
  EmrouteServer,
  EmrouteServerConfig,
} from './server-api.type.ts';

// ── Module loaders ─────────────────────────────────────────────────────

/** Create module loaders for server-side SSR imports. */
function createModuleLoaders(
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

  const rootUrl = new URL(appRoot + '/', `file://${runtime.cwd()}/`);

  for (const path of modulePaths) {
    const fileUrl = new URL(path, rootUrl).href;
    loaders[path] = () => import(fileUrl);
  }

  return loaders;
}

// ── Widget helpers ─────────────────────────────────────────────────────

/** Find a WidgetComponent export from a module. */
function extractWidgetExport(
  mod: Record<string, unknown>,
): WidgetComponent | null {
  for (const value of Object.values(mod)) {
    if (!value) continue;
    if (typeof value === 'object' && 'getData' in value) {
      return value as WidgetComponent;
    }
    if (typeof value === 'function' && value.prototype?.getData) {
      return new (value as new () => WidgetComponent)();
    }
  }
  return null;
}

/** Import widget modules for SSR, merge with manual widgets. */
async function importWidgets(
  entries: WidgetManifestEntry[],
  appRoot: string,
  runtime: ServerRuntime,
  manual?: WidgetRegistry,
): Promise<{
  registry: WidgetRegistry;
  widgetFiles: Record<string, { html?: string; md?: string; css?: string }>;
}> {
  const registry = new WidgetRegistry();
  const rootUrl = new URL(appRoot + '/', `file://${runtime.cwd()}/`);

  for (const entry of entries) {
    try {
      const fileUrl = new URL(entry.modulePath, rootUrl).href;
      const mod = await import(fileUrl) as Record<string, unknown>;
      const instance = extractWidgetExport(mod);
      if (!instance) continue;
      registry.add(instance);
    } catch (e) {
      console.error(`[emroute] Failed to load widget ${entry.modulePath}:`, e);
    }
  }

  if (manual) {
    for (const widget of manual) {
      registry.add(widget);
    }
  }

  const widgetFiles: Record<string, { html?: string; md?: string; css?: string }> = {};
  for (const entry of entries) {
    if (entry.files) widgetFiles[entry.name] = entry.files;
  }

  return { registry, widgetFiles };
}

// ── HTML shell ─────────────────────────────────────────────────────────

/** Build a default HTML shell. */
function buildHtmlShell(title: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>@view-transition { navigation: auto; } router-slot { display: contents; }</style>
</head>
<body>
  <router-slot></router-slot>
</body>
</html>`;
}

/** Inject SSR-rendered content into an HTML shell. */
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

/** Resolve the HTML shell from config. */
async function resolveShell(
  config: EmrouteServerConfig,
  runtime: ServerRuntime,
): Promise<string> {
  if (typeof config.shell === 'string') {
    return config.shell;
  }

  if (config.shell?.path) {
    return await runtime.readTextFile(config.shell.path);
  }

  return buildHtmlShell(config.title ?? 'emroute');
}

// ── Path helpers ───────────────────────────────────────────────────────

/** Check if path looks like a file request (has extension). */
function isFileRequest(pathname: string): boolean {
  const lastSegment = pathname.split('/').pop() || '';
  return lastSegment.includes('.');
}

/** Compute a path relative to appRoot. */
function relativeToAppRoot(appRoot: string, path: string): string {
  const normalizedRoot = appRoot === '.' ? '' : appRoot.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\.\//, '');
  if (normalizedRoot && normalizedPath.startsWith(normalizedRoot + '/')) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }
  return normalizedPath;
}

// ── Static file serving ───────────────────────────────────────────────

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

// ── Compression ───────────────────────────────────────────────────────

const COMPRESSIBLE_TYPES = new Set([
  'text/html',
  'text/css',
  'text/plain',
  'text/markdown',
  'application/javascript',
  'application/json',
]);

const MIN_COMPRESS_SIZE = 1024;

/** Negotiate the best compression encoding from Accept-Encoding header. */
function negotiateEncoding(
  acceptEncoding: string,
  enabled: CompressionEncoding[],
): CompressionEncoding | null {
  // Preference order: br > gzip > deflate
  for (const enc of ['br', 'gzip', 'deflate'] as CompressionEncoding[]) {
    if (enabled.includes(enc) && acceptEncoding.includes(enc)) return enc;
  }
  return null;
}

/** Check if a content-type is compressible. */
function isCompressible(contentType: string | null): boolean {
  if (!contentType) return false;
  const base = contentType.split(';')[0].trim();
  return COMPRESSIBLE_TYPES.has(base);
}

/** Compress a response body using CompressionStream. */
function compressResponse(
  response: Response,
  encoding: CompressionEncoding,
): Response {
  const body = response.body;
  if (!body) return response;

  const compressed = body.pipeThrough(
    new CompressionStream(encoding as CompressionFormat),
  );
  const headers = new Headers(response.headers);
  headers.set('Content-Encoding', encoding);
  headers.delete('Content-Length');

  return new Response(compressed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ── createEmrouteServer ────────────────────────────────────────────────

/**
 * Create an emroute server.
 *
 * Handles SSR rendering, manifest generation, static file serving, and
 * route matching. Use `serve(port)` for a standalone server, or
 * `handleRequest(req)` to compose with your own request handling.
 *
 * Companion files (.html, .md, .css referenced by routes and widgets) are
 * loaded via `fetch()` — defaults to `file://` URLs for filesystem access,
 * works across Deno, Node 20+, and Bun.
 */
export async function createEmrouteServer(
  config: EmrouteServerConfig,
  runtime: ServerRuntime,
): Promise<EmrouteServer> {
  const {
    appRoot,
    widgetsDir,
    spa = 'root',
  } = config;

  const { html: htmlBase, md: mdBase } = config.basePath ?? DEFAULT_BASE_PATH;

  // Base URL for companion file loading (.html, .md, .css).
  // Paths in the manifest are CWD-relative, so baseUrl must be CWD-based.
  const baseUrl = config.baseUrl ?? `file://${runtime.cwd()}`;

  // ── Routes manifest ──────────────────────────────────────────────────

  let routesManifest: RoutesManifest;

  if (config.routesDir) {
    const result = await generateRoutesManifest(config.routesDir, runtime);
    routesManifest = result;
    routesManifest.moduleLoaders = createModuleLoaders(routesManifest, appRoot, runtime);

    // Write manifest file for the SPA bundle
    const code = generateManifestCode(result, '@emkodev/emroute', htmlBase, appRoot);
    await runtime.writeTextFile(`${appRoot}/routes.manifest.g.ts`, code);

    console.log(`Scanned ${config.routesDir}/`);
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

  // ── Widgets ──────────────────────────────────────────────────────────

  let widgets: WidgetRegistry | undefined = config.widgets;
  let widgetFiles: Record<string, { html?: string; md?: string; css?: string }> = {};
  let discoveredWidgetEntries: WidgetManifestEntry[] = [];

  if (widgetsDir) {
    const widgetPathPrefix = relativeToAppRoot(appRoot, widgetsDir);
    discoveredWidgetEntries = await discoverWidgets(widgetsDir, runtime, widgetPathPrefix);
    const imported = await importWidgets(
      discoveredWidgetEntries,
      appRoot,
      runtime,
      config.widgets,
    );
    widgets = imported.registry;
    widgetFiles = imported.widgetFiles;

    // Write widget manifest file for the SPA bundle
    const widgetManifestCode = generateWidgetsManifestCode(
      discoveredWidgetEntries,
      '@emkodev/emroute',
      appRoot,
    );
    await runtime.writeTextFile(`${appRoot}/widgets.manifest.g.ts`, widgetManifestCode);

    console.log(`Scanned ${widgetsDir}/`);
    console.log(`  ${discoveredWidgetEntries.length} widgets`);
  }

  // ── SSR routers ──────────────────────────────────────────────────────

  let ssrHtmlRouter: SsrHtmlRouter | null = null;
  let ssrMdRouter: SsrMdRouter | null = null;

  function buildSsrRouters(): void {
    if (spa === 'only') {
      ssrHtmlRouter = null;
      ssrMdRouter = null;
      return;
    }

    ssrHtmlRouter = new SsrHtmlRouter(prefixManifest(routesManifest, htmlBase), {
      baseUrl,
      basePath: htmlBase,
      markdownRenderer: config.markdownRenderer,
      extendContext: config.extendContext,
      widgets,
      widgetFiles,
    });

    ssrMdRouter = new SsrMdRouter(prefixManifest(routesManifest, mdBase), {
      baseUrl,
      basePath: mdBase,
      extendContext: config.extendContext,
      widgets,
      widgetFiles,
    });
  }

  buildSsrRouters();

  // ── HTML shell ───────────────────────────────────────────────────────

  const shell = await resolveShell(config, runtime);
  const title = config.title ?? 'emroute';

  // ── handleRequest ────────────────────────────────────────────────────

  async function handleRequest(req: Request): Promise<Response | null> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    const mdPrefix = mdBase + '/';
    const htmlPrefix = htmlBase + '/';

    // SSR Markdown: /md/*
    if (
      ssrMdRouter &&
      (pathname.startsWith(mdPrefix) || pathname === mdBase)
    ) {
      try {
        const { content, status, redirect } = await ssrMdRouter.render(pathname);
        if (redirect) {
          return Response.redirect(new URL(redirect, url.origin), status);
        }
        return new Response(content, {
          status,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8; variant=CommonMark' },
        });
      } catch (e) {
        console.error(`[emroute] Error rendering ${pathname}:`, e);
        return new Response('Internal Server Error', { status: 500 });
      }
    }

    // SSR HTML: /html/*
    if (
      ssrHtmlRouter &&
      (pathname.startsWith(htmlPrefix) || pathname === htmlBase)
    ) {
      try {
        const result = await ssrHtmlRouter.render(pathname);
        if (result.redirect) {
          return Response.redirect(new URL(result.redirect, url.origin), result.status);
        }
        const ssrTitle = result.title ?? title;
        const html = injectSsrContent(shell, result.content, ssrTitle, pathname);
        return new Response(html, {
          status: result.status,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      } catch (e) {
        console.error(`[emroute] Error rendering ${pathname}:`, e);
        return new Response('Internal Server Error', { status: 500 });
      }
    }

    // /html/* or /md/* that wasn't handled by SSR (e.g. 'only' mode) — serve SPA shell
    if (
      pathname.startsWith(htmlPrefix) || pathname === htmlBase ||
      pathname.startsWith(mdPrefix) || pathname === mdBase
    ) {
      return new Response(shell, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // File requests — not handled by SSR, delegate to serve() or consumer
    if (isFileRequest(pathname)) {
      return null;
    }

    // Bare paths — in root/only mode, serve SPA shell directly (router handles
    // client-side nav). In none/leaf mode, redirect to /html/* for SSR.
    if (spa === 'root' || spa === 'only') {
      return new Response(shell, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    const bare = pathname === '/' ? '' : pathname.slice(1).replace(/\/$/, '');
    return Response.redirect(new URL(`${htmlBase}/${bare}`, url.origin), 302);
  }

  // ── serve ───────────────────────────────────────────────────────────

  function serve(port: number) {
    const responseHeaders = config.responseHeaders ?? {};

    // Resolve compression config
    const compressionEncodings: CompressionEncoding[] | null = (() => {
      if (!config.compression) return null;
      if (config.compression === true) return ['br', 'gzip', 'deflate'];
      return config.compression;
    })();

    function applyHeaders(response: Response): Response {
      // Redirect responses have immutable headers
      if (response.status >= 300 && response.status < 400) return response;
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Frame-Options', 'DENY');
      for (const [k, v] of Object.entries(responseHeaders)) {
        response.headers.set(k, v);
      }
      return response;
    }

    function maybeCompress(req: Request, response: Response): Response {
      if (!compressionEncodings) return response;
      if (response.status >= 300 && response.status < 400) return response;
      if (!isCompressible(response.headers.get('Content-Type'))) return response;

      const contentLength = response.headers.get('Content-Length');
      if (contentLength && parseInt(contentLength) < MIN_COMPRESS_SIZE) return response;

      const acceptEncoding = req.headers.get('Accept-Encoding') ?? '';
      const encoding = negotiateEncoding(acceptEncoding, compressionEncodings);
      if (!encoding) return response;

      return compressResponse(response, encoding);
    }

    return runtime.serve(port, async (req) => {
      // Try SSR routes and bare paths first
      const response = await handleRequest(req);
      if (response) return maybeCompress(req, applyHeaders(response));

      // Static file serving from appRoot
      const url = new URL(req.url);
      const pathname = url.pathname;

      if (!isAllowedStaticFile(pathname)) {
        return applyHeaders(new Response('Not Found', { status: 404 }));
      }

      const filePath = safePath(appRoot, pathname);
      if (!filePath) {
        return applyHeaders(new Response('Forbidden', { status: 403 }));
      }

      const fileResponse = await runtime.serveStaticFile(req, filePath);
      return maybeCompress(req, applyHeaders(fileResponse));
    });
  }

  // ── rebuild ──────────────────────────────────────────────────────────

  async function rebuild(): Promise<void> {
    if (config.routesDir) {
      const result = await generateRoutesManifest(config.routesDir, runtime);
      routesManifest = result;
      routesManifest.moduleLoaders = createModuleLoaders(routesManifest, appRoot, runtime);

      const code = generateManifestCode(result, '@emkodev/emroute', htmlBase, appRoot);
      await runtime.writeTextFile(`${appRoot}/routes.manifest.g.ts`, code);
    }

    if (widgetsDir) {
      const widgetPathPrefix = relativeToAppRoot(appRoot, widgetsDir);
      discoveredWidgetEntries = await discoverWidgets(widgetsDir, runtime, widgetPathPrefix);
      const imported = await importWidgets(
        discoveredWidgetEntries,
        appRoot,
        runtime,
        config.widgets,
      );
      widgets = imported.registry;
      widgetFiles = imported.widgetFiles;

      const widgetManifestCode = generateWidgetsManifestCode(
        discoveredWidgetEntries,
        '@emkodev/emroute',
        appRoot,
      );
      await runtime.writeTextFile(`${appRoot}/widgets.manifest.g.ts`, widgetManifestCode);
    }

    buildSsrRouters();
  }

  // ── Return ───────────────────────────────────────────────────────────

  return {
    handleRequest,
    serve,
    rebuild,
    get htmlRouter() {
      return ssrHtmlRouter;
    },
    get mdRouter() {
      return ssrMdRouter;
    },
    get manifest() {
      return routesManifest;
    },
    get widgetEntries() {
      return discoveredWidgetEntries;
    },
    get shell() {
      return shell;
    },
  };
}

// ── Entry point generation ────────────────────────────────────────────

const GENERATED_MAIN = '_main.g.ts';

/** Generate main.ts content for the SPA bundle. */
export function generateMainTs(
  spa: SpaMode,
  hasRoutes: boolean,
  hasWidgets: boolean,
  importPath: string,
  basePath?: BasePath,
): string {
  const imports: string[] = [];
  const body: string[] = [];

  imports.push(`import { ComponentElement } from '${importPath}';`);

  if (hasRoutes) {
    imports.push(`import { routesManifest } from './routes.manifest.g.ts';`);
  }

  if (hasWidgets) {
    imports.push(`import { widgetsManifest } from './widgets.manifest.g.ts';`);
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

  if ((spa === 'root' || spa === 'only') && hasRoutes) {
    imports.push(`import { createSpaHtmlRouter } from '${importPath}';`);
    const bpOpt = basePath ? `basePath: { html: '${basePath.html}', md: '${basePath.md}' }` : '';
    const opts = bpOpt ? `{ ${bpOpt} }` : '';
    body.push(`await createSpaHtmlRouter(routesManifest${opts ? `, ${opts}` : ''});`);
  }

  return `/** Auto-generated entry point — do not edit. */\n${imports.join('\n')}\n\n${
    body.join('\n')
  }\n`;
}

// ── build ─────────────────────────────────────────────────────────────

/** The bare import specifier used by generated entry points. */
const CORE_IMPORT_SPECIFIER = '@emkodev/emroute/spa';

/**
 * Build static output for deployment.
 *
 * Produces two JS bundles:
 * - **Core bundle** (`emroute.js`): emroute framework — router, custom elements,
 *   hydration. Changes only when emroute is upgraded. Skipped when `coreBundle`
 *   is `'cdn'` or a URL.
 * - **App bundle** (`app.js`): consumer code — routes, widgets, manifests.
 *   Imports core via bare `@emkodev/emroute/spa` specifier, left as external.
 *
 * The HTML shell includes an import map that resolves the bare specifier to
 * either the local core bundle or a CDN URL.
 *
 * For `none` mode, no JS bundles are produced — only manifests and shell.
 */
export async function build(
  config: BuildConfig,
  runtime: ServerRuntime,
): Promise<BuildResult> {
  const {
    appRoot,
    routesDir,
    widgetsDir,
    outDir = appRoot,
    spa = 'root',
    basePath,
    coreBundle: coreBundleStrategy = 'build',
  } = config;

  const bundler = config.bundler;
  const minSuffix = config.minify ? '.min' : '';

  // Generate manifests via createEmrouteServer
  const emroute = await createEmrouteServer({
    appRoot,
    routesDir,
    widgetsDir,
    spa,
    basePath,
  }, runtime);

  const manifestsResult: BuildResult['manifests'] = {
    routes: `${appRoot}/routes.manifest.g.ts`,
  };
  if (widgetsDir) {
    manifestsResult.widgets = `${appRoot}/widgets.manifest.g.ts`;
  }

  // Generate entry point (or use consumer's)
  let entryPoint: string;
  if (config.entryPoint) {
    entryPoint = `${appRoot}/${config.entryPoint}`;
  } else {
    const hasRoutes = true;
    const hasWidgets = widgetsDir !== undefined;
    const mainCode = generateMainTs(
      spa,
      hasRoutes,
      hasWidgets,
      CORE_IMPORT_SPECIFIER,
      basePath,
    );
    entryPoint = `${appRoot}/${GENERATED_MAIN}`;
    await runtime.writeTextFile(entryPoint, mainCode);
  }

  // Create output directory
  await runtime.mkdir(outDir, { recursive: true });

  // Detect main.css for style injection
  const hasMainCss = (await runtime.stat(`${appRoot}/main.css`)) !== null;
  const styleTag = hasMainCss ? `<link rel="stylesheet" href="/main.css">` : '';

  if (spa === 'none') {
    let noneShell = emroute.shell;
    if (styleTag) noneShell = noneShell.replace('</head>', `  ${styleTag}\n</head>`);
    const shellPath = `${outDir}/index.html`;
    await runtime.writeTextFile(shellPath, noneShell);
    console.log(`Build complete → ${outDir}/ (no JS — spa='none')`);
    return {
      coreBundle: null,
      coreBundleCdn: null,
      appBundle: null,
      shell: shellPath,
      manifests: manifestsResult,
    };
  }

  // ── Core bundle ───────────────────────────────────────────────────

  if (!bundler) {
    throw new Error('build() requires config.bundler when spa is not "none"');
  }

  let coreBundlePath: string | null = null;
  let coreBundleCdn: string | null = null;
  let coreUrl: string;

  if (coreBundleStrategy === 'cdn') {
    // TODO: resolve versioned CDN URL from package version
    coreBundleCdn = `https://cdn.jsr.io/@emkodev/emroute/dist/emroute${minSuffix}.js`;
    coreUrl = coreBundleCdn;
    console.log(`Core bundle: CDN → ${coreUrl}`);
  } else if (coreBundleStrategy !== 'build') {
    // Custom CDN URL
    coreBundleCdn = coreBundleStrategy;
    coreUrl = coreBundleCdn;
    console.log(`Core bundle: CDN → ${coreUrl}`);
  } else {
    // Build core locally
    const coreEntry = runtime.resolveModule(CORE_IMPORT_SPECIFIER);
    coreBundlePath = `${outDir}/emroute${minSuffix}.js`;
    await bundler.bundle(coreEntry, coreBundlePath, {
      platform: 'browser',
      minify: config.minify,
      obfuscate: config.obfuscate,
      sourcemap: config.sourcemap,
    });
    coreUrl = `/${coreBundlePath.replace(outDir + '/', '')}`;
    console.log(`Core bundle: ${coreEntry} → ${coreBundlePath}`);
  }

  // ── App bundle ────────────────────────────────────────────────────

  const appBundle = `${outDir}/app${minSuffix}.js`;
  await bundler.bundle(entryPoint, appBundle, {
    platform: 'browser',
    minify: config.minify,
    obfuscate: config.obfuscate,
    sourcemap: config.sourcemap,
    external: [CORE_IMPORT_SPECIFIER],
  });
  console.log(`App bundle:  ${entryPoint} → ${appBundle}`);

  // ── HTML shell with import map ────────────────────────────────────

  const importMap = JSON.stringify({
    imports: { [CORE_IMPORT_SPECIFIER]: coreUrl },
  });
  const importMapTag = `<script type="importmap">${importMap}</script>`;
  const appScriptTag = `<script type="module" src="/${
    appBundle.replace(outDir + '/', '')
  }"></script>`;

  let shellHtml = emroute.shell.replace(
    '</head>',
    `  ${importMapTag}\n</head>`,
  ).replace(
    '</body>',
    `${appScriptTag}\n</body>`,
  );
  if (styleTag) {
    shellHtml = shellHtml.replace('</head>', `  ${styleTag}\n</head>`);
  }

  const shellPath = `${outDir}/index.html`;
  await runtime.writeTextFile(shellPath, shellHtml);

  console.log(`Build complete → ${outDir}/`);

  return {
    coreBundle: coreBundlePath,
    coreBundleCdn,
    appBundle,
    shell: shellPath,
    manifests: manifestsResult,
  };
}
