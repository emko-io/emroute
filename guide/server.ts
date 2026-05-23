import { Emroute } from '@emkodev/emroute/server';
import { UniversalFsRuntime } from '@emkodev/emroute/runtime/universal/fs';
import { buildClientBundles } from '@emkodev/emroute/server/build';
import { DEFAULT_BASE_PATH } from '@emkodev/emroute';
import type { MarkdownRenderer } from '@emkodev/emroute';
import { renderMarkdown } from '@emkodev/emkoma/render';
import * as esbuild from 'esbuild';
import { readFile } from 'node:fs/promises';

const root = import.meta.dirname!;

/**
 * UniversalFsRuntime augmented with on-demand TypeScript transpilation.
 *
 * - `transpile()` uses esbuild for the build step (main.ts → app.js).
 * - `handle()` intercepts GET requests for `.ts` files and returns the
 *   transpiled JS plus inlined companion files (via the inherited
 *   `transpileModule()`), so the browser can fetch route/widget modules
 *   directly without a pre-build step.
 */
class GuideRuntime extends UniversalFsRuntime {
  override async transpile(source: string): Promise<string> {
    const result = await esbuild.transform(source, {
      loader: 'ts',
      format: 'esm',
      target: 'es2022',
    });
    return result.code;
  }

  override async handle(
    resource: Parameters<UniversalFsRuntime['handle']>[0],
    init?: Parameters<UniversalFsRuntime['handle']>[1],
  ): Promise<Response> {
    const pathname = resourcePath(resource);
    const method = init?.method ??
      (resource instanceof Request ? resource.method : 'GET');

    if (method === 'GET' && pathname.endsWith('.ts')) {
      try {
        const source = await readFile(root + pathname, 'utf-8');
        const js = await this.transpileModule(pathname, source);
        return new Response(js, {
          status: 200,
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        });
      } catch {
        // fall through to default handling (which will 404)
      }
    }

    return super.handle(resource, init);
  }
}

function resourcePath(resource: string | URL | Request): string {
  if (typeof resource === 'string') {
    return decodeURIComponent(new URL(resource, 'http://x').pathname);
  }
  if (resource instanceof URL) return decodeURIComponent(resource.pathname);
  return decodeURIComponent(new URL(resource.url).pathname);
}

const runtime = new GuideRuntime(root);
const markdownRenderer: MarkdownRenderer = { render: renderMarkdown };

const DESCRIPTION =
  'A file-based, storage-agnostic TypeScript router with triple rendering (SPA, SSR HTML, SSR Markdown) and zero external dependencies.';
const TITLE = 'emroute guide';

const BUNDLE_PATHS = { emroute: '/build/emroute.js', app: '/build/app.js' };

// One-shot build for the PWA instance. Writes emroute.js, app.js,
// importmap.json into the runtime (which here means guide/build/* on disk).
await buildClientBundles({
  runtime,
  root,
  spa: 'only',
  bundlePaths: BUNDLE_PATHS,
});

// Read the merged importmap once for embedding in the PWA shell.
const importMap = await (await runtime.query('/importmap.json')).text();

const FAVICON_HREF =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'>" +
  "<circle cx='40' cy='40' r='7.5' fill='%234a6cf7'/>" +
  "<circle cx='7.5' cy='7.5' r='7.5' fill='%234a6cf7'/>" +
  "<circle cx='72.5' cy='7.5' r='7.5' fill='%234a6cf7'/>" +
  "<circle cx='7.5' cy='72.5' r='5.5' stroke='%234a6cf7' stroke-width='4' fill='none'/>" +
  "<circle cx='72.5' cy='72.5' r='5.5' stroke='%234a6cf7' stroke-width='4' fill='none'/>" +
  "<rect x='5.625' y='5.3125' width='3.75' height='60.9375' fill='%234a6cf7'/>" +
  "<rect x='5' y='7.65161' width='3.75' height='47.7747' transform='rotate(-45 5 7.65161)' fill='%234a6cf7'/>" +
  "<rect width='3.75' height='47.7747' transform='matrix(-0.707107 -0.707107 -0.707107 0.707107 74.99 7.65985)' fill='%234a6cf7'/>" +
  "<rect x='70.625' y='4.99994' width='3.75' height='61.25' fill='%234a6cf7'/></svg>";

const head = (basePath: string) => `
  <base href="${basePath}/">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${DESCRIPTION}">
  <meta name="theme-color" content="#050610">
  <title>${TITLE}</title>
  <link rel="icon" type="image/svg+xml" href="${FAVICON_HREF}">
  <style>
    @view-transition { navigation: auto; }
    router-slot { display: contents; }
    html {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
  </style>`;

// ── Instance A: SSR HTML + Markdown, no client JS ──────────────────
const ssrEmroute = await Emroute.create({
  spa: 'none',
  title: TITLE,
  markdownRenderer,
  shell: ({ basePath }) => `<!DOCTYPE html>
<html lang="en">
<head>${head(basePath.html)}</head>
<body><router-slot></router-slot></body>
</html>`,
}, runtime);

// ── Instance B: pure PWA, no SSR ───────────────────────────────────
const pwaEmroute = await Emroute.create({
  spa: 'only',
  title: TITLE,
  markdownRenderer,
  shell: ({ basePath }) => `<!DOCTYPE html>
<html lang="en">
<head>${head(basePath.app)}
  <script type="importmap">${importMap}</script>
</head>
<body>
  <router-slot></router-slot>
  <script type="module" src="${BUNDLE_PATHS.app}"></script>
</body>
</html>`,
}, runtime);

// ── Dispatch ───────────────────────────────────────────────────────
// /{app}/* → PWA instance, everything else → SSR instance.
// Uses DEFAULT_BASE_PATH.app rather than a hardcoded "/app".
const APP_BASE = DEFAULT_BASE_PATH.app;
const APP_BASE_SLASH = `${APP_BASE}/`;

const port = Number(Deno.env.get('PORT') ?? '8000');

Deno.serve({ port }, async (req) => {
  const url = new URL(req.url);
  const target =
    url.pathname === APP_BASE || url.pathname.startsWith(APP_BASE_SLASH)
      ? pwaEmroute
      : ssrEmroute;
  return (await target.handleRequest(req)) ??
    new Response('Not Found', { status: 404 });
});
