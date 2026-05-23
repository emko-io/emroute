import { Emroute } from '@emkodev/emroute/server';
import { UniversalFsRuntime } from '@emkodev/emroute/runtime/universal/fs';
import { DEFAULT_BASE_PATH } from '@emkodev/emroute';
import type { MarkdownRenderer } from '@emkodev/emroute';
import { renderMarkdown } from '@emkodev/emkoma/render';
import * as esbuild from 'esbuild';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = import.meta.dirname!;

/**
 * UniversalFsRuntime augmented with on-demand TypeScript transpilation.
 *
 * - `transpile()` uses esbuild for any direct `transpile()` callers.
 * - `handle()` intercepts GET requests for `.ts` files and returns the
 *   transpiled JS plus inlined companion files (via the inherited
 *   `transpileModule()`), so the browser can fetch route/widget modules
 *   directly without a separate build step.
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

/**
 * Locate the @emkodev/emroute package root by walking up from a resolved
 * module URL until a package.json with the matching name is found.
 *
 * Works for both:
 * - Local dev (`src/index.ts` → repo root → `dist/emroute.js`)
 * - npm-installed (`dist/src/index.js` → package root → `dist/emroute.js`)
 *
 * Sidesteps the path bug in `@emkodev/emroute/server/build`'s
 * `resolvePrebuiltBundle()` which mis-resolves on Deno Deploy.
 */
async function resolveEmrouteJs(): Promise<string> {
  const moduleUrl = import.meta.resolve('@emkodev/emroute');
  const modulePath = fileURLToPath(moduleUrl);
  let dir = dirname(modulePath);
  while (dir !== dirname(dir)) {
    try {
      const pkg = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf-8'));
      if (pkg.name === '@emkodev/emroute') {
        return resolve(dir, 'dist', 'emroute.js');
      }
    } catch {
      // keep walking
    }
    dir = dirname(dir);
  }
  throw new Error('Could not locate @emkodev/emroute package root');
}

const runtime = new GuideRuntime(root);
const markdownRenderer: MarkdownRenderer = { render: renderMarkdown };

const DESCRIPTION =
  'A file-based, storage-agnostic TypeScript router with triple rendering (SPA, SSR HTML, SSR Markdown) and zero external dependencies.';
const TITLE = 'emroute guide';

const BUNDLE_PATHS = { emroute: '/build/emroute.js' };

// Copy the framework bundle into the runtime so the browser can fetch it.
const emrouteJsPath = await resolveEmrouteJs();
await runtime.command(BUNDLE_PATHS.emroute, { body: await readFile(emrouteJsPath) });

// Build the merged import map (user-provided entries + framework specifiers).
const EMROUTE_EXTERNALS = [
  '@emkodev/emroute/spa',
  '@emkodev/emroute/overlay',
  '@emkodev/emroute',
  '@emkodev/emroute/server',
  '@emkodev/emroute/runtime/fetch',
];

const userImportMapRaw = await readFile(resolve(root, 'importmap.json'), 'utf-8');
const userImportMap = JSON.parse(userImportMapRaw) as { imports?: Record<string, string> };
const mergedImports: Record<string, string> = {};
for (const pkg of EMROUTE_EXTERNALS) mergedImports[pkg] = BUNDLE_PATHS.emroute;
for (const [k, v] of Object.entries(userImportMap.imports ?? {})) mergedImports[k] = v;
const importMap = JSON.stringify({ imports: mergedImports }, null, 2);

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
  <script type="module" src="/main.js"></script>
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
