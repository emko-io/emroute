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

import { DEFAULT_BASE_PATH } from '../src/route/route.core.ts';
import { RouteTrie } from '../src/route/route.trie.ts';
import { SsrHtmlRouter } from '../src/renderer/ssr/html.renderer.ts';
import { SsrMdRouter } from '../src/renderer/ssr/md.renderer.ts';
import type { RouteNode } from '../src/type/route-tree.type.ts';
import type { WidgetManifestEntry } from '../src/type/widget.type.ts';
import { WidgetRegistry } from '../src/widget/widget.registry.ts';
import type { WidgetComponent } from '../src/component/widget.component.ts';
import { escapeHtml } from '../src/util/html.util.ts';
import { rewriteMdLinks } from '../src/util/md.util.ts';
import {
  ROUTES_MANIFEST_PATH,
  Runtime,
  WIDGETS_MANIFEST_PATH,
} from '../runtime/abstract.runtime.ts';
import type { EmrouteServer, EmrouteServerConfig } from './server-api.type.ts';

// ── Module loaders ─────────────────────────────────────────────────────

/**
 * Collect all .ts module paths from a RouteNode tree and create loaders.
 * Uses `runtime.loadModule()` — each runtime decides how to load modules
 * (filesystem import, SQLite transpile + blob URL, etc.).
 */
function createModuleLoaders(
  tree: RouteNode,
  runtime: Runtime,
): Record<string, () => Promise<unknown>> {
  const paths = new Set<string>();

  function walk(node: RouteNode): void {
    if (node.files?.ts) paths.add(node.files.ts);
    if (node.redirect) paths.add(node.redirect);
    if (node.errorBoundary) paths.add(node.errorBoundary);

    if (node.children) {
      for (const child of Object.values(node.children)) walk(child);
    }
    if (node.dynamic) walk(node.dynamic.child);
    if (node.wildcard) walk(node.wildcard.child);
  }

  walk(tree);

  const loaders: Record<string, () => Promise<unknown>> = {};
  for (const path of paths) {
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
function buildHtmlShell(title: string, htmlBase: string): string {
  const baseTag = htmlBase ? `\n  <base href="${escapeHtml(htmlBase)}/">` : '';
  return `<!DOCTYPE html>
<html>
<head>${baseTag}
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
  htmlBase: string,
): Promise<string> {
  const response = await runtime.query('/index.html');
  if (response.status !== 404) return await response.text();
  return buildHtmlShell(title, htmlBase);
}

// ── More path helpers ─────────────────────────────────────────────────

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

  // Let the runtime know the SPA mode so bundle() can skip when 'none'.
  runtime.config.spa = spa;

  const { html: htmlBase, md: mdBase } = config.basePath ?? DEFAULT_BASE_PATH;

  // ── Route tree (read from runtime) ──────────────────────────────────

  let routeTree: RouteNode;

  if (config.routeTree) {
    routeTree = config.routeTree;
  } else {
    const manifestResponse = await runtime.query(ROUTES_MANIFEST_PATH);
    if (manifestResponse.status === 404) {
      throw new Error(
        `[emroute] ${ROUTES_MANIFEST_PATH} not found in runtime. ` +
          'Provide routeTree in config or ensure the runtime produces it.',
      );
    }
    routeTree = await manifestResponse.json();
  }

  const moduleLoaders = createModuleLoaders(routeTree, runtime);
  const resolver = new RouteTrie(routeTree);

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

    ssrHtmlRouter = new SsrHtmlRouter(resolver, {
      fileReader: (path) => runtime.query(path, { as: 'text' }),
      moduleLoaders,
      markdownRenderer: config.markdownRenderer,
      extendContext: config.extendContext,
      widgets,
      widgetFiles,
    });

    ssrMdRouter = new SsrMdRouter(resolver, {
      fileReader: (path) => runtime.query(path, { as: 'text' }),
      moduleLoaders,
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
  let shell = await resolveShell(runtime, title, htmlBase);

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
      // Normalize trailing slash: /md/about/ → 301 /md/about
      const routePath = pathname === mdBase ? '/' : pathname.slice(mdBase.length);
      if (routePath.length > 1 && routePath.endsWith('/')) {
        const canonical = mdBase + routePath.slice(0, -1) + (url.search || '');
        return Response.redirect(new URL(canonical, url.origin), 301);
      }
      try {
        const routeUrl = new URL(routePath + url.search, url.origin);
        const { content, status, redirect } = await ssrMdRouter.render(routeUrl, req.signal);
        if (redirect) {
          const target = redirect.startsWith('/') ? mdBase + redirect : redirect;
          return Response.redirect(new URL(target, url.origin), status);
        }
        return new Response(rewriteMdLinks(content, mdBase, [mdBase, htmlBase]), {
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
      // Normalize trailing slash: /html/about/ → 301 /html/about
      const routePath = pathname === htmlBase ? '/' : pathname.slice(htmlBase.length);
      if (routePath.length > 1 && routePath.endsWith('/')) {
        const canonical = htmlBase + routePath.slice(0, -1) + (url.search || '');
        return Response.redirect(new URL(canonical, url.origin), 301);
      }
      try {
        const routeUrl = new URL(routePath + url.search, url.origin);
        const result = await ssrHtmlRouter.render(routeUrl, req.signal);
        if (result.redirect) {
          const target = result.redirect.startsWith('/') ? htmlBase + result.redirect : result.redirect;
          return Response.redirect(new URL(target, url.origin), result.status);
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
      return null;
    }

    // Bare paths — redirect to /html/* in all modes.
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
    get routeTree() {
      return routeTree;
    },
    get widgetEntries() {
      return discoveredWidgetEntries;
    },
    get shell() {
      return shell;
    },
  };
}
