#!/usr/bin/env bun

/**
 * Emroute CLI — zero-config dev server, build, and manifest generation.
 *
 * Usage:
 *   bun run @emkodev/emroute/server/cli start      # dev server (default)
 *   bun run @emkodev/emroute/server/cli build       # production build
 *   bun run @emkodev/emroute/server/cli generate    # manifest generation
 *
 * Convention detection (scans cwd):
 *   routes/   -> routesDir (required)
 *   widgets/  -> widgetsDir (optional)
 *   main.ts   -> entryPoint (optional — auto-generated if absent)
 *
 * SPA mode inference (when --spa not provided):
 *   No .page.ts files AND no widgets/ AND no main.ts -> 'none'
 *   Otherwise -> 'root'
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

import { stat, readdir, mkdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { createEmrouteServer } from './emroute.server.ts';
import { BunFsRuntime } from '../runtime/bun/fs/bun-fs.runtime.ts';
import {
  ROUTES_MANIFEST_PATH,
  WIDGETS_MANIFEST_PATH,
  type RuntimeConfig,
} from '../runtime/abstract.runtime.ts';
import type { SpaMode } from '../src/type/widget.type.ts';
import type { BasePath } from '../src/route/route.core.ts';
import type { MarkdownRenderer } from '../src/type/markdown.type.ts';
import {
  generateManifestCode,
  generateMainTs,
  generateWidgetsManifestCode,
} from './codegen.util.ts';
// @ts-types="./vendor/emko-md.vendor.d.ts"
import { createMarkdownRender } from './vendor/emko-md.vendor.js';

const EMROUTE_PACKAGE_SPECIFIER = '@emkodev/emroute';
const markdownRenderer: MarkdownRenderer = { render: createMarkdownRender() };

// -- Arg parsing --

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
      process.exit(1);
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
          process.exit(1);
        }
        break;
      case '--spa': {
        const mode = args[++i];
        if (!VALID_SPA_MODES.has(mode)) {
          console.error(`Invalid SPA mode: ${mode}. Must be one of: none, leaf, root, only`);
          process.exit(1);
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
        process.exit(1);
    }
    i++;
  }

  return flags;
}

// -- Convention detection --

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
    process.exit(1);
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
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.page.ts')) {
        return true;
      }
      if (entry.isDirectory()) {
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

// -- Commands --

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

  // -- Entry point --

  const consumerEntry = flags.entry ?? project.entryPoint;
  let entryPoint: string | undefined;
  if (consumerEntry && await isFile(consumerEntry)) {
    entryPoint = `/${consumerEntry}`;
  } else if (spa !== 'none') {
    const hasRoutes = project.routesDir !== undefined;
    const hasWidgets = project.widgetsDir !== undefined;
    const mainCode = generateMainTs(spa, hasRoutes, hasWidgets, EMROUTE_PACKAGE_SPECIFIER, basePath);
    entryPoint = `/${GENERATED_MAIN}`;
    // Write generated entry to disk so runtime can bundle it
    const runtime = new BunFsRuntime(process.cwd());
    await runtime.command(entryPoint, { body: mainCode });
  }

  // -- Build RuntimeConfig --

  const runtimeConfig: RuntimeConfig = {
    routesDir: `/${project.routesDir}`,
    widgetsDir: project.widgetsDir ? `/${project.widgetsDir}` : undefined,
    entryPoint,
  };

  // -- Create runtime + server --

  let runtime = new BunFsRuntime(process.cwd(), runtimeConfig);

  let emroute = await createEmrouteServer({
    spa,
    basePath,
    markdownRenderer,
  }, runtime);

  // -- Serve --

  Bun.serve({
    port: flags.port,
    async fetch(req) {
      const response = await emroute.handleRequest(req);
      if (response) return response;
      return new Response('Not Found', { status: 404 });
    },
  });

  // -- Watch --

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const watchPaths = [project.routesDir];
  if (project.widgetsDir && !project.widgetsDir.startsWith(project.routesDir)) {
    watchPaths.push(project.widgetsDir);
  }

  for (const watchPath of watchPaths) {
    watch(watchPath, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      const isRelevant =
        filename.endsWith('.page.ts') || filename.endsWith('.page.html') || filename.endsWith('.page.md') ||
        filename.endsWith('.page.css') || filename.endsWith('.error.ts') || filename.endsWith('.redirect.ts') ||
        filename.endsWith('.widget.ts') || filename.endsWith('.widget.css');
      if (!isRelevant) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          // Re-create runtime (clears manifest cache) and server
          runtime = new BunFsRuntime(process.cwd(), runtimeConfig);
          emroute = await createEmrouteServer({
            spa,
            basePath,
            markdownRenderer,
          }, runtime);
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
  const spa = project.spaMode;

  console.log(`[emroute] Building...`);
  console.log(`[emroute]   routes:  ${project.routesDir}/`);
  if (project.widgetsDir) console.log(`[emroute]   widgets: ${project.widgetsDir}/`);
  if (project.entryPoint) console.log(`[emroute]   entry:   ${project.entryPoint}`);
  console.log(`[emroute]   spa:     ${spa}`);
  if (flags.minify) console.log(`[emroute]   minify:  true`);

  // Entry point
  const consumerEntry = flags.entry ?? project.entryPoint;
  let entryPoint: string | undefined;
  if (consumerEntry && await isFile(consumerEntry)) {
    entryPoint = `/${consumerEntry}`;
  } else if (spa !== 'none') {
    const hasRoutes = project.routesDir !== undefined;
    const hasWidgets = project.widgetsDir !== undefined;
    const mainCode = generateMainTs(spa, hasRoutes, hasWidgets, EMROUTE_PACKAGE_SPECIFIER, basePath);
    entryPoint = `/${GENERATED_MAIN}`;
    const tempRuntime = new BunFsRuntime(process.cwd());
    await tempRuntime.command(entryPoint, { body: mainCode });
  }

  const runtimeConfig: RuntimeConfig = {
    routesDir: `/${project.routesDir}`,
    widgetsDir: project.widgetsDir ? `/${project.widgetsDir}` : undefined,
    entryPoint,
  };

  const runtime = new BunFsRuntime(process.cwd(), runtimeConfig);

  // createEmrouteServer reads manifests from runtime and calls runtime.bundle()
  const emroute = await createEmrouteServer({
    spa,
    basePath,
  }, runtime);

  // Write shell to output directory
  const outDir = flags.out ?? '.';
  await mkdir(outDir, { recursive: true });
  await Bun.write(`${outDir}/index.html`, emroute.shell);

  console.log(`[emroute] Build complete`);
  console.log(`[emroute]   routes: ${emroute.manifest.routes.length}`);
  console.log(`[emroute]   shell:  ${outDir}/index.html`);

  await BunFsRuntime.stopBundler();
}

async function commandGenerate(_flags: CliFlags): Promise<void> {
  if (!await isDirectory('routes')) {
    console.error('Error: routes/ directory not found.');
    process.exit(1);
  }

  console.log(`[emroute] Generating manifests...`);

  const runtimeConfig: RuntimeConfig = {
    routesDir: '/routes',
    widgetsDir: await isDirectory('widgets') ? '/widgets' : undefined,
  };
  const runtime = new BunFsRuntime(process.cwd(), runtimeConfig);

  // Read routes manifest from runtime (triggers scanning)
  const routesResponse = await runtime.query(ROUTES_MANIFEST_PATH);
  if (routesResponse.status === 404) {
    console.error('[emroute] No routes found.');
    process.exit(1);
  }
  const rawManifest = await routesResponse.json();
  const manifest = {
    routes: rawManifest.routes,
    errorBoundaries: rawManifest.errorBoundaries,
    statusPages: new Map(rawManifest.statusPages ?? []),
    errorHandler: rawManifest.errorHandler,
  };

  const routesCode = generateManifestCode(manifest, EMROUTE_PACKAGE_SPECIFIER);
  await runtime.command('/routes.manifest.g.ts', { body: routesCode });
  console.log(`[emroute]   routes.manifest.g.ts (${manifest.routes.length} routes)`);

  // Widgets
  if (runtimeConfig.widgetsDir) {
    const widgetsResponse = await runtime.query(WIDGETS_MANIFEST_PATH);
    if (widgetsResponse.status !== 404) {
      const entries = await widgetsResponse.json();
      const widgetsCode = generateWidgetsManifestCode(entries, EMROUTE_PACKAGE_SPECIFIER);
      await runtime.command('/widgets.manifest.g.ts', { body: widgetsCode });
      console.log(`[emroute]   widgets.manifest.g.ts (${entries.length} widgets)`);
    }
  }
}

// -- Helpers --

function buildBasePath(flags: CliFlags): BasePath | undefined {
  if (flags.htmlBase || flags.mdBase) {
    return { html: flags.htmlBase ?? '/html', md: flags.mdBase ?? '/md' };
  }
  return undefined;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

// -- Main --

const args = process.argv.slice(2);
const flags = parseArgs(args);

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
