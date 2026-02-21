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
import { DenoFsRuntime } from './runtime/deno/fs/deno-fs.runtime.ts';
import type { SpaMode } from '../src/type/widget.type.ts';
import type { BasePath } from '../src/route/route.core.ts';
import type { MarkdownRenderer } from '../src/type/markdown.type.ts';
import { generateManifestCode, generateRoutesManifest } from './generator/route.generator.ts';
import { discoverWidgets, generateWidgetsManifestCode } from './generator/widget.generator.ts';
// @ts-types="./vendor/emko-md.vendor.d.ts"
import { createMarkdownRender } from './vendor/emko-md.vendor.js';

const markdownRenderer: MarkdownRenderer = { render: createMarkdownRender() };

/** Runtime rooted at cwd — used by emroute server and generators. */
const runtime = new DenoFsRuntime(Deno.cwd());

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
  if (!await isDirectory('routes')) {
    console.error('Error: routes/ directory not found.');
    console.error('Create a routes/ directory with at least one page file.');
    Deno.exit(1);
  }

  const widgetsDir = await isDirectory('widgets') ? 'widgets' : undefined;

  const entryPoint = await isFile('main.ts') ? 'main.ts' : undefined;

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
    for await (const entry of Deno.readDir(dir)) {
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
  const spa = project.spaMode;

  console.log(`[emroute] Starting dev server...`);
  console.log(`[emroute]   routes:  ${project.routesDir}/`);
  if (project.widgetsDir) console.log(`[emroute]   widgets: ${project.widgetsDir}/`);
  if (project.entryPoint) console.log(`[emroute]   entry:   ${project.entryPoint}`);
  console.log(`[emroute]   spa:     ${spa}`);
  console.log(`[emroute]   port:    ${flags.port}`);

  // ── Entry point ──────────────────────────────────────────────────

  const consumerEntry = flags.entry ?? project.entryPoint;
  let entryPoint: string | undefined;
  if (consumerEntry && await isFile(consumerEntry)) {
    entryPoint = consumerEntry;
  } else if (spa !== 'none') {
    const hasRoutes = project.routesDir !== undefined;
    const hasWidgets = project.widgetsDir !== undefined;
    const mainCode = generateMainTs(spa, hasRoutes, hasWidgets, '@emkodev/emroute', basePath);
    entryPoint = GENERATED_MAIN;
    await runtime.command(`/${entryPoint}`, { body: mainCode });
  }

  // ── Create server ────────────────────────────────────────────────

  const emroute = await createEmrouteServer({
    routesDir: project.routesDir,
    widgetsDir: project.widgetsDir,
    entryPoint,
    spa,
    basePath,
    baseUrl: `http://localhost:${flags.port}`,
    markdownRenderer,
  }, runtime);

  // ── Bundle ───────────────────────────────────────────────────────

  if (spa !== 'none' && entryPoint) {
    await Deno.mkdir(BUNDLE_DIR, { recursive: true });
    const bundleOutput = `${BUNDLE_DIR}/${entryPoint.replace(/\.ts$/, '.js')}`;

    new Deno.Command('deno', {
      args: ['bundle', '--platform', 'browser', '--watch', entryPoint, '-o', bundleOutput],
      stdout: 'inherit',
      stderr: 'inherit',
    }).spawn();

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // ── Serve ────────────────────────────────────────────────────────

  Deno.serve({ port: flags.port, onListen() {} }, async (req) => {
    const response = await emroute.handleRequest(req);
    if (response) return response;

    // Try .build/ for bundled JS, then cwd for static files
    const url = new URL(req.url);
    const pathname = url.pathname;

    const buildResponse = await runtime.query(`/${BUNDLE_DIR}${pathname}`);
    if (buildResponse.status === 200) return buildResponse;

    return await runtime.handle(pathname);
  });

  // ── Watch ────────────────────────────────────────────────────────

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const watchPaths = [project.routesDir];
  if (project.widgetsDir && !project.widgetsDir.startsWith(project.routesDir)) {
    watchPaths.push(project.widgetsDir);
  }

  for (const watchPath of watchPaths) {
    const watcher = Deno.watchFs(watchPath);
    (async () => {
      for await (const event of watcher) {
        const isRelevant = event.paths.some((p) =>
          p.endsWith('.page.ts') || p.endsWith('.page.html') || p.endsWith('.page.md') ||
          p.endsWith('.page.css') || p.endsWith('.error.ts') || p.endsWith('.redirect.ts') ||
          p.endsWith('.widget.ts') || p.endsWith('.widget.css')
        );
        if (!isRelevant) continue;

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          try {
            await emroute.rebuild();
            console.log('[emroute] Rebuilt routes and widgets');
          } catch (e) {
            console.error('[emroute] Failed to rebuild:', e);
          }
        }, WATCH_DEBOUNCE_MS);
      }
    })();
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
      routesDir: project.routesDir,
      widgetsDir: project.widgetsDir,
      outDir,
      spa: project.spaMode,
      basePath,
      entryPoint: flags.entry ?? project.entryPoint,
      minify: flags.minify,
      bundler: denoBundler,
    },
    runtime,
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
  if (!await isDirectory('routes')) {
    console.error('Error: routes/ directory not found.');
    Deno.exit(1);
  }

  console.log(`[emroute] Generating manifests...`);

  const manifest = await generateRoutesManifest('routes', runtime);
  const routesCode = generateManifestCode(manifest, '@emkodev/emroute');
  await runtime.command('/routes.manifest.g.ts', { body: routesCode });
  console.log(`[emroute]   routes.manifest.g.ts (${manifest.routes.length} routes)`);

  for (const warning of manifest.warnings) {
    console.log(`[emroute]   ${warning}`);
  }

  if (await isDirectory('widgets')) {
    const entries = await discoverWidgets('widgets', runtime, 'widgets');
    const widgetsCode = generateWidgetsManifestCode(entries, '@emkodev/emroute');
    await runtime.command('/widgets.manifest.g.ts', { body: widgetsCode });
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

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isDirectory;
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isFile;
  } catch {
    return false;
  }
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
