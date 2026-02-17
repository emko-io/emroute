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

import { createDevServer } from './dev.server.ts';
import { build } from './prod.server.ts';
import { denoServerRuntime } from './server.deno.ts';
import type { SpaMode } from '../src/type/widget.type.ts';
import type { BasePath } from '../src/route/route.core.ts';
import { generateManifestCode, generateRoutesManifest } from '../tool/route.generator.ts';
import { discoverWidgets, generateWidgetsManifestCode } from '../tool/widget.generator.ts';
import { denoFs } from '../tool/fs.deno.ts';

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

async function commandStart(flags: CliFlags): Promise<void> {
  const project = await detectProject(flags.spa);

  const basePath = buildBasePath(flags);

  console.log(`[emroute] Starting dev server...`);
  console.log(`[emroute]   routes:  ${project.routesDir}/`);
  if (project.widgetsDir) console.log(`[emroute]   widgets: ${project.widgetsDir}/`);
  if (project.entryPoint) console.log(`[emroute]   entry:   ${project.entryPoint}`);
  console.log(`[emroute]   spa:     ${project.spaMode}`);
  console.log(`[emroute]   port:    ${flags.port}`);

  await createDevServer(
    {
      port: flags.port,
      entryPoint: flags.entry ?? project.entryPoint,
      routesDir: project.routesDir,
      widgetsDir: project.widgetsDir,
      watch: true,
      appRoot: '.',
      spa: project.spaMode,
      basePath,
    },
    denoServerRuntime,
  );
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

  const manifest = await generateRoutesManifest('routes', denoFs);
  const routesCode = generateManifestCode(manifest, '@emkodev/emroute');
  await denoFs.writeTextFile('routes.manifest.g.ts', routesCode);
  console.log(`[emroute]   routes.manifest.g.ts (${manifest.routes.length} routes)`);

  for (const warning of manifest.warnings) {
    console.log(`[emroute]   ${warning}`);
  }

  const widgetsStat = await denoServerRuntime.stat('widgets');
  if (widgetsStat?.isDirectory) {
    const entries = await discoverWidgets('widgets', denoFs, 'widgets');
    const widgetsCode = generateWidgetsManifestCode(entries, '@emkodev/emroute');
    await denoFs.writeTextFile('widgets.manifest.g.ts', widgetsCode);
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
