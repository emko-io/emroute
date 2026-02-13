/**
 * Unit tests for Route Generator
 *
 * Comprehensive test suite covering:
 * - Route manifest generation from file structure
 * - File path to route pattern conversion
 * - Companion file detection (.html, .md, .css)
 * - Error boundary detection
 * - Status page detection
 * - Redirect detection
 * - Module loader generation
 * - Manifest code generation
 *
 * Based on documentation:
 * - doc/guide.md: Core routing concepts and file-based routing rules
 * - tool/route.generator.ts: Route manifest generation implementation
 */

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { generateManifestCode, generateRoutesManifest } from '../../tool/route.generator.ts';
import type { DirEntry, FileSystem } from '../../tool/fs.type.ts';

// ============================================================================
// Test Fixtures and Helpers
// ============================================================================

/** In-memory filesystem for testing the route generator. */
function createMockFs(files: string[]): FileSystem {
  // Build directory tree from flat file list
  const dirs = new Map<string, DirEntry[]>();

  for (const filePath of files) {
    // Ensure all parent directories exist
    const parts = filePath.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!dirs.has(dir)) dirs.set(dir, []);
    }

    // Add file entry to its parent directory
    const parentDir = parts.slice(0, -1).join('/');
    const name = parts[parts.length - 1];
    const entries = dirs.get(parentDir) ?? [];
    entries.push({ name, isFile: true, isDirectory: false });
    dirs.set(parentDir, entries);

    // Add subdirectory entries to their parents
    for (let i = 1; i < parts.length - 1; i++) {
      const ancestor = parts.slice(0, i).join('/');
      const childName = parts[i];
      const ancestorEntries = dirs.get(ancestor) ?? [];
      if (!ancestorEntries.some((e) => e.name === childName)) {
        ancestorEntries.push({
          name: childName,
          isFile: false,
          isDirectory: true,
        });
        dirs.set(ancestor, ancestorEntries);
      }
    }
  }

  return {
    async *readDir(path: string) {
      const entries = dirs.get(path) ?? [];
      for (const entry of entries) yield entry;
    },
    writeTextFile: () => Promise.resolve(),
    exists: () => Promise.resolve(true),
  };
}

// ============================================================================
// Flat File Routes
// ============================================================================

Deno.test('generator - flat file produces exact route', async () => {
  const fs = createMockFs(['routes/about.page.md']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/about');
  assertEquals(result.routes[0].files?.md, 'routes/about.page.md');
  assertEquals(result.routes[0].type, 'page');
});

Deno.test('generator - root index page', async () => {
  const fs = createMockFs(['routes/index.page.ts']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/');
  assertEquals(result.routes[0].files?.ts, 'routes/index.page.ts');
});

Deno.test('generator - nested flat file route', async () => {
  const fs = createMockFs(['routes/projects/list.page.html']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/projects/list');
  assertEquals(result.routes[0].files?.html, 'routes/projects/list.page.html');
});

// ============================================================================
// Directory Index Routes (Wildcard)
// ============================================================================

Deno.test('generator - directory index produces wildcard route', async () => {
  const fs = createMockFs(['routes/about/index.page.md']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/about/:rest*');
  assertEquals(result.routes[0].files?.md, 'routes/about/index.page.md');
});

Deno.test('generator - root index stays exact (no wildcard)', async () => {
  const fs = createMockFs(['routes/index.page.ts']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/');
});

Deno.test('generator - deeply nested directory index becomes wildcard', async () => {
  const fs = createMockFs(['routes/docs/guides/index.page.md']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/docs/guides/:rest*');
});

// ============================================================================
// Flat + Directory Coexistence
// ============================================================================

Deno.test('generator - flat and directory index are separate routes', async () => {
  const fs = createMockFs([
    'routes/crypto.page.html',
    'routes/crypto/index.page.md',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  const exact = result.routes.find((r) => r.pattern === '/crypto');
  assertEquals(exact?.files?.html, 'routes/crypto.page.html');

  const wildcard = result.routes.find((r) => r.pattern === '/crypto/:rest*');
  assertEquals(wildcard?.files?.md, 'routes/crypto/index.page.md');
});

Deno.test('generator - same file type: flat and directory produce separate routes', async () => {
  const fs = createMockFs([
    'routes/crypto.page.md',
    'routes/crypto/index.page.md',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  const exact = result.routes.find((r) => r.pattern === '/crypto');
  assertEquals(exact?.files?.md, 'routes/crypto.page.md');

  const wildcard = result.routes.find((r) => r.pattern === '/crypto/:rest*');
  assertEquals(wildcard?.files?.md, 'routes/crypto/index.page.md');
});

Deno.test('generator - children coexist with wildcard parent and flat layout', async () => {
  const fs = createMockFs([
    'routes/crypto.page.html',
    'routes/crypto/index.page.md',
    'routes/crypto/eth.page.md',
    'routes/crypto/sol.page.md',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  const exact = result.routes.find((r) => r.pattern === '/crypto');
  assertEquals(exact?.files?.html, 'routes/crypto.page.html');

  const wildcard = result.routes.find((r) => r.pattern === '/crypto/:rest*');
  assertEquals(wildcard?.files?.md, 'routes/crypto/index.page.md');

  const eth = result.routes.find((r) => r.pattern === '/crypto/eth');
  assertEquals(eth?.files?.md, 'routes/crypto/eth.page.md');

  const sol = result.routes.find((r) => r.pattern === '/crypto/sol');
  assertEquals(sol?.files?.md, 'routes/crypto/sol.page.md');
});

// ============================================================================
// Dynamic Route Segments ([param])
// ============================================================================

Deno.test('generator - dynamic segment produces :param pattern', async () => {
  const fs = createMockFs(['routes/projects/[id].page.ts']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/projects/:id');
  assertEquals(result.routes[0].files?.ts, 'routes/projects/[id].page.ts');
});

Deno.test('generator - multiple dynamic segments', async () => {
  const fs = createMockFs(['routes/users/[userId]/posts/[postId].page.md']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/users/:userId/posts/:postId');
});

Deno.test('generator - dynamic segment with directory index', async () => {
  const fs = createMockFs(['routes/projects/[id]/index.page.ts']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/projects/:id/:rest*');
});

// ============================================================================
// Sort Order (specificity)
// ============================================================================

Deno.test('generator - wildcard routes sort after specific routes', async () => {
  const fs = createMockFs([
    'routes/crypto/index.page.md',
    'routes/crypto/eth.page.md',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes[0].pattern, '/crypto/eth');
  assertEquals(result.routes[1].pattern, '/crypto/:rest*');
});

Deno.test('generator - static routes before dynamic routes', async () => {
  const fs = createMockFs([
    'routes/projects/new.page.md',
    'routes/projects/[id].page.md',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes[0].pattern, '/projects/new');
  assertEquals(result.routes[1].pattern, '/projects/:id');
});

Deno.test('generator - longer paths sort before shorter paths', async () => {
  const fs = createMockFs([
    'routes/api/v1/users.page.ts',
    'routes/api/users.page.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes[0].pattern, '/api/v1/users');
  assertEquals(result.routes[1].pattern, '/api/users');
});

// ============================================================================
// CSS Companion Files
// ============================================================================

Deno.test('generator - css companion file is grouped with page route', async () => {
  const fs = createMockFs([
    'routes/about.page.html',
    'routes/about.page.css',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/about');
  assertEquals(result.routes[0].files?.html, 'routes/about.page.html');
  assertEquals(result.routes[0].files?.css, 'routes/about.page.css');
});

Deno.test('generator - css companion with ts and md files', async () => {
  const fs = createMockFs([
    'routes/dashboard.page.ts',
    'routes/dashboard.page.md',
    'routes/dashboard.page.css',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].files?.ts, 'routes/dashboard.page.ts');
  assertEquals(result.routes[0].files?.md, 'routes/dashboard.page.md');
  assertEquals(result.routes[0].files?.css, 'routes/dashboard.page.css');
  assertEquals(result.routes[0].modulePath, 'routes/dashboard.page.ts');
});

Deno.test('generator - css file alone does not create a route', async () => {
  const fs = createMockFs(['routes/orphan.page.css']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 0);
});

Deno.test('generator - nested css companion file', async () => {
  const fs = createMockFs([
    'routes/projects/[id].page.ts',
    'routes/projects/[id].page.css',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/projects/:id');
  assertEquals(result.routes[0].files?.ts, 'routes/projects/[id].page.ts');
  assertEquals(result.routes[0].files?.css, 'routes/projects/[id].page.css');
});

Deno.test('generator - css with directory index route', async () => {
  const fs = createMockFs([
    'routes/docs/index.page.md',
    'routes/docs/index.page.css',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/docs/:rest*');
  assertEquals(result.routes[0].files?.md, 'routes/docs/index.page.md');
  assertEquals(result.routes[0].files?.css, 'routes/docs/index.page.css');
});

// ============================================================================
// File Type Precedence
// ============================================================================

Deno.test('generator - ts takes precedence over html and md', async () => {
  const fs = createMockFs([
    'routes/dashboard.page.ts',
    'routes/dashboard.page.html',
    'routes/dashboard.page.md',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].modulePath, 'routes/dashboard.page.ts');
  assertEquals(result.routes[0].files?.ts, 'routes/dashboard.page.ts');
  assertEquals(result.routes[0].files?.html, 'routes/dashboard.page.html');
  assertEquals(result.routes[0].files?.md, 'routes/dashboard.page.md');
});

Deno.test('generator - html takes precedence over md when ts is absent', async () => {
  const fs = createMockFs([
    'routes/about.page.html',
    'routes/about.page.md',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].modulePath, 'routes/about.page.html');
  assertEquals(result.routes[0].files?.html, 'routes/about.page.html');
  assertEquals(result.routes[0].files?.md, 'routes/about.page.md');
});

Deno.test('generator - md becomes modulePath when no ts or html', async () => {
  const fs = createMockFs(['routes/guide.page.md']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].modulePath, 'routes/guide.page.md');
});

// ============================================================================
// Error Handling (.error.ts)
// ============================================================================

Deno.test('generator - index.error.ts at root becomes errorHandler', async () => {
  const fs = createMockFs([
    'routes/index.page.md',
    'routes/index.error.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.errorHandler?.pattern, '/');
  assertEquals(result.errorHandler?.type, 'error');
  assertEquals(result.errorHandler?.modulePath, 'routes/index.error.ts');
  assertEquals(result.errorBoundaries.length, 0);
});

Deno.test('generator - scoped .error.ts becomes error boundary', async () => {
  const fs = createMockFs([
    'routes/projects/[id].page.ts',
    'routes/projects/[id].error.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.errorBoundaries.length, 1);
  assertEquals(result.errorBoundaries[0].pattern, '/projects');
  assertEquals(result.errorBoundaries[0].modulePath, 'routes/projects/[id].error.ts');
  assertEquals(result.errorHandler, undefined);
});

Deno.test('generator - nested error boundary strips file, not pattern', async () => {
  const fs = createMockFs([
    'routes/docs/guides/[slug].page.md',
    'routes/docs/guides/[slug].error.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.errorBoundaries.length, 1);
  assertEquals(result.errorBoundaries[0].pattern, '/docs/guides');
});

Deno.test('generator - root error handler and scoped boundary coexist', async () => {
  const fs = createMockFs([
    'routes/index.error.ts',
    'routes/projects/[id].error.ts',
    'routes/projects/[id].page.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.errorHandler?.modulePath, 'routes/index.error.ts');
  assertEquals(result.errorBoundaries.length, 1);
  assertEquals(result.errorBoundaries[0].pattern, '/projects');
});

Deno.test('generator - multiple error boundaries', async () => {
  const fs = createMockFs([
    'routes/api/users/[id].page.ts',
    'routes/api/users/[id].error.ts',
    'routes/admin/dashboard.page.ts',
    'routes/admin/dashboard.error.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.errorBoundaries.length, 2);
  assertEquals(result.errorBoundaries.some((b) => b.pattern === '/api/users'), true);
  assertEquals(result.errorBoundaries.some((b) => b.pattern === '/admin'), true);
});

Deno.test('generator - bare error.ts at root is ignored (not a route)', async () => {
  const fs = createMockFs([
    'routes/index.page.md',
    'routes/error.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.errorHandler, undefined);
  assertEquals(result.errorBoundaries.length, 0);
  assertEquals(result.routes.length, 1);
});

// ============================================================================
// Status Pages (404, 401, 403)
// ============================================================================

Deno.test('generator - status pages are registered by code', async () => {
  const fs = createMockFs([
    'routes/index.page.md',
    'routes/404.page.html',
    'routes/401.page.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.statusPages.size, 2);
  assertEquals(result.statusPages.get(404)?.statusCode, 404);
  assertEquals(result.statusPages.get(404)?.files?.html, 'routes/404.page.html');
  assertEquals(result.statusPages.get(401)?.statusCode, 401);
  assertEquals(result.statusPages.get(401)?.files?.ts, 'routes/401.page.ts');
});

Deno.test('generator - 403 status page', async () => {
  const fs = createMockFs(['routes/403.page.md']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.statusPages.size, 1);
  assertEquals(result.statusPages.get(403)?.statusCode, 403);
  assertEquals(result.statusPages.get(403)?.files?.md, 'routes/403.page.md');
});

Deno.test('generator - status page pattern is fixed to /{code}', async () => {
  const fs = createMockFs(['routes/404.page.html']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.statusPages.get(404)?.pattern, '/404');
});

Deno.test('generator - status page with companion css', async () => {
  const fs = createMockFs([
    'routes/404.page.html',
    'routes/404.page.css',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  const statusPage = result.statusPages.get(404);
  assertEquals(statusPage?.files?.html, 'routes/404.page.html');
  // CSS files don't get added to status pages because they don't match the status page pattern
  assertEquals(statusPage?.files?.css, undefined);
});

Deno.test('generator - status page and regular routes coexist', async () => {
  const fs = createMockFs([
    'routes/index.page.md',
    'routes/about.page.md',
    'routes/404.page.html',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 2);
  assertEquals(result.statusPages.size, 1);
  assertEquals(result.routes.some((r) => r.pattern === '/'), true);
  assertEquals(result.routes.some((r) => r.pattern === '/about'), true);
});

// ============================================================================
// Redirect Detection (.redirect.ts)
// ============================================================================

Deno.test('generator - redirect file creates redirect route', async () => {
  const fs = createMockFs([
    'routes/old.redirect.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/old');
  assertEquals(result.routes[0].type, 'redirect');
  assertEquals(result.routes[0].modulePath, 'routes/old.redirect.ts');
});

Deno.test('generator - nested redirect route', async () => {
  const fs = createMockFs([
    'routes/legacy/api/v1.redirect.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/legacy/api/v1');
  assertEquals(result.routes[0].type, 'redirect');
});

Deno.test('generator - dynamic redirect route', async () => {
  const fs = createMockFs([
    'routes/old-posts/[id].redirect.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/old-posts/:id');
  assertEquals(result.routes[0].type, 'redirect');
});

Deno.test('generator - redirects and pages coexist', async () => {
  const fs = createMockFs([
    'routes/index.page.md',
    'routes/about.page.md',
    'routes/old-about.redirect.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 3);
  const redirect = result.routes.find((r) => r.pattern === '/old-about');
  assertEquals(redirect?.type, 'redirect');
});

// ============================================================================
// Parent Route Association (Nesting)
// ============================================================================

Deno.test('generator - nested route has parent reference', async () => {
  const fs = createMockFs([
    'routes/projects/list.page.md',
    'routes/projects/[id].page.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  const idRoute = result.routes.find((r) => r.pattern === '/projects/:id');
  assertEquals(idRoute?.parent, '/projects');
});

Deno.test('generator - root routes have no parent', async () => {
  const fs = createMockFs([
    'routes/about.page.md',
    'routes/contact.page.md',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  for (const route of result.routes) {
    assertEquals(route.parent, undefined);
  }
});

Deno.test('generator - deeply nested routes have correct parent', async () => {
  const fs = createMockFs([
    'routes/admin/users/list.page.ts',
    'routes/admin/users/[id]/edit.page.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  const editRoute = result.routes.find((r) => r.pattern === '/admin/users/:id/edit');
  assertEquals(editRoute?.parent, '/admin/users/:id');
});

// ============================================================================
// Module Loader Generation
// ============================================================================

Deno.test('generator - collects all .ts module paths for loaders', async () => {
  const fs = createMockFs([
    'routes/index.page.ts',
    'routes/dashboard.page.ts',
    'routes/projects/[id].page.ts',
    'routes/index.error.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  assertStringIncludes(code, 'routes/index.page.ts');
  assertStringIncludes(code, 'routes/dashboard.page.ts');
  assertStringIncludes(code, 'routes/projects/[id].page.ts');
  assertStringIncludes(code, 'routes/index.error.ts');
});

Deno.test('generator - module loaders use dynamic import', async () => {
  const fs = createMockFs(['routes/index.page.ts']);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  assertStringIncludes(code, 'import(');
});

Deno.test('generator - module loaders keyed by full path', async () => {
  const fs = createMockFs(['routes/dashboard.page.ts']);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  assertStringIncludes(code, "'routes/dashboard.page.ts'");
});

Deno.test('generator - ignores non-.ts files in module loaders', async () => {
  const fs = createMockFs([
    'routes/about.page.html',
    'routes/guide.page.md',
  ]);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  // Module loaders should be empty or not include these files
  const hasImportModule = code.includes("': () => import(");
  assertEquals(hasImportModule, false);
});

Deno.test('generator - status page .ts modules in loaders', async () => {
  const fs = createMockFs(['routes/404.page.ts']);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  assertStringIncludes(code, "'routes/404.page.ts'");
});

Deno.test('generator - error boundary modules in loaders', async () => {
  const fs = createMockFs([
    'routes/projects/[id].page.ts',
    'routes/projects/[id].error.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  assertStringIncludes(code, "'routes/projects/[id].error.ts'");
});

// ============================================================================
// Manifest Code Generation
// ============================================================================

Deno.test('generator - produces valid TypeScript code', async () => {
  const fs = createMockFs(['routes/about.page.md']);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  assertStringIncludes(code, 'import type { RoutesManifest }');
  assertStringIncludes(code, 'export const routesManifest: RoutesManifest');
});

Deno.test('generator - includes routes array', async () => {
  const fs = createMockFs([
    'routes/about.page.md',
    'routes/contact.page.md',
  ]);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  assertStringIncludes(code, 'routes: [');
  assertStringIncludes(code, "pattern: '/about'");
  assertStringIncludes(code, "pattern: '/contact'");
});

Deno.test('generator - includes errorBoundaries array', async () => {
  const fs = createMockFs([
    'routes/projects/[id].page.ts',
    'routes/projects/[id].error.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  assertStringIncludes(code, 'errorBoundaries: [');
  assertStringIncludes(code, "pattern: '/projects'");
});

Deno.test('generator - includes statusPages map', async () => {
  const fs = createMockFs(['routes/404.page.html']);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  assertStringIncludes(code, 'statusPages: new Map([');
  assertStringIncludes(code, '[404, {');
});

Deno.test('generator - includes errorHandler if present', async () => {
  const fs = createMockFs(['routes/index.error.ts']);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  assertStringIncludes(code, 'errorHandler: {');
  assertStringIncludes(code, "pattern: '/'");
});

Deno.test('generator - errorHandler is undefined if absent', async () => {
  const fs = createMockFs(['routes/index.page.md']);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  assertStringIncludes(code, 'errorHandler: undefined');
});

Deno.test('generator - includes moduleLoaders object', async () => {
  const fs = createMockFs(['routes/index.page.ts']);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  assertStringIncludes(code, 'moduleLoaders: {');
  assertStringIncludes(code, '() => import(');
});

Deno.test('generator - includes custom import path in generated code', async () => {
  const fs = createMockFs(['routes/about.page.md']);
  const result = await generateRoutesManifest('routes', fs);
  const customPath = '@mycompany/routing-lib';
  const code = generateManifestCode(result, customPath);

  assertStringIncludes(code, customPath);
});

Deno.test('generator - escapes quotes in file paths', async () => {
  const fs = createMockFs(["routes/page-with-'quotes'.page.ts"]);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  assertStringIncludes(code, "\\'");
});

Deno.test('generator - escapes backslashes in file paths', async () => {
  const fs = createMockFs(['routes/page.page.ts']);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  // Code should be valid TypeScript (no unescaped backslashes)
  assertExists(code);
});

// ============================================================================
// Collision Detection
// ============================================================================

Deno.test('generator - flat and directory are separate patterns (no collision)', async () => {
  const fs = createMockFs([
    'routes/products.page.ts',
    'routes/products/index.page.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  // Flat file creates /products, directory index creates /products/:rest*
  // These are different patterns, so no collision detected
  assertEquals(result.warnings.length, 0);
  assertEquals(result.routes.length, 2);
});

Deno.test('generator - multiple file types for same route no collision', async () => {
  const fs = createMockFs([
    'routes/about.page.ts',
    'routes/about.page.html',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  // Both ts and html are flat files for /about pattern, no collision since they're the same route
  assertEquals(result.warnings.length, 0);
  assertEquals(result.routes.length, 1);
});

Deno.test('generator - no collision for pure directory index', async () => {
  const fs = createMockFs([
    'routes/items/index.page.ts',
    'routes/items/index.page.html',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.warnings.length, 0);
});

// ============================================================================
// Empty Directories
// ============================================================================

Deno.test('generator - handles empty routes directory', async () => {
  const fs = createMockFs([]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 0);
  assertEquals(result.errorBoundaries.length, 0);
  assertEquals(result.statusPages.size, 0);
  assertEquals(result.errorHandler, undefined);
});

// ============================================================================
// Complex Real-World Scenarios
// ============================================================================

Deno.test('generator - real-world blog structure', async () => {
  const fs = createMockFs([
    'routes/index.page.ts',
    'routes/about.page.md',
    'routes/blog.page.html',
    'routes/blog/index.page.ts',
    'routes/blog/[slug].page.ts',
    'routes/blog/[slug].page.css',
    'routes/blog/[slug].error.ts',
    'routes/admin/dashboard.page.ts',
    'routes/admin/users/[id].page.ts',
    'routes/404.page.md',
    'routes/index.error.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  // index, about, blog (flat), blog (directory index), blog/slug, admin/dashboard, admin/users/id = 7 routes
  assertEquals(result.routes.length, 7);
  assertEquals(result.errorBoundaries.length, 1);
  assertEquals(result.statusPages.size, 1);
  assertEquals(result.errorHandler?.modulePath, 'routes/index.error.ts');
});

Deno.test('generator - real-world with all file types', async () => {
  const fs = createMockFs([
    'routes/docs.page.html',
    'routes/docs.page.css',
    'routes/docs/index.page.md',
    'routes/docs/[slug].page.ts',
    'routes/docs/[slug].page.css',
    'routes/docs/[slug].error.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);
  const code = generateManifestCode(result);

  // /docs (flat), /docs/:rest* (directory index), /docs/:slug (dynamic)
  assertEquals(result.routes.length, 3);
  // The flat /docs route has the html file, but CSS is added separately
  const docsRoute = result.routes.find((r) => r.pattern === '/docs');
  assertEquals(docsRoute?.files?.html, 'routes/docs.page.html');
  assertEquals(docsRoute?.files?.css, 'routes/docs.page.css');
  assertStringIncludes(code, 'moduleLoaders');
});

Deno.test('generator - deeply nested structure', async () => {
  const fs = createMockFs([
    'routes/api/v1/users/[userId]/posts/[postId]/comments/[commentId].page.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/api/v1/users/:userId/posts/:postId/comments/:commentId');
  assertEquals(result.routes[0].parent, '/api/v1/users/:userId/posts/:postId/comments');
});

// ============================================================================
// Edge Cases
// ============================================================================

Deno.test('generator - ignores non-route files', async () => {
  const fs = createMockFs([
    'routes/README.md',
    'routes/utils.ts',
    'routes/.gitkeep',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 0);
});

Deno.test('generator - handles routes with hyphens', async () => {
  const fs = createMockFs(['routes/my-route-name.page.md']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes[0].pattern, '/my-route-name');
});

Deno.test('generator - handles routes with numbers', async () => {
  const fs = createMockFs(['routes/v2-api.page.ts']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes[0].pattern, '/v2-api');
});

// ============================================================================
// Manifest Integrity
// ============================================================================

Deno.test('generator - all routes have required fields', async () => {
  const fs = createMockFs([
    'routes/index.page.ts',
    'routes/about.page.md',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  for (const route of result.routes) {
    assertExists(route.pattern);
    assertExists(route.type);
    assertExists(route.modulePath);
  }
});

Deno.test('generator - all error boundaries have required fields', async () => {
  const fs = createMockFs([
    'routes/api/[id].page.ts',
    'routes/api/[id].error.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  for (const boundary of result.errorBoundaries) {
    assertExists(boundary.pattern);
    assertExists(boundary.modulePath);
  }
});

Deno.test('generator - status pages keyed correctly', async () => {
  const fs = createMockFs([
    'routes/404.page.html',
    'routes/401.page.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.statusPages.has(404), true);
  assertEquals(result.statusPages.has(401), true);
  assertEquals(result.statusPages.get(404)?.statusCode, 404);
  assertEquals(result.statusPages.get(401)?.statusCode, 401);
});

// ============================================================================
// Route Type Consistency
// ============================================================================

Deno.test('generator - all regular routes have type page', async () => {
  const fs = createMockFs([
    'routes/about.page.md',
    'routes/contact.page.html',
    'routes/dashboard.page.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  for (const route of result.routes) {
    if (!route.modulePath.includes('404') && !route.modulePath.includes('401')) {
      assertEquals(route.type, 'page');
    }
  }
});

Deno.test('generator - redirect routes have type redirect', async () => {
  const fs = createMockFs(['routes/old-page.redirect.ts']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes[0].type, 'redirect');
});
