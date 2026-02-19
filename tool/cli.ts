#!/usr/bin/env -S deno run --allow-read --allow-write
/// <reference lib="deno.ns" />

/**
 * Routes & Widgets Generator CLI (Deno)
 *
 * Usage:
 *   deno run --allow-read --allow-write tool/cli.ts [routesDir] [outputFile] [importPath]
 *       [--widgets widgetsDir widgetsOutput]
 *
 * Arguments:
 *   routesDir      - Directory to scan for routes (default: "routes")
 *   outputFile     - Output routes manifest file (default: "routes.manifest.g.ts")
 *   importPath     - Import path for types (default: "@emkodev/emroute")
 *   --widgets      - Enable widget manifest generation
 *   widgetsDir     - Directory to scan for widgets (default: "widgets")
 *   widgetsOutput  - Output widgets manifest file (default: "widgets.manifest.g.ts")
 */

import {
  generateManifestCode,
  generateRoutesManifest,
  ServerRuntimeError,
} from './route.generator.ts';
import { discoverWidgets, generateWidgetsManifestCode } from './widget.generator.ts';
import { denoServerRuntime } from '../server/server.deno.ts';

async function main() {
  const widgetsIdx = Deno.args.indexOf('--widgets');
  const positionalArgs = widgetsIdx >= 0 ? Deno.args.slice(0, widgetsIdx) : [...Deno.args];

  const routesDir = positionalArgs[0] ?? 'routes';
  const outputFile = positionalArgs[1] ?? 'routes.manifest.g.ts';
  const importPath = positionalArgs[2] ?? '@emkodev/emroute';

  console.log(`[Routes Generator] Scanning: ${routesDir}/`);

  try {
    const manifest = await generateRoutesManifest(routesDir, denoServerRuntime);

    console.log(`[Routes Generator] Found ${manifest.routes.length} routes`);
    console.log(`[Routes Generator] Found ${manifest.errorBoundaries.length} error boundaries`);
    console.log(`[Routes Generator] Found ${manifest.statusPages.size} status pages`);

    // Output collision warnings
    if (manifest.warnings.length > 0) {
      console.log('\n');
      for (const warning of manifest.warnings) {
        console.log(warning);
      }
      console.log('');
    }

    const code = generateManifestCode(manifest, importPath);
    await denoServerRuntime.writeTextFile(outputFile, code);

    console.log(`[Routes Generator] Generated: ${outputFile}`);

    // Log route table
    console.log('\nRoutes:');
    for (const route of manifest.routes) {
      const fileTypes = route.files ? Object.keys(route.files).join('+') : 'ts';
      console.log(`  ${route.pattern.padEnd(30)} → ${route.modulePath} [${fileTypes}]`);
    }

    if (manifest.errorBoundaries.length > 0) {
      console.log('\nError Boundaries:');
      for (const boundary of manifest.errorBoundaries) {
        console.log(`  ${boundary.pattern.padEnd(30)} → ${boundary.modulePath}`);
      }
    }

    if (manifest.statusPages.size > 0) {
      console.log('\nStatus Pages:');
      for (const [status, route] of manifest.statusPages) {
        console.log(`  ${status.toString().padEnd(30)} → ${route.modulePath}`);
      }
    }

    if (manifest.errorHandler) {
      console.log('\nError Handler:');
      console.log(`  ${manifest.errorHandler.modulePath}`);
    }
  } catch (error) {
    if (error instanceof ServerRuntimeError && error.code === 'NOT_FOUND') {
      console.log(`[Routes Generator] No routes directory found at: ${routesDir}/`);
      console.log('[Routes Generator] Creating empty manifest...');

      const emptyManifest = {
        routes: [],
        errorBoundaries: [],
        statusPages: new Map(),
        errorHandler: undefined,
      };

      const code = generateManifestCode(emptyManifest, importPath);
      await denoServerRuntime.writeTextFile(outputFile, code);

      console.log(`[Routes Generator] Generated empty: ${outputFile}`);
    } else {
      throw error;
    }
  }

  // Widget manifest generation
  if (widgetsIdx >= 0) {
    const widgetArgs = Deno.args.slice(widgetsIdx + 1);
    const widgetsDir = widgetArgs[0] ?? 'widgets';
    const widgetsOutput = widgetArgs[1] ?? 'widgets.manifest.g.ts';

    console.log(`\n[Widgets Generator] Scanning: ${widgetsDir}/`);

    try {
      const entries = await discoverWidgets(widgetsDir, denoServerRuntime, widgetsDir);
      console.log(`[Widgets Generator] Found ${entries.length} widgets`);

      const code = generateWidgetsManifestCode(entries, importPath);
      await denoServerRuntime.writeTextFile(widgetsOutput, code);

      console.log(`[Widgets Generator] Generated: ${widgetsOutput}`);

      if (entries.length > 0) {
        console.log('\nWidgets:');
        for (const entry of entries) {
          const fileTypes = entry.files ? Object.keys(entry.files).join('+') : '';
          const filesInfo = fileTypes ? ` [${fileTypes}]` : '';
          console.log(`  ${entry.name.padEnd(30)} → ${entry.modulePath}${filesInfo}`);
        }
      }
    } catch (error) {
      if (error instanceof ServerRuntimeError && error.code === 'NOT_FOUND') {
        console.log(`[Widgets Generator] No widgets directory found at: ${widgetsDir}/`);
        console.log('[Widgets Generator] Skipping widget manifest generation.');
      } else {
        throw error;
      }
    }
  }
}

if (import.meta.main) {
  main();
}
