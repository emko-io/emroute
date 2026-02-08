/**
 * Routes Generator - Build Tool
 *
 * Scans routes/ directory and generates route configuration manifest.
 *
 * File naming conventions:
 * - *.page.ts → TypeScript page (full control)
 * - *.page.html → HTML template (can contain components)
 * - *.page.md → Markdown content
 * - *.error.ts → Error boundaries
 * - *.redirect.ts → Redirects
 * - [param] → Dynamic URL segments
 * - 404.page.ts → Not found (status 404)
 * - 401.page.ts → Unauthorized (status 401)
 * - 403.page.ts → Forbidden (status 403)
 * - error.ts → Generic error handler
 *
 * File precedence per route:
 * - .ts exists → TypeScript render() has full control
 * - .html exists (no .ts) → HTML template rendered directly
 * - .md only → Auto-wrapped with <mark-down/>
 */

import {
  filePathToPattern,
  getPageFileType,
  getRouteType,
  sortRoutesBySpecificity,
} from '../src/route/route.matcher.ts';
import type {
  ErrorBoundary,
  RouteConfig,
  RouteFiles,
  RoutesManifest,
} from '../src/type/route.type.ts';
import type { FileSystem } from './fs.type.ts';
import { FileSystemError } from './fs.type.ts';

/** Walk directory recursively and collect files */
async function* walkDirectory(fs: FileSystem, dir: string): AsyncGenerator<string> {
  for await (const entry of fs.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      yield* walkDirectory(fs, path);
    } else if (entry.isFile) {
      yield path;
    }
  }
}

/** Parse status code from filename (e.g., 404.page.ts → 404) */
function parseStatusCode(filename: string): number | undefined {
  const match = filename.match(/^(\d{3})\.page\.(ts|html|md)$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

/** Intermediate structure for grouping files by route pattern */
interface RouteFileGroup {
  pattern: string;
  files: RouteFiles;
  parent?: string;
}

/** Group page files by their route pattern */
function groupFilesByPattern(
  files: Array<{ path: string; pattern: string; fileType: 'ts' | 'html' | 'md' }>,
): Map<string, RouteFileGroup> {
  const groups = new Map<string, RouteFileGroup>();

  for (const { path, pattern, fileType } of files) {
    let group = groups.get(pattern);
    if (!group) {
      group = { pattern, files: {} };

      // Determine parent for nested routes
      const segments = pattern.split('/').filter(Boolean);
      if (segments.length > 1) {
        group.parent = '/' + segments.slice(0, -1).join('/');
      }

      groups.set(pattern, group);
    }

    // Add file to appropriate slot (directory index takes precedence over flat file)
    const existing = group.files[fileType];
    if (existing?.includes('/index.page.') && !path.includes('/index.page.')) {
      continue;
    }
    group.files[fileType] = path;
  }

  return groups;
}

/** Determine the primary module path based on file precedence */
function getPrimaryModulePath(files: RouteFiles): string {
  // Precedence: ts > html > md
  return files.ts ?? files.html ?? files.md ?? '';
}

/** Detect route collisions (e.g., example.page.ts vs example/index.page.ts) */
function detectCollisions(
  groups: Map<string, RouteFileGroup>,
): { resolved: Map<string, RouteFileGroup>; warnings: string[] } {
  const warnings: string[] = [];

  // Check for patterns that might have come from both folder/index and flat file
  for (const [pattern, group] of groups) {
    const filePaths = Object.values(group.files).filter(Boolean);
    const hasIndex = filePaths.some((p) => p?.includes('/index.page.'));
    const hasFlat = filePaths.some(
      (p) => p && !p.includes('/index.page.') && !p.includes('/'),
    );

    if (hasIndex && hasFlat) {
      warnings.push(
        `⚠️  Mixed file structure for ${pattern}:\n` +
          filePaths.map((p) => `     ${p}`).join('\n') +
          `\n     Both folder/index and flat files detected`,
      );
    }
  }

  return { resolved: groups, warnings };
}

export interface GeneratorResult extends RoutesManifest {
  warnings: string[];
}

/** Generate routes manifest from routes directory */
export async function generateRoutesManifest(
  routesDir: string,
  fs: FileSystem,
): Promise<GeneratorResult> {
  const pageFiles: Array<{
    path: string;
    pattern: string;
    fileType: 'ts' | 'html' | 'md';
  }> = [];
  const redirects: RouteConfig[] = [];
  const errorBoundaries: ErrorBoundary[] = [];
  const statusPages = new Map<number, RouteConfig>();
  let errorHandler: RouteConfig | undefined;

  const allFiles: string[] = [];
  for await (const file of walkDirectory(fs, routesDir)) {
    allFiles.push(file);
  }

  for (const filePath of allFiles) {
    // Get relative path from routes dir
    const relativePath = filePath.replace(`${routesDir}/`, '');
    const filename = relativePath.split('/').pop() ?? '';

    // Handle generic error handler (special case - error.ts at root)
    if (filename === 'error.ts' && relativePath === 'error.ts') {
      errorHandler = {
        pattern: '/',
        type: 'error',
        modulePath: filePath,
      };
      continue;
    }

    const routeType = getRouteType(filename);

    if (!routeType) {
      // Skip non-route files
      continue;
    }

    // Handle status-specific pages (404, 401, 403)
    const statusCode = parseStatusCode(filename);
    if (statusCode) {
      const fileType = getPageFileType(filename);
      const files: RouteFiles = {};
      if (fileType) {
        files[fileType] = filePath;
      }
      const statusRoute: RouteConfig = {
        pattern: `/${statusCode}`,
        type: 'page',
        modulePath: filePath,
        statusCode,
        files,
      };
      statusPages.set(statusCode, statusRoute);
      continue;
    }

    // Generate URL pattern from file path
    const pattern = filePathToPattern(relativePath);

    if (routeType === 'error') {
      // Error boundary
      const boundaryPattern = pattern.replace(/\/[^/]+$/, '') || '/';
      errorBoundaries.push({
        pattern: boundaryPattern,
        modulePath: filePath,
      });
      continue;
    }

    if (routeType === 'redirect') {
      redirects.push({
        pattern,
        type: 'redirect',
        modulePath: filePath,
      });
      continue;
    }

    // Page file - determine type
    const fileType = getPageFileType(filename);
    if (fileType) {
      pageFiles.push({ path: filePath, pattern, fileType });
    }
  }

  // Group files by pattern
  const groups = groupFilesByPattern(pageFiles);

  // Detect collisions
  const { resolved, warnings } = detectCollisions(groups);

  // Convert groups to RouteConfig array
  const routes: RouteConfig[] = [];
  for (const [_pattern, group] of resolved) {
    const modulePath = getPrimaryModulePath(group.files);
    if (!modulePath) continue;

    const route: RouteConfig = {
      pattern: group.pattern,
      type: 'page',
      modulePath,
      files: group.files,
    };

    if (group.parent) {
      route.parent = group.parent;
    }

    routes.push(route);
  }

  // Add redirects to routes
  routes.push(...redirects);

  // Sort routes by specificity
  const sortedRoutes = sortRoutesBySpecificity(routes);

  return {
    routes: sortedRoutes,
    errorBoundaries,
    statusPages,
    errorHandler,
    warnings,
  };
}

/** Generate TypeScript manifest file */
export function generateManifestCode(
  manifest: RoutesManifest,
  importPath = '@emkodev/emroute',
): string {
  const routesArray = manifest.routes
    .map((r) => {
      const filesStr = r.files
        ? `\n    files: { ${
          Object.entries(r.files)
            .filter(([_, v]) => v)
            .map(([k, v]) => `${k}: '${v}'`)
            .join(', ')
        } },`
        : '';

      return `  {
    pattern: '${r.pattern}',
    type: '${r.type}',
    modulePath: '${r.modulePath}',${filesStr}${r.parent ? `\n    parent: '${r.parent}',` : ''}${
        r.statusCode ? `\n    statusCode: ${r.statusCode},` : ''
      }
  }`;
    })
    .join(',\n');

  const errorBoundariesArray = manifest.errorBoundaries
    .map(
      (e) =>
        `  {
    pattern: '${e.pattern}',
    modulePath: '${e.modulePath}',
  }`,
    )
    .join(',\n');

  const statusPagesEntries = [...manifest.statusPages.entries()]
    .map(
      ([status, route]) => {
        const filesStr = route.files
          ? `, files: { ${Object.entries(route.files).map(([k, v]) => `${k}: '${v}'`).join(', ')} }`
          : '';
        return `  [${status}, { pattern: '${route.pattern}', type: '${route.type}', modulePath: '${route.modulePath}', statusCode: ${status}${filesStr} }]`;
      },
    )
    .join(',\n');

  const errorHandlerCode = manifest.errorHandler
    ? `{
  pattern: '${manifest.errorHandler.pattern}',
  type: '${manifest.errorHandler.type}',
  modulePath: '${manifest.errorHandler.modulePath}',
}`
    : 'undefined';

  // Collect all .ts module paths that need pre-bundled loaders
  const tsModulePaths = new Set<string>();
  for (const route of manifest.routes) {
    if (route.files?.ts) tsModulePaths.add(route.files.ts);
    if (route.modulePath.endsWith('.ts')) tsModulePaths.add(route.modulePath);
  }
  for (const boundary of manifest.errorBoundaries) {
    tsModulePaths.add(boundary.modulePath);
  }
  if (manifest.errorHandler) {
    tsModulePaths.add(manifest.errorHandler.modulePath);
  }
  for (const [_, statusRoute] of manifest.statusPages) {
    if (statusRoute.modulePath.endsWith('.ts')) {
      tsModulePaths.add(statusRoute.modulePath);
    }
  }

  const moduleLoadersCode = [...tsModulePaths]
    .map((p) => `    '${p}': () => import('./${p}'),`)
    .join('\n');

  return `/**
 * Generated Routes Manifest
 *
 * DO NOT EDIT - This file is auto-generated by route.generator.ts
 * Run: deno task routes:generate
 */

import type { RoutesManifest } from '${importPath}';

export const routesManifest: RoutesManifest = {
  routes: [
${routesArray}
  ],

  errorBoundaries: [
${errorBoundariesArray}
  ],

  statusPages: new Map([
${statusPagesEntries}
  ]),

  errorHandler: ${errorHandlerCode},

  moduleLoaders: {
${moduleLoadersCode}
  },
};
`;
}

// Re-export types
export type { DirEntry, FileSystem } from './fs.type.ts';
export { FileSystemError } from './fs.type.ts';
