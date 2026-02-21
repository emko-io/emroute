/**
 * Emroute Server
 *
 * Runtime-agnostic server that handles SSR rendering, manifest generation,
 * static file serving, and route matching. Works with any Runtime implementation
 * (Deno, Node, Bun).
 *
 * Usage (standalone):
 * ```ts
 * import { createEmrouteServer } from '@emkodev/emroute/server';
 * import { DenoFsRuntime } from '@emkodev/emroute/server/deno';
 *
 * const runtime = new DenoFsRuntime('.');
 * const emroute = await createEmrouteServer({ spa: 'root' }, runtime);
 *
 * Deno.serve((req) => emroute.handleRequest(req) ?? new Response('Not Found', { status: 404 }));
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
import { Runtime } from './runtime/abstract.runtime.ts';
import type {
  BuildConfig,
  BuildResult,
  EmrouteServer,
  EmrouteServerConfig,
} from './server-api.type.ts';

// ── Module loaders ─────────────────────────────────────────────────────

/**
 * Import a module from source via Runtime.bundle() + blob URL.
 *
 * Bundles the file (inlining relative imports, externalizing framework
 * specifiers) and imports the result via blob URL. The consumer's import
 * map resolves the external bare specifiers.
 */
async function importFromRuntime(
  path: string,
  runtime: Runtime,
): Promise<unknown> {
  const Ctor = runtime.constructor as typeof Runtime;
  const js = await Ctor.bundle(
    path,
    (p) => runtime.query(p, { as: 'text' }).catch(() => null),
    { external: [...EMROUTE_EXTERNALS] },
  );
  const blob = new Blob([js], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    return await import(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Create module loaders for server-side SSR imports.
 *
 * Uses the consumer-provided `moduleLoader` callback when available.
 * Falls back to Runtime.bundle() + blob URL import — bundles each .page.ts
 * with framework imports as externals, then imports the bundled JS via blob URL.
 */
function createModuleLoaders(
  manifest: RoutesManifest,
  runtime: Runtime,
  moduleLoader?: (path: string) => Promise<unknown>,
): Record<string, () => Promise<unknown>> {
  const loaders: Record<string, () => Promise<unknown>> = {};

  const load = moduleLoader ?? ((path: string) => importFromRuntime(path, runtime));

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

  for (const path of modulePaths) {
    loaders[path] = () => load(path);
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

/** Import widget modules for SSR via moduleLoader or Runtime.bundle() + blob URL. */
async function importWidgets(
  entries: WidgetManifestEntry[],
  runtime: Runtime,
  moduleLoader?: (path: string) => Promise<unknown>,
  manual?: WidgetRegistry,
): Promise<{
  registry: WidgetRegistry;
  widgetFiles: Record<string, { html?: string; md?: string; css?: string }>;
}> {
  const registry = new WidgetRegistry();
  const load = moduleLoader ?? ((path: string) => importFromRuntime(path, runtime));

  for (const entry of entries) {
    try {
      const runtimePath = entry.modulePath.startsWith('/')
        ? entry.modulePath
        : `/${entry.modulePath}`;

      const mod = await load(runtimePath) as Record<string, unknown>;
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

/**
 * Resolve the HTML shell from config, with auto-discovery.
 *
 * Resolution order:
 * 1. `config.shell` as string → use as-is
 * 2. `config.shell.path` → read from file
 * 3. `/index.html` → use consumer's index.html (Runtime-relative)
 * 4. Fallback → build default shell
 *
 * When spa !== 'none' and an entryPoint is provided, injects a `<script>` tag.
 * Auto-discovers `/main.css` and injects a `<link>` tag.
 */
/** Bundle output paths. */
const BUNDLE_PATHS = {
  emroute: '/emroute.js',
  widgets: '/widgets.js',
  app: '/app.js',
} as const;

/** Emroute bare specifiers to externalize when bundling consumer code. */
const EMROUTE_EXTERNALS = [
  '@emkodev/emroute/spa',
  '@emkodev/emroute/overlay',
  '@emkodev/emroute',
] as const;

async function resolveShell(
  config: EmrouteServerConfig,
  runtime: Runtime,
  bundles: { importMap?: Record<string, string>; entryScript?: string },
): Promise<string> {
  const { spa = 'root' } = config;

  let shell: string;

  if (typeof config.shell === 'string') {
    shell = config.shell;
  } else if (config.shell?.path) {
    shell = await runtime.query(config.shell.path, { as: 'text' });
  } else {
    const response = await runtime.query('/index.html');
    shell = response.status !== 404
      ? await response.text()
      : buildHtmlShell(config.title ?? 'emroute');
  }

  // Inject import map + entry script for SPA
  if (spa !== 'none' && bundles.importMap) {
    const importMapTag = `<script type="importmap">${
      JSON.stringify({ imports: bundles.importMap })
    }</script>`;
    shell = shell.replace('</head>', `  ${importMapTag}\n</head>`);
  }
  if (spa !== 'none' && bundles.entryScript) {
    const scriptTag = `<script type="module" src="${bundles.entryScript}"></script>`;
    shell = shell.replace('</body>', `${scriptTag}\n</body>`);
  }

  // Auto-discover main.css
  if ((await runtime.query('/main.css')).status !== 404) {
    const styleTag = '<link rel="stylesheet" href="/main.css">';
    shell = shell.replace('</head>', `  ${styleTag}\n</head>`);
  }

  return shell;
}

// ── More path helpers ─────────────────────────────────────────────────

/** Check if path looks like a file request (has extension). */
function isFileRequest(pathname: string): boolean {
  const lastSegment = pathname.split('/').pop() || '';
  return lastSegment.includes('.');
}

// ── createEmrouteServer ────────────────────────────────────────────────

/**
 * Create an emroute server.
 *
 * All paths are Runtime-relative (starting with `/`). Runtime root = appRoot.
 */
export async function createEmrouteServer(
  config: EmrouteServerConfig,
  runtime: Runtime,
): Promise<EmrouteServer> {
  const {
    spa = 'root',
  } = config;

  // ── Paths are Runtime-relative (Runtime root = appRoot) ────────────
  const routesDirName = config.routesDir ?? (config.routesManifest ? undefined : 'routes');
  const routesDir = routesDirName ? `/${routesDirName}` : undefined;
  const widgetsDirName = config.widgetsDir ?? 'widgets';
  const widgetsDir = (await runtime.query(`/${widgetsDirName}/`)).status !== 404
    ? `/${widgetsDirName}`
    : undefined;

  const { html: htmlBase, md: mdBase } = config.basePath ?? DEFAULT_BASE_PATH;

  // ── Routes manifest ──────────────────────────────────────────────────

  let routesManifest: RoutesManifest;

  if (routesDir) {
    const result = await generateRoutesManifest(routesDir, runtime);

    // Write manifest file for the SPA bundle (paths already Runtime-relative)
    const code = generateManifestCode(result, '@emkodev/emroute', htmlBase);
    await runtime.command('/routes.manifest.g.ts', { body: code });

    routesManifest = result;
    routesManifest.moduleLoaders = createModuleLoaders(routesManifest, runtime, config.moduleLoader);

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

  // ── Widgets ──────────────────────────────────────────────────────────

  let widgets: WidgetRegistry | undefined = config.widgets;
  let widgetFiles: Record<string, { html?: string; md?: string; css?: string }> = {};
  let discoveredWidgetEntries: WidgetManifestEntry[] = [];

  if (widgetsDir) {
    discoveredWidgetEntries = await discoverWidgets(widgetsDir, runtime, widgetsDirName);
    const imported = await importWidgets(
      discoveredWidgetEntries,
      runtime,
      config.moduleLoader,
      config.widgets,
    );
    widgets = imported.registry;
    widgetFiles = imported.widgetFiles;

    // Write widget manifest file for the SPA bundle
    const widgetManifestCode = generateWidgetsManifestCode(
      discoveredWidgetEntries,
      '@emkodev/emroute',
    );
    await runtime.command('/widgets.manifest.g.ts', { body: widgetManifestCode });

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
      fileReader: (path) => runtime.query(path, { as: 'text' }),
      basePath: htmlBase,
      markdownRenderer: config.markdownRenderer,
      extendContext: config.extendContext,
      widgets,
      widgetFiles,
    });

    ssrMdRouter = new SsrMdRouter(prefixManifest(routesManifest, mdBase), {
      fileReader: (path) => runtime.query(path, { as: 'text' }),
      basePath: mdBase,
      extendContext: config.extendContext,
      widgets,
      widgetFiles,
    });
  }

  buildSsrRouters();

  // ── Detect pre-built bundles ────────────────────────────────────────
  // Bundling is NOT a server concern — it's a build step that runs
  // externally (deno task, npm script, esbuild, etc.). The server just
  // detects what's available and builds the import map accordingly.

  const importMap: Record<string, string> = {};
  let entryScript: string | undefined;

  if (spa !== 'none') {
    const hasEmroute = (await runtime.query(BUNDLE_PATHS.emroute)).status === 200;
    const hasWidgets = widgetsDir && (await runtime.query(BUNDLE_PATHS.widgets)).status === 200;
    const hasApp = (await runtime.query(BUNDLE_PATHS.app)).status === 200;

    if (hasEmroute) {
      for (const specifier of EMROUTE_EXTERNALS) {
        importMap[specifier] = BUNDLE_PATHS.emroute;
      }
    }
    if (hasWidgets) {
      importMap['/widgets.manifest.g.ts'] = BUNDLE_PATHS.widgets;
    }
    if (hasApp) {
      entryScript = BUNDLE_PATHS.app;
    }

    const found = [
      hasEmroute ? 'emroute.js' : null,
      hasWidgets ? 'widgets.js' : null,
      hasApp ? 'app.js' : null,
    ].filter(Boolean);
    if (found.length) {
      console.log(`Bundles: ${found.join(' + ')}`);
    } else {
      console.warn(
        '[emroute] No bundles found — JS features disabled. Run your bundle task first.',
      );
    }
  }

  // ── HTML shell ───────────────────────────────────────────────────────

  const shell = await resolveShell(config, runtime, { importMap, entryScript });
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

    // File requests — pass through to runtime (bundled JS, CSS, images, etc.)
    if (isFileRequest(pathname)) {
      const response = await runtime.handle(pathname);
      if (response.status === 200) return response;
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

  // ── rebuild ──────────────────────────────────────────────────────────

  async function rebuild(): Promise<void> {
    if (routesDir) {
      const result = await generateRoutesManifest(routesDir, runtime);
      const code = generateManifestCode(result, '@emkodev/emroute', htmlBase);
      await runtime.command('/routes.manifest.g.ts', { body: code });

      routesManifest = result;
      routesManifest.moduleLoaders = createModuleLoaders(routesManifest, runtime, config.moduleLoader);
    }

    if (widgetsDir) {
      discoveredWidgetEntries = await discoverWidgets(widgetsDir, runtime, widgetsDirName);
      const imported = await importWidgets(
        discoveredWidgetEntries,
        runtime,
        config.moduleLoader,
        config.widgets,
      );
      widgets = imported.registry;
      widgetFiles = imported.widgetFiles;

      const widgetManifestCode = generateWidgetsManifestCode(
        discoveredWidgetEntries,
        '@emkodev/emroute',
      );
      await runtime.command('/widgets.manifest.g.ts', { body: widgetManifestCode });
    }

    buildSsrRouters();
  }

  // ── Return ───────────────────────────────────────────────────────────

  return {
    handleRequest,
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

  const spaImport = `${importPath}/spa`;

  if (hasRoutes) {
    imports.push(`import { routesManifest } from './routes.manifest.g.ts';`);
  }

  if (hasWidgets) {
    imports.push(`import { ComponentElement } from '${spaImport}';`);
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
    imports.push(`import { createSpaHtmlRouter } from '${spaImport}';`);
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
  runtime: Runtime,
): Promise<BuildResult> {
  const {
    routesDir,
    widgetsDir,
    outDir = '/',
    spa = 'root',
    basePath,
    coreBundle: coreBundleStrategy = 'build',
  } = config;

  const bundler = config.bundler;
  const minSuffix = config.minify ? '.min' : '';

  // Generate manifests via createEmrouteServer
  const emroute = await createEmrouteServer({
    routesDir,
    widgetsDir,
    spa,
    basePath,
  }, runtime);

  const manifestsResult: BuildResult['manifests'] = {
    routes: '/routes.manifest.g.ts',
  };
  if (widgetsDir) {
    manifestsResult.widgets = '/widgets.manifest.g.ts';
  }

  // Generate entry point (or use consumer's)
  let entryPoint: string;
  if (config.entryPoint) {
    entryPoint = `/${config.entryPoint}`;
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
    entryPoint = `/${GENERATED_MAIN}`;
    await runtime.command(entryPoint, { body: mainCode });
  }

  // Detect main.css for style injection
  const hasMainCss = (await runtime.query('/main.css')).status !== 404;
  const styleTag = hasMainCss ? `<link rel="stylesheet" href="/main.css">` : '';

  if (spa === 'none') {
    let noneShell = emroute.shell;
    if (styleTag) noneShell = noneShell.replace('</head>', `  ${styleTag}\n</head>`);
    const shellPath = `${outDir}/index.html`;
    await runtime.command(shellPath, { body: noneShell });
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
    const coreEntry = import.meta.resolve(CORE_IMPORT_SPECIFIER);
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
  await runtime.command(shellPath, { body: shellHtml });

  console.log(`Build complete → ${outDir}/`);

  return {
    coreBundle: coreBundlePath,
    coreBundleCdn,
    appBundle,
    shell: shellPath,
    manifests: manifestsResult,
  };
}

// ── Deprecated re-exports ─────────────────────────────────────────────

/** @deprecated Import from '@emkodev/emroute/bundler/deno' instead. */
export { denoBundler } from './deno.bundler.ts';
