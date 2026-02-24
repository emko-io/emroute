/**
 * Standalone Scanning Utilities
 *
 * Runtime-agnostic route and widget scanning. Works with any Runtime
 * that implements query() — used by tests with mock runtimes and by
 * the CLI generate command.
 *
 * Note: BunFsRuntime has these as instance methods with lazy caching.
 * These standalone functions are the same logic without caching.
 */

import type { Runtime } from '../runtime/abstract.runtime.ts';
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
import type { WidgetManifestEntry } from '../src/type/widget.type.ts';

export interface GeneratorResult extends RoutesManifest {
  warnings: string[];
}

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

/** Generate routes manifest by scanning a directory via Runtime. */
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
    const relativePath = filePath.replace(`${routesDir}/`, '');
    const filename = relativePath.split('/').pop() ?? '';

    if (filename === 'index.error.ts' && relativePath === 'index.error.ts') {
      errorHandler = {
        pattern: '/',
        type: 'error',
        modulePath: filePath,
      };
      continue;
    }

    const cssFileType = getPageFileType(filename);
    if (cssFileType === 'css') {
      const pattern = filePathToPattern(relativePath);
      pageFiles.push({ path: filePath, pattern, fileType: 'css' });
      continue;
    }

    const routeType = getRouteType(filename);
    if (!routeType) continue;

    const statusMatch = filename.match(/^(\d{3})\.page\.(ts|html|md)$/);
    if (statusMatch) {
      const statusCode = parseInt(statusMatch[1], 10);
      const fileType = getPageFileType(filename);
      if (fileType) {
        const existing = statusPages.get(statusCode);
        if (existing) {
          existing.files ??= {};
          existing.files[fileType] = filePath;
          existing.modulePath = existing.files.ts ?? existing.files.html ?? existing.files.md ?? '';
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

    const pattern = filePathToPattern(relativePath);

    if (routeType === 'error') {
      const boundaryPattern = pattern.replace(/\/[^/]+$/, '') || '/';
      errorBoundaries.push({ pattern: boundaryPattern, modulePath: filePath });
      continue;
    }

    if (routeType === 'redirect') {
      redirects.push({ pattern, type: 'redirect', modulePath: filePath });
      continue;
    }

    const fileType = getPageFileType(filename);
    if (fileType) {
      pageFiles.push({ path: filePath, pattern, fileType });
    }
  }

  // Group files by pattern
  const groups = new Map<string, { pattern: string; files: RouteFiles; parent?: string }>();
  for (const { path, pattern, fileType } of pageFiles) {
    let group = groups.get(pattern);
    if (!group) {
      group = { pattern, files: {} };
      const segments = pattern.split('/').filter(Boolean);
      if (segments.length > 1) {
        group.parent = '/' + segments.slice(0, -1).join('/');
      }
      groups.set(pattern, group);
    }
    const existing = group.files[fileType];
    if (existing?.includes('/index.page.') && !path.includes('/index.page.')) {
      continue;
    }
    group.files[fileType] = path;
  }

  // Detect collisions
  const warnings: string[] = [];
  for (const [pattern, group] of groups) {
    const filePaths = Object.values(group.files).filter(Boolean);
    const hasIndex = filePaths.some((p) => p?.includes('/index.page.'));
    const hasFlat = filePaths.some((p) => p && !p.includes('/index.page.'));
    if (hasIndex && hasFlat) {
      warnings.push(
        `Warning: Mixed file structure for ${pattern}:\n` +
          filePaths.map((p) => `     ${p}`).join('\n') +
          `\n     Both folder/index and flat files detected`,
      );
    }
  }

  // Convert groups to RouteConfig array
  const routes: RouteConfig[] = [];
  for (const [_, group] of groups) {
    const modulePath = group.files.ts ?? group.files.html ?? group.files.md ?? '';
    if (!modulePath) continue;
    const route: RouteConfig = {
      pattern: group.pattern,
      type: 'page',
      modulePath,
      files: group.files,
    };
    if (group.parent) route.parent = group.parent;
    routes.push(route);
  }

  routes.push(...redirects);
  const sortedRoutes = sortRoutesBySpecificity(routes);

  return {
    routes: sortedRoutes,
    errorBoundaries,
    statusPages,
    errorHandler,
    warnings,
  };
}

/**
 * Discover widget modules and companion files by scanning a directory.
 */
export async function discoverWidgets(
  widgetsDir: string,
  runtime: Runtime,
  pathPrefix?: string,
): Promise<WidgetManifestEntry[]> {
  const COMPANION_EXTENSIONS = ['html', 'md', 'css'] as const;
  const WIDGET_FILE_SUFFIX = '.widget.ts';
  const entries: WidgetManifestEntry[] = [];

  const trailingDir = widgetsDir.endsWith('/') ? widgetsDir : widgetsDir + '/';
  const response = await runtime.query(trailingDir);
  const listing: string[] = await response.json();

  for (const item of listing) {
    if (!item.endsWith('/')) continue;

    const name = item.slice(0, -1);
    const moduleFile = `${name}${WIDGET_FILE_SUFFIX}`;
    const modulePath = `${trailingDir}${name}/${moduleFile}`;

    if ((await runtime.query(modulePath)).status === 404) continue;

    const prefix = pathPrefix ? `${pathPrefix}/` : '';
    const entry: WidgetManifestEntry = {
      name,
      modulePath: `${prefix}${name}/${moduleFile}`,
      tagName: `widget-${name}`,
    };

    const files: { html?: string; md?: string; css?: string } = {};
    let hasFiles = false;
    for (const ext of COMPANION_EXTENSIONS) {
      const companionFile = `${name}.widget.${ext}`;
      const companionPath = `${trailingDir}${name}/${companionFile}`;
      if ((await runtime.query(companionPath)).status !== 404) {
        files[ext] = `${prefix}${name}/${companionFile}`;
        hasFiles = true;
      }
    }

    if (hasFiles) entry.files = files;
    entries.push(entry);
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}
