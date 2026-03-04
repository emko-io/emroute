/**
 * Emroute
 *
 * Framework entry point. Reads manifests from Runtime,
 * builds Pipeline + Renderers, handles Request → Response.
 */

import type { WidgetManifestEntry } from '../type/widget.type.ts';
import type { WidgetComponent } from '../component/widget.component.ts';
import type { Runtime } from '../runtime/abstract.runtime.ts';
import { Pipeline } from '../pipeline/pipeline.ts';
import { SsrHtmlRenderer } from '../renderer/html.renderer.ts';
import { SsrMdRenderer } from '../renderer/md.renderer.ts';
import { WidgetRegistry } from '../widget/widget.registry.ts';
import { escapeHtml } from '../util/html.util.ts';
import { rewriteMdLinks } from '../util/md.util.ts';
import {
  DEFAULT_BASE_PATH,
  ROUTES_MANIFEST_PATH,
  WIDGETS_MANIFEST_PATH,
  type EmrouteConfig,
} from './server.type.ts';

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
    config: EmrouteConfig,
    runtime: Runtime,
  ): Promise<Emroute> {
    const { spa = 'root' } = config;
    const { html: htmlBase, md: mdBase, app: appBase } = config.basePath ?? DEFAULT_BASE_PATH;

    // ── Verify route manifest exists ──────────────────────────────────

    const manifestResponse = await runtime.query(ROUTES_MANIFEST_PATH);
    if (manifestResponse.status === 404 && !config.routeTree) {
      throw new Error(
        `[emroute] ${ROUTES_MANIFEST_PATH} not found in runtime. ` +
          'Provide routeTree in config or ensure the runtime produces it.',
      );
    }

    if (config.routeTree && manifestResponse.status === 404) {
      await runtime.command(ROUTES_MANIFEST_PATH, {
        body: JSON.stringify(config.routeTree),
      });
    }

    // ── Pipeline ──────────────────────────────────────────────────────

    const pipeline = new Pipeline({
      runtime,
      ...(config.extendContext ? { contextProvider: config.extendContext } : {}),
      ...(config.moduleLoaders ? { moduleLoaders: config.moduleLoaders } : {}),
    });

    // ── Widgets ───────────────────────────────────────────────────────

    let widgets: WidgetRegistry | undefined = config.widgets;
    let widgetFiles: Record<string, { html?: string; md?: string; css?: string }> = {};

    const widgetsResponse = await runtime.query(WIDGETS_MANIFEST_PATH);
    if (widgetsResponse.status !== 404) {
      const entries: WidgetManifestEntry[] = await widgetsResponse.json();
      if (config.widgets) {
        widgets = config.widgets;
        for (const entry of entries) {
          if (entry.files) widgetFiles[entry.name] = entry.files;
        }
      } else {
        const imported = await Emroute.importWidgets(entries, runtime);
        widgets = imported.registry;
        widgetFiles = imported.widgetFiles;
      }
    }

    // ── Renderers ─────────────────────────────────────────────────────

    let ssrHtmlRenderer: SsrHtmlRenderer | null = null;
    let ssrMdRenderer: SsrMdRenderer | null = null;

    if (spa !== 'only') {
      ssrHtmlRenderer = new SsrHtmlRenderer(pipeline, {
        ...(config.markdownRenderer ? { markdownRenderer: config.markdownRenderer } : {}),
        ...(widgets ? { widgets } : {}),
        widgetFiles,
      });

      ssrMdRenderer = new SsrMdRenderer(pipeline, {
        ...(widgets ? { widgets } : {}),
        widgetFiles,
      });
    }

    // ── HTML shell ────────────────────────────────────────────────────

    const title = config.title ?? 'emroute';
    const shellBase = (spa === 'root' || spa === 'only') ? appBase : htmlBase;
    let shell = await Emroute.resolveShell(runtime, title, shellBase);

    if ((await runtime.query('/main.css')).status !== 404) {
      shell = shell.replace('</head>', '  <link rel="stylesheet" href="/main.css">\n</head>');
    }

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

    // Unhandled SSR paths in 'only' mode — serve shell
    if (
      pathname.startsWith(htmlPrefix) || pathname === this.htmlBase ||
      pathname.startsWith(mdPrefix) || pathname === this.mdBase
    ) {
      return new Response(this.shell, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
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

  private static extractWidgetExport(
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

  private static async importWidgets(
    entries: WidgetManifestEntry[],
    runtime: Runtime,
  ): Promise<{
    registry: WidgetRegistry;
    widgetFiles: Record<string, { html?: string; md?: string; css?: string }>;
  }> {
    const registry = new WidgetRegistry();
    const widgetFiles: Record<string, { html?: string; md?: string; css?: string }> = {};

    for (const entry of entries) {
      try {
        const runtimePath = entry.modulePath.startsWith('/')
          ? entry.modulePath
          : `/${entry.modulePath}`;

        const mod = await runtime.loadModule(runtimePath) as Record<string, unknown>;
        const instance = Emroute.extractWidgetExport(mod);
        if (!instance) continue;
        registry.add(instance);

        const inlined = mod.__files;
        if (inlined && typeof inlined === 'object') {
          widgetFiles[entry.name] = inlined as { html?: string; md?: string; css?: string };
        } else if (entry.files) {
          widgetFiles[entry.name] = entry.files;
        }
      } catch (e) {
        console.error(`[emroute] Failed to load widget ${entry.modulePath}:`, e);
        if (entry.files) widgetFiles[entry.name] = entry.files;
      }
    }

    return { registry, widgetFiles };
  }

  private static buildHtmlShell(title: string, htmlBase: string): string {
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
    htmlBase: string,
  ): Promise<string> {
    const response = await runtime.query('/index.html');
    if (response.status !== 404) return await response.text();
    return Emroute.buildHtmlShell(title, htmlBase);
  }
}
