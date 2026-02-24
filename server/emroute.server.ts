/**
 * Emroute Server
 *
 * Runtime-agnostic server that handles SSR rendering, manifest resolution,
 * static file serving, and route matching. Works with any Runtime implementation.
 *
 * Usage (standalone):
 * ```ts
 * import { createEmrouteServer } from '@emkodev/emroute/server';
 * import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';
 *
 * const runtime = new BunFsRuntime('.', { routesDir: '/routes' });
 * const emroute = await createEmrouteServer({ spa: 'root' }, runtime);
 *
 * Bun.serve({ fetch: (req) => emroute.handleRequest(req) ?? new Response('Not Found', { status: 404 }) });
 * ```
 *
 * Usage (composable):
 * ```ts
 * const emroute = await createEmrouteServer(config, runtime);
 *
 * Bun.serve({ async fetch(req) {
 *   if (isApiRoute(req)) return handleApi(req);
 *   const response = await emroute.handleRequest(req);
 *   if (response) return response;
 *   return new Response('Not Found', { status: 404 });
 * }});
 * ```
 */

import { DEFAULT_BASE_PATH, prefixManifest } from '../src/route/route.core.ts';
import { SsrHtmlRouter } from '../src/renderer/ssr/html.renderer.ts';
import { SsrMdRouter } from '../src/renderer/ssr/md.renderer.ts';
import type { RoutesManifest } from '../src/type/route.type.ts';
import type { WidgetManifestEntry } from '../src/type/widget.type.ts';
import { WidgetRegistry } from '../src/widget/widget.registry.ts';
import type { WidgetComponent } from '../src/component/widget.component.ts';
import { escapeHtml } from '../src/util/html.util.ts';
import {
  ROUTES_MANIFEST_PATH,
  Runtime,
  WIDGETS_MANIFEST_PATH,
} from '../runtime/abstract.runtime.ts';
import type { EmrouteServer, EmrouteServerConfig } from './server-api.type.ts';

// ── Module loaders ─────────────────────────────────────────────────────

/**
 * Create module loaders for server-side SSR imports.
 * Uses `runtime.loadModule()` — each runtime decides how to load modules
 * (filesystem import, SQLite transpile + blob URL, etc.).
 */
function createModuleLoaders(
  manifest: RoutesManifest,
  runtime: Runtime,
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

  for (const path of modulePaths) {
    loaders[path] = () => runtime.loadModule(path);
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

/** Import widget modules for SSR via runtime.loadModule(). */
async function importWidgets(
  entries: WidgetManifestEntry[],
  runtime: Runtime,
  manual?: WidgetRegistry,
): Promise<{
  registry: WidgetRegistry;
  widgetFiles: Record<string, { html?: string; md?: string; css?: string }>;
}> {
  const registry = new WidgetRegistry();

  for (const entry of entries) {
    try {
      const runtimePath = entry.modulePath.startsWith('/')
        ? entry.modulePath
        : `/${entry.modulePath}`;

      const mod = await runtime.loadModule(runtimePath) as Record<string, unknown>;
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

/** Read the HTML shell from runtime, with fallback to a default shell. */
async function resolveShell(
  runtime: Runtime,
  title: string,
): Promise<string> {
  const response = await runtime.query('/index.html');
  if (response.status !== 404) return await response.text();
  return buildHtmlShell(title);
}

// ── More path helpers ─────────────────────────────────────────────────

/** Deserialize a routes manifest from JSON (statusPages array → Map). */
// deno-lint-ignore no-explicit-any
function deserializeManifest(raw: any): RoutesManifest {
  return {
    routes: raw.routes,
    errorBoundaries: raw.errorBoundaries,
    statusPages: new Map(raw.statusPages ?? []),
    errorHandler: raw.errorHandler,
  };
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

  const { html: htmlBase, md: mdBase } = config.basePath ?? DEFAULT_BASE_PATH;

  // ── Routes manifest (read from runtime) ─────────────────────────────

  let routesManifest: RoutesManifest;

  if (config.routesManifest) {
    routesManifest = config.routesManifest;
  } else {
    const manifestResponse = await runtime.query(ROUTES_MANIFEST_PATH);
    if (manifestResponse.status === 404) {
      throw new Error(
        `[emroute] ${ROUTES_MANIFEST_PATH} not found in runtime. ` +
          'Provide routesManifest in config or ensure the runtime produces it.',
      );
    }
    const raw = await manifestResponse.json();
    routesManifest = deserializeManifest(raw);
  }

  routesManifest.moduleLoaders = createModuleLoaders(routesManifest, runtime);

  // ── Widgets (read from runtime) ────────────────────────────────────

  let widgets: WidgetRegistry | undefined = config.widgets;
  let widgetFiles: Record<string, { html?: string; md?: string; css?: string }> = {};
  let discoveredWidgetEntries: WidgetManifestEntry[] = [];

  const widgetsResponse = await runtime.query(WIDGETS_MANIFEST_PATH);
  if (widgetsResponse.status !== 404) {
    discoveredWidgetEntries = await widgetsResponse.json();
    const imported = await importWidgets(discoveredWidgetEntries, runtime, config.widgets);
    widgets = imported.registry;
    widgetFiles = imported.widgetFiles;
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

  // ── Bundling (runtime decides whether/how to bundle) ────────────────

  await runtime.bundle();

  // ── HTML shell ───────────────────────────────────────────────────────

  const title = config.title ?? 'emroute';
  let shell = await resolveShell(runtime, title);

  // Auto-discover main.css and inject <link> into <head>
  if ((await runtime.query('/main.css')).status !== 404) {
    shell = shell.replace('</head>', '  <link rel="stylesheet" href="/main.css">\n</head>');
  }

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

    // Static files — only try runtime for paths with a file extension
    const lastSegment = pathname.split('/').pop() ?? '';
    if (lastSegment.includes('.')) {
      const fileResponse = await runtime.handle(pathname);
      if (fileResponse.status === 200) return fileResponse;
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

  // ── Return ───────────────────────────────────────────────────────────

  return {
    handleRequest,
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
