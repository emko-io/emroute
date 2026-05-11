/**
 * Emroute
 *
 * Framework entry point. Reads manifests from Runtime,
 * builds Pipeline + Renderers, handles Request → Response.
 */

import type { WidgetManifestEntry } from '../type/widget.type.ts';
import type { Runtime } from '../runtime/abstract.runtime.ts';
import { Pipeline } from '../pipeline/pipeline.ts';
import { SsrHtmlRenderer } from '../renderer/html.renderer.ts';
import { SsrMdRenderer } from '../renderer/md.renderer.ts';
import { escapeHtml } from '../util/html.util.ts';
import { rewriteMdLinks } from '../util/md.util.ts';
import type { RouteNode } from '../type/route-tree.type.ts';
import type { MarkdownRenderer } from '../type/markdown.type.ts';
import type { SpaMode } from '../type/widget.type.ts';
import type { ContextProvider } from '../type/component.type.ts';
import {
  ROUTES_MANIFEST_PATH,
  WIDGETS_MANIFEST_PATH,
} from '../runtime/abstract.runtime.ts';
export const DEFAULT_BASE_PATH = { html: '/html', md: '/md', app: '/app' };
export type BasePath = Record<keyof typeof DEFAULT_BASE_PATH, string>;

/** Context passed to the `shell` function in `Emroute.create()`. */
export interface ShellContext {
  runtime: Runtime;
  spa: SpaMode;
  basePath: BasePath;
  title: string;
}

export class Emroute {
  readonly htmlRenderer: SsrHtmlRenderer | null;
  readonly mdRenderer: SsrMdRenderer | null;
  readonly shell: string;

  private constructor(
    htmlRenderer: SsrHtmlRenderer | null,
    mdRenderer: SsrMdRenderer | null,
    shell: string,
    private readonly runtime: Runtime,
    private readonly htmlBase: string,
    private readonly mdBase: string,
    private readonly appBase: string,
    private readonly spa: string,
    private readonly title: string,
  ) {
    this.htmlRenderer = htmlRenderer;
    this.mdRenderer = mdRenderer;
    this.shell = shell;
  }

  static async create(
    config: {
      routeTree?: RouteNode;
      /** @deprecated Widgets are resolved from the manifest via Runtime. This option is ignored. */
      widgets?: unknown;
      spa?: SpaMode;
      basePath?: BasePath;
      title?: string;
      markdownRenderer?: MarkdownRenderer;
      extendContext?: ContextProvider;
      moduleLoaders?: Record<string, () => Promise<unknown>>;
      shell?: (context: ShellContext) => string | Promise<string>;
    },
    runtime: Runtime,
  ): Promise<Emroute> {
    const { spa = 'root' } = config;
    const { html: htmlBase, md: mdBase, app: appBase } = config.basePath ?? DEFAULT_BASE_PATH;

    // ── Verify route manifest exists ──────────────────────────────────
    // When the caller supplies a routeTree (e.g. SPA boot already fetched
    // the manifest), skip the verify-fetch — it's a redundant round-trip
    // on every cold load.

    if (!config.routeTree) {
      const manifestResponse = await runtime.query(ROUTES_MANIFEST_PATH);
      if (manifestResponse.status === 404) {
        throw new Error(
          `[emroute] ${ROUTES_MANIFEST_PATH} not found in runtime. ` +
            'Provide routeTree in config or ensure the runtime produces it.',
        );
      }
    }

    // ── Pipeline ──────────────────────────────────────────────────────

    const pipeline = new Pipeline({
      runtime,
      ...(config.extendContext ? { contextProvider: config.extendContext } : {}),
      ...(config.moduleLoaders ? { moduleLoaders: config.moduleLoaders } : {}),
    });

    // ── Renderers ─────────────────────────────────────────────────────

    let ssrHtmlRenderer: SsrHtmlRenderer | null = null;
    let ssrMdRenderer: SsrMdRenderer | null = null;

    if (spa !== 'only') {
      ssrHtmlRenderer = new SsrHtmlRenderer(pipeline, {
        ...(config.markdownRenderer ? { markdownRenderer: config.markdownRenderer } : {}),
      });

      ssrMdRenderer = new SsrMdRenderer(pipeline);
    }

    // ── HTML shell ────────────────────────────────────────────────────

    const title = config.title ?? 'emroute';
    const fullBasePath = config.basePath ?? DEFAULT_BASE_PATH;
    const shell = config.shell
      ? await config.shell({ runtime, spa, basePath: fullBasePath, title })
      : await Emroute.resolveShell(runtime, title,
          (spa === 'root' || spa === 'only') ? appBase : htmlBase, spa);

    return new Emroute(
      ssrHtmlRenderer,
      ssrMdRenderer,
      shell,
      runtime,
      htmlBase,
      mdBase,
      appBase,
      spa,
      title,
    );
  }

  // ── handleRequest ─────────────────────────────────────────────────

  async handleRequest(req: Request): Promise<Response | null> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    const mdPrefix = this.mdBase + '/';
    const htmlPrefix = this.htmlBase + '/';
    const appPrefix = this.appBase + '/';

    // SSR Markdown: /md/*
    if (
      this.mdRenderer &&
      (pathname.startsWith(mdPrefix) || pathname === this.mdBase)
    ) {
      const routePath = pathname === this.mdBase ? '/' : pathname.slice(this.mdBase.length);
      if (routePath.length > 1 && routePath.endsWith('/')) {
        const canonical = this.mdBase + routePath.slice(0, -1) + (url.search || '');
        return Response.redirect(new URL(canonical, url.origin), 301);
      }
      try {
        const routeUrl = new URL(routePath + url.search, url.origin);
        const { content, status, redirect } = await this.mdRenderer.render(routeUrl, req.signal);
        if (redirect) {
          const target = redirect.startsWith('/') ? this.mdBase + redirect : redirect;
          return Response.redirect(new URL(target, url.origin), status);
        }
        return new Response(rewriteMdLinks(content, this.mdBase, [this.mdBase, this.htmlBase]), {
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
      this.htmlRenderer &&
      (pathname.startsWith(htmlPrefix) || pathname === this.htmlBase)
    ) {
      const routePath = pathname === this.htmlBase ? '/' : pathname.slice(this.htmlBase.length);
      if (routePath.length > 1 && routePath.endsWith('/')) {
        const canonical = this.htmlBase + routePath.slice(0, -1) + (url.search || '');
        return Response.redirect(new URL(canonical, url.origin), 301);
      }
      try {
        const routeUrl = new URL(routePath + url.search, url.origin);
        const result = await this.htmlRenderer.render(routeUrl, req.signal);
        if (result.redirect) {
          const target = result.redirect.startsWith('/') ? this.htmlBase + result.redirect : result.redirect;
          return Response.redirect(new URL(target, url.origin), result.status);
        }
        const ssrTitle = result.title ?? this.title;
        const html = Emroute.injectSsrContent(this.shell, result.content, ssrTitle, pathname);
        return new Response(html, {
          status: result.status,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      } catch (e) {
        console.error(`[emroute] Error rendering ${pathname}:`, e);
        return new Response('Internal Server Error', { status: 500 });
      }
    }

    // /app/*
    if (pathname.startsWith(appPrefix) || pathname === this.appBase) {
      return new Response(this.shell, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Unhandled SSR paths in 'only' mode — redirect to /app/
    if (
      pathname.startsWith(htmlPrefix) || pathname === this.htmlBase ||
      pathname.startsWith(mdPrefix) || pathname === this.mdBase
    ) {
      const routePath = pathname.startsWith(htmlPrefix) ? pathname.slice(this.htmlBase.length)
        : pathname.startsWith(mdPrefix) ? pathname.slice(this.mdBase.length)
        : '/';
      return Response.redirect(
        new URL(this.appBase + routePath + (url.search || ''), url.origin),
        302,
      );
    }

    // Static files
    const lastSegment = pathname.split('/').pop() ?? '';
    if (lastSegment.includes('.')) {
      const fileResponse = await this.runtime.handle(pathname);
      if (fileResponse.status === 200) return fileResponse;
      return null;
    }

    // Bare paths → redirect
    const base = (this.spa === 'root' || this.spa === 'only') ? this.appBase : this.htmlBase;
    const bare = pathname === '/' ? '' : pathname.slice(1).replace(/\/$/, '');
    return Response.redirect(new URL(`${base}/${bare}`, url.origin), 302);
  }

  // ── Private static helpers ────────────────────────────────────────

  /**
   * Build the default HTML shell by probing the runtime for optional assets
   * (/manifest.json, /main.css, /importmap.json, /app.js).
   * Public so consumers can call it from a custom `shell` function.
   */
  static async buildHtmlShell(
    runtime: Runtime,
    title: string,
    basePath: string,
    spa: SpaMode,
  ): Promise<string> {
    const baseTag = basePath ? `\n  <base href="${escapeHtml(basePath)}/">` : '';

    let manifestTag = '';
    if ((await runtime.query('/manifest.json')).status !== 404) {
      manifestTag = '\n  <link rel="manifest" href="/manifest.json">';
    }

    let cssTag = '';
    if ((await runtime.query('/main.css')).status !== 404) {
      cssTag = '\n  <link rel="stylesheet" href="/main.css">';
    }

    const needsJs = spa !== 'none';

    let importMapHtml = '';
    if (needsJs) {
      const mapResponse = await runtime.query('/importmap.json');
      if (mapResponse.status !== 404) {
        const importMap = await mapResponse.text();
        importMapHtml = `\n  <script type="importmap">\n${importMap}\n  </script>`;
      }
    }

    let scriptHtml = '';
    if (needsJs && (await runtime.query('/app.js')).status !== 404) {
      scriptHtml = '\n  <script type="module" src="/app.js"></script>';
    }

    return `<!DOCTYPE html>
<html>
<head>${baseTag}
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>@view-transition { navigation: auto; } router-slot { display: contents; }</style>${manifestTag}${cssTag}
</head>
<body>
  <router-slot></router-slot>${importMapHtml}${scriptHtml}
</body>
</html>`;
  }

  private static injectSsrContent(
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

  private static async resolveShell(
    runtime: Runtime,
    title: string,
    basePath: string,
    spa: SpaMode,
  ): Promise<string> {
    const response = await runtime.query('/index.html');
    if (response.status !== 404) return await response.text();
    return Emroute.buildHtmlShell(runtime, title, basePath, spa);
  }
}
