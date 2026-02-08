#!/usr/bin/env -S deno run --allow-read --allow-write
/// <reference lib="deno.ns" />

/**
 * Routes Generator CLI (Deno)
 *
 * Usage:
 *   deno run --allow-read --allow-write tool/cli.ts [routesDir] [outputFile] [importPath]
 *
 * Arguments:
 *   routesDir   - Directory to scan (default: "routes")
 *   outputFile  - Output manifest file (default: "routes.manifest.ts")
 *   importPath  - Import path for types (default: "@emkodev/emroute")
 */

import {
  FileSystemError,
  generateManifestCode,
  generateRoutesManifest,
} from './route.generator.ts';
import { denoFs } from './fs.deno.ts';

async function main() {
  const routesDir = Deno.args[0] ?? 'routes';
  const outputFile = Deno.args[1] ?? 'routes.manifest.ts';
  const importPath = Deno.args[2] ?? '@emkodev/emroute';

  console.log(`[Routes Generator] Scanning: ${routesDir}/`);

  try {
    const manifest = await generateRoutesManifest(routesDir, denoFs);

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
    await denoFs.writeTextFile(outputFile, code);

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
    if (error instanceof FileSystemError && error.code === 'NOT_FOUND') {
      console.log(`[Routes Generator] No routes directory found at: ${routesDir}/`);
      console.log('[Routes Generator] Creating empty manifest...');

      const emptyManifest = {
        routes: [],
        errorBoundaries: [],
        statusPages: new Map(),
        errorHandler: undefined,
      };

      const code = generateManifestCode(emptyManifest, importPath);
      await denoFs.writeTextFile(outputFile, code);

      console.log(`[Routes Generator] Generated empty: ${outputFile}`);
    } else {
      throw error;
    }
  }
}

if (import.meta.main) {
  main();
}
