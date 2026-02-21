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
 * - index.error.ts → Root error handler
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
} from '../../src/route/route.matcher.ts';
import type {
  ErrorBoundary,
  RouteConfig,
  RouteFiles,
  RoutesManifest,
} from '../../src/type/route.type.ts';
import type { Runtime } from '../../runtime/abstract.runtime.ts';

/** Walk directory recursively and collect files via Runtime. */
async function* walkDirectory(runtime: Runtime, dir: string): AsyncGenerator<string> {
  const trailingDir = dir.endsWith('/') ? dir : dir + '/';
  const response = await runtime.query(trailingDir);
  const entries: string[] = await response.json();

  for (const entry of entries) {
    const path = `${trailingDir}${entry}`;
    if (entry.endsWith('/')) {
      yield* walkDirectory(runtime, path);
    } else {
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
  files: Array<{ path: string; pattern: string; fileType: 'ts' | 'html' | 'md' | 'css' }>,
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
      (p) => p && !p.includes('/index.page.'),
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
  runtime: Runtime,
): Promise<GeneratorResult> {
  const pageFiles: Array<{
    path: string;
    pattern: string;
    fileType: 'ts' | 'html' | 'md' | 'css';
  }> = [];
  const redirects: RouteConfig[] = [];
  const errorBoundaries: ErrorBoundary[] = [];
  const statusPages = new Map<number, RouteConfig>();
  let errorHandler: RouteConfig | undefined;

  const allFiles: string[] = [];
  for await (const file of walkDirectory(runtime, routesDir)) {
    allFiles.push(file);
  }

  for (const filePath of allFiles) {
    // Get relative path from routes dir
    const relativePath = filePath.replace(`${routesDir}/`, '');
    const filename = relativePath.split('/').pop() ?? '';

    // Handle root error handler (index.error.ts at routes root)
    if (filename === 'index.error.ts' && relativePath === 'index.error.ts') {
      errorHandler = {
        pattern: '/',
        type: 'error',
        modulePath: filePath,
      };
      continue;
    }

    // Handle companion CSS files (.page.css) — not a route type, but grouped with the route
    const cssFileType = getPageFileType(filename);
    if (cssFileType === 'css') {
      const pattern = filePathToPattern(relativePath);
      pageFiles.push({ path: filePath, pattern, fileType: 'css' });
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
      if (fileType) {
        const existing = statusPages.get(statusCode);
        if (existing) {
          existing.files ??= {};
          existing.files[fileType] = filePath;
          existing.modulePath = getPrimaryModulePath(existing.files);
        } else {
          const files: RouteFiles = { [fileType]: filePath };
          statusPages.set(statusCode, {
            pattern: `/${statusCode}`,
            type: 'page',
            modulePath: filePath,
            statusCode,
            files,
          });
        }
      }
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

/** Escape a string for use inside a single-quoted JS/TS string literal. */
function escapeForCodeString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Generate TypeScript manifest file with route patterns.
 *
 * When `basePath` is provided, all patterns are prefixed (e.g. '/html/about').
 * The root pattern '/' becomes the basePath itself (e.g. '/html').
 * Without basePath, patterns remain bare (e.g. '/about').
 */
export function generateManifestCode(
  manifest: RoutesManifest,
  importPath = '@emkodev/emroute',
  basePath = '',
  /** Directory where the manifest file will be written (for resolving relative imports). */
  manifestDir = '',
): string {
  /** Prefix a pattern with basePath. Root '/' becomes basePath itself. */
  const prefix = (pattern: string): string =>
    basePath ? (pattern === '/' ? basePath : basePath + pattern) : pattern;

  /** Strip manifestDir prefix from file paths so imports are relative to manifest location. */
  const stripPrefix = manifestDir ? manifestDir.replace(/\/$/, '') + '/' : '';
  const strip = (p: string): string =>
    stripPrefix && p.startsWith(stripPrefix) ? p.slice(stripPrefix.length) : p;

  const routesArray = manifest.routes
    .map((r) => {
      const filesStr = r.files
        ? `\n    files: { ${
          Object.entries(r.files)
            .filter(([_, v]) => v)
            .map(([k, v]) => `${k}: '${escapeForCodeString(strip(v!))}'`)
            .join(', ')
        } },`
        : '';

      return `  {
    pattern: '${escapeForCodeString(prefix(r.pattern))}',
    type: '${escapeForCodeString(r.type)}',
    modulePath: '${escapeForCodeString(strip(r.modulePath))}',${filesStr}${
        r.parent ? `\n    parent: '${escapeForCodeString(prefix(r.parent))}',` : ''
      }${r.statusCode ? `\n    statusCode: ${r.statusCode},` : ''}
  }`;
    })
    .join(',\n');

  const errorBoundariesArray = manifest.errorBoundaries
    .map(
      (e) =>
        `  {
    pattern: '${escapeForCodeString(prefix(e.pattern))}',
    modulePath: '${escapeForCodeString(strip(e.modulePath))}',
  }`,
    )
    .join(',\n');

  const statusPagesEntries = [...manifest.statusPages.entries()]
    .map(
      ([status, route]) => {
        const filesStr = route.files
          ? `, files: { ${
            Object.entries(route.files).map(([k, v]) => `${k}: '${escapeForCodeString(strip(v!))}'`)
              .join(
                ', ',
              )
          } }`
          : '';
        return `  [${status}, { pattern: '${escapeForCodeString(prefix(route.pattern))}', type: '${
          escapeForCodeString(route.type)
        }', modulePath: '${
          escapeForCodeString(strip(route.modulePath))
        }', statusCode: ${status}${filesStr} }]`;
      },
    )
    .join(',\n');

  const errorHandlerCode = manifest.errorHandler
    ? `{
  pattern: '${escapeForCodeString(prefix(manifest.errorHandler.pattern))}',
  type: '${escapeForCodeString(manifest.errorHandler.type)}',
  modulePath: '${escapeForCodeString(strip(manifest.errorHandler.modulePath))}',
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
    .map((p) => {
      const key = strip(p);
      const rel = key.replace(/^\.\//, '');
      return `    '${escapeForCodeString(key)}': () => import('./${escapeForCodeString(rel)}'),`;
    })
    .join('\n');

  return `/**
 * Generated Routes Manifest
 *
 * DO NOT EDIT - This file is auto-generated by route.generator.ts
 * Run: deno task routes:generate
 */

import type { RoutesManifest } from '${escapeForCodeString(importPath)}';

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

