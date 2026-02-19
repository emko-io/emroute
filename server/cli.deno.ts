#!/usr/bin/env -S deno run -A

/**
 * Emroute CLI — zero-config dev server, build, and manifest generation.
 *
 * Usage:
 *   deno run -A jsr:@emkodev/emroute/cli start      # dev server (default)
 *   deno run -A jsr:@emkodev/emroute/cli build       # production build
 *   deno run -A jsr:@emkodev/emroute/cli generate    # manifest generation
 *
 * Convention detection (scans cwd):
 *   routes/   → routesDir (required)
 *   widgets/  → widgetsDir (optional)
 *   main.ts   → entryPoint (optional — auto-generated if absent)
 *
 * SPA mode inference (when --spa not provided):
 *   No .page.ts files AND no widgets/ AND no main.ts → 'none'
 *   Otherwise → 'root'
 *
 * Flags:
 *   --port N          Server port (default: 1420)
 *   --spa MODE        SPA mode: none|leaf|root|only
 *   --html-base PATH  Base path for SSR HTML (default: /html)
 *   --md-base PATH    Base path for SSR Markdown (default: /md)
 *   --entry FILE      SPA entry point (auto-generated if absent)
 *   --out DIR          Output directory (build only, default: .)
 *   --minify          Enable minification (build only)
 */

import { build, createEmrouteServer, generateMainTs } from './emroute.server.ts';
import { denoBundler } from './deno.bundler.ts';
import { denoServerRuntime } from './server.deno.ts';
import type { SpaMode } from '../src/type/widget.type.ts';
import type { BasePath } from '../src/route/route.core.ts';
import type { MarkdownRenderer } from '../src/type/markdown.type.ts';
import { generateManifestCode, generateRoutesManifest } from './generator/route.generator.ts';
import { discoverWidgets, generateWidgetsManifestCode } from './generator/widget.generator.ts';
// @ts-types="./vendor/emko-md.vendor.d.ts"
import { createMarkdownRender } from './vendor/emko-md.vendor.js';

const markdownRenderer: MarkdownRenderer = { render: createMarkdownRender() };

// ── Arg parsing ──────────────────────────────────────────────────────

interface CliFlags {
  command: 'start' | 'build' | 'generate';
  port: number;
  spa?: SpaMode;
  htmlBase?: string;
  mdBase?: string;
  entry?: string;
  out?: string;
  minify: boolean;
}

const VALID_SPA_MODES = new Set<string>(['none', 'leaf', 'root', 'only']);

function parseArgs(args: string[]): CliFlags {
  const flags: CliFlags = {
    command: 'start',
    port: 1420,
    minify: false,
  };

  let i = 0;

  // First positional arg is the command (if not a flag)
  if (args.length > 0 && !args[0].startsWith('--')) {
    const cmd = args[0];
    if (cmd === 'start' || cmd === 'build' || cmd === 'generate') {
      flags.command = cmd;
    } else {
      console.error(`Unknown command: ${cmd}`);
      console.error('Available commands: start, build, generate');
      Deno.exit(1);
    }
    i = 1;
  }

  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case '--port':
        flags.port = parseInt(args[++i], 10);
        if (isNaN(flags.port)) {
          console.error('--port requires a number');
          Deno.exit(1);
        }
        break;
      case '--spa': {
        const mode = args[++i];
        if (!VALID_SPA_MODES.has(mode)) {
          console.error(`Invalid SPA mode: ${mode}. Must be one of: none, leaf, root, only`);
          Deno.exit(1);
        }
        flags.spa = mode as SpaMode;
        break;
      }
      case '--html-base':
        flags.htmlBase = args[++i];
        break;
      case '--md-base':
        flags.mdBase = args[++i];
        break;
      case '--entry':
        flags.entry = args[++i];
        break;
      case '--out':
        flags.out = args[++i];
        break;
      case '--minify':
        flags.minify = true;
        break;
      default:
        console.error(`Unknown flag: ${arg}`);
        Deno.exit(1);
    }
    i++;
  }

  return flags;
}

// ── Convention detection ─────────────────────────────────────────────

interface ProjectInfo {
  routesDir: string;
  widgetsDir: string | undefined;
  entryPoint: string | undefined;
  spaMode: SpaMode;
}

async function detectProject(spaOverride?: SpaMode): Promise<ProjectInfo> {
  const routesStat = await denoServerRuntime.stat('routes');
  if (!routesStat?.isDirectory) {
    console.error('Error: routes/ directory not found.');
    console.error('Create a routes/ directory with at least one page file.');
    Deno.exit(1);
  }

  const widgetsStat = await denoServerRuntime.stat('widgets');
  const widgetsDir = widgetsStat?.isDirectory ? 'widgets' : undefined;

  const mainStat = await denoServerRuntime.stat('main.ts');
  const entryPoint = mainStat?.isFile ? 'main.ts' : undefined;

  let spaMode: SpaMode;
  if (spaOverride) {
    spaMode = spaOverride;
  } else {
    const hasPageTs = await scanForPageTs('routes');
    if (!hasPageTs && !widgetsDir && !entryPoint) {
      spaMode = 'none';
    } else {
      spaMode = 'root';
    }
  }

  return { routesDir: 'routes', widgetsDir, entryPoint, spaMode };
}

async function scanForPageTs(dir: string): Promise<boolean> {
  try {
    for await (const entry of denoServerRuntime.readDir(dir)) {
      if (entry.isFile && entry.name.endsWith('.page.ts')) {
        return true;
      }
      if (entry.isDirectory) {
        if (await scanForPageTs(`${dir}/${entry.name}`)) {
          return true;
        }
      }
    }
  } catch {
    // Directory not readable — treat as no .page.ts
  }
  return false;
}

// ── Commands ─────────────────────────────────────────────────────────

const BUNDLE_DIR = '.build';
const GENERATED_MAIN = '_main.g.ts';
const WATCH_DEBOUNCE_MS = 100;

async function commandStart(flags: CliFlags): Promise<void> {
  const project = await detectProject(flags.spa);
  const basePath = buildBasePath(flags);
  const appRoot = '.';
  const spa = project.spaMode;

  console.log(`[emroute] Starting dev server...`);
  console.log(`[emroute]   routes:  ${project.routesDir}/`);
  if (project.widgetsDir) console.log(`[emroute]   widgets: ${project.widgetsDir}/`);
  if (project.entryPoint) console.log(`[emroute]   entry:   ${project.entryPoint}`);
  console.log(`[emroute]   spa:     ${spa}`);
  console.log(`[emroute]   port:    ${flags.port}`);

  // ── Entry point ──────────────────────────────────────────────────

  const consumerEntry = flags.entry ?? project.entryPoint;
  let entryPoint: string;
  if (consumerEntry && await denoServerRuntime.exists(`${appRoot}/${consumerEntry}`)) {
    entryPoint = `${appRoot}/${consumerEntry}`;
  } else {
    const hasRoutes = project.routesDir !== undefined;
    const hasWidgets = project.widgetsDir !== undefined;
    const mainCode = generateMainTs(spa, hasRoutes, hasWidgets, '@emkodev/emroute', basePath);
    entryPoint = `${appRoot}/${GENERATED_MAIN}`;
    await denoServerRuntime.writeTextFile(entryPoint, mainCode);
  }

  // ── Create server ────────────────────────────────────────────────

  const emroute = await createEmrouteServer({
    appRoot,
    routesDir: project.routesDir,
    widgetsDir: project.widgetsDir,
    spa,
    basePath,
    baseUrl: `http://localhost:${flags.port}`,
    markdownRenderer,
    responseHeaders: { 'Access-Control-Allow-Origin': '*' },
  }, denoServerRuntime);

  // ── Bundle ───────────────────────────────────────────────────────

  let bundleProcess: { kill(): void } | undefined;

  if (spa !== 'none') {
    const bundleEntry = entryPoint.replace(/^\.\//, '');
    const bundleOutput = `${BUNDLE_DIR}/${bundleEntry.replace(/\.ts$/, '.js')}`;
    await denoServerRuntime.mkdir(BUNDLE_DIR, { recursive: true });

    const proc = new Deno.Command('deno', {
      args: ['bundle', '--platform', 'browser', '--watch', entryPoint, '-o', bundleOutput],
      stdout: 'inherit',
      stderr: 'inherit',
    }).spawn();

    bundleProcess = { kill: () => proc.kill() };
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // ── Serve ────────────────────────────────────────────────────────

  const handle = denoServerRuntime.serve(flags.port, async (req) => {
    const response = await emroute.handleRequest(req);
    if (response) return response;

    // Try .build/ for bundled JS, then appRoot for static files
    const url = new URL(req.url);
    const pathname = url.pathname;

    const buildResponse = await denoServerRuntime.serveStaticFile(req, `${BUNDLE_DIR}${pathname}`);
    if (buildResponse.status === 200) return buildResponse;

    return await denoServerRuntime.serveStaticFile(req, `${appRoot}${pathname}`);
  });

  // ── Watch ────────────────────────────────────────────────────────

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const watchPaths = [project.routesDir];
  if (project.widgetsDir && !project.widgetsDir.startsWith(project.routesDir)) {
    watchPaths.push(project.widgetsDir);
  }

  for (const watchPath of watchPaths) {
    denoServerRuntime.watchDir(watchPath, (event) => {
      const isRelevant = event.paths.some((p) =>
        p.endsWith('.page.ts') || p.endsWith('.page.html') || p.endsWith('.page.md') ||
        p.endsWith('.page.css') || p.endsWith('.error.ts') || p.endsWith('.redirect.ts') ||
        p.endsWith('.widget.ts') || p.endsWith('.widget.css')
      );
      if (!isRelevant) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          await emroute.rebuild();
          console.log('[emroute] Rebuilt routes and widgets');
        } catch (e) {
          console.error('[emroute] Failed to rebuild:', e);
        }
      }, WATCH_DEBOUNCE_MS);
    });
  }

  console.log(`[emroute] Dev server running at http://localhost:${flags.port}/`);

  // Keep process alive
  await new Promise(() => {});
}

async function commandBuild(flags: CliFlags): Promise<void> {
  const project = await detectProject(flags.spa);
  const basePath = buildBasePath(flags);
  const outDir = flags.out ?? '.';

  console.log(`[emroute] Building...`);
  console.log(`[emroute]   routes:  ${project.routesDir}/`);
  if (project.widgetsDir) console.log(`[emroute]   widgets: ${project.widgetsDir}/`);
  if (project.entryPoint) console.log(`[emroute]   entry:   ${project.entryPoint}`);
  console.log(`[emroute]   spa:     ${project.spaMode}`);
  console.log(`[emroute]   out:     ${outDir}/`);
  if (flags.minify) console.log(`[emroute]   minify:  true`);

  const result = await build(
    {
      appRoot: '.',
      routesDir: project.routesDir,
      widgetsDir: project.widgetsDir,
      outDir,
      spa: project.spaMode,
      basePath,
      entryPoint: flags.entry ?? project.entryPoint,
      minify: flags.minify,
      bundler: denoBundler,
    },
    denoServerRuntime,
  );

  console.log(`[emroute] Build complete:`);
  console.log(`[emroute]   shell:     ${result.shell}`);
  if (result.coreBundle) console.log(`[emroute]   core:      ${result.coreBundle}`);
  if (result.appBundle) console.log(`[emroute]   app:       ${result.appBundle}`);
  console.log(`[emroute]   manifests: ${result.manifests.routes}`);
  if (result.manifests.widgets) {
    console.log(`[emroute]              ${result.manifests.widgets}`);
  }
}

async function commandGenerate(_flags: CliFlags): Promise<void> {
  const routesStat = await denoServerRuntime.stat('routes');
  if (!routesStat?.isDirectory) {
    console.error('Error: routes/ directory not found.');
    Deno.exit(1);
  }

  console.log(`[emroute] Generating manifests...`);

  const manifest = await generateRoutesManifest('routes', denoServerRuntime);
  const routesCode = generateManifestCode(manifest, '@emkodev/emroute');
  await denoServerRuntime.writeTextFile('routes.manifest.g.ts', routesCode);
  console.log(`[emroute]   routes.manifest.g.ts (${manifest.routes.length} routes)`);

  for (const warning of manifest.warnings) {
    console.log(`[emroute]   ${warning}`);
  }

  const widgetsStat = await denoServerRuntime.stat('widgets');
  if (widgetsStat?.isDirectory) {
    const entries = await discoverWidgets('widgets', denoServerRuntime, 'widgets');
    const widgetsCode = generateWidgetsManifestCode(entries, '@emkodev/emroute');
    await denoServerRuntime.writeTextFile('widgets.manifest.g.ts', widgetsCode);
    console.log(`[emroute]   widgets.manifest.g.ts (${entries.length} widgets)`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildBasePath(flags: CliFlags): BasePath | undefined {
  if (flags.htmlBase || flags.mdBase) {
    return { html: flags.htmlBase ?? '/html', md: flags.mdBase ?? '/md' };
  }
  return undefined;
}

// ── Main ─────────────────────────────────────────────────────────────

if (import.meta.main) {
  const flags = parseArgs(Deno.args);

  switch (flags.command) {
    case 'start':
      await commandStart(flags);
      break;
    case 'build':
      await commandBuild(flags);
      break;
    case 'generate':
      await commandGenerate(flags);
      break;
  }
}
