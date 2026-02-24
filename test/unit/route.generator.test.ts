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
 * - doc/04-routing.md: Routing concepts and file-based routing rules
 * - server/generator/route.generator.ts: Route manifest generation implementation
 */

import { test, expect, describe } from 'bun:test';
import { generateRoutesManifest } from '../../server/scanner.util.ts';
import { Runtime } from '../../runtime/abstract.runtime.ts';
import type { FetchParams, FetchReturn } from '../../runtime/abstract.runtime.ts';

// ============================================================================
// Test Fixtures and Helpers
// ============================================================================

/** In-memory Runtime implementation for testing the route generator. */
function createMockRuntime(files: string[]): Runtime {
  // Build directory tree from flat file list
  // Key: directory path (with trailing slash), Value: entry names (dirs end with "/", files don't)
  const dirs = new Map<string, string[]>();

  for (const filePath of files) {
    const parts = filePath.split('/');

    // Ensure all parent directories exist
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/') + '/';
      if (!dirs.has(dir)) dirs.set(dir, []);
    }

    // Add file entry to its parent directory
    const parentDir = parts.slice(0, -1).join('/') + '/';
    const name = parts[parts.length - 1];
    const entries = dirs.get(parentDir) ?? [];
    if (!entries.includes(name)) entries.push(name);
    dirs.set(parentDir, entries);

    // Add subdirectory entries to their parents
    for (let i = 1; i < parts.length - 1; i++) {
      const ancestor = parts.slice(0, i).join('/') + '/';
      const childName = parts[i] + '/';
      const ancestorEntries = dirs.get(ancestor) ?? [];
      if (!ancestorEntries.includes(childName)) {
        ancestorEntries.push(childName);
        dirs.set(ancestor, ancestorEntries);
      }
    }
  }

  // Ensure the root "routes/" directory always exists (even when files is empty)
  if (!dirs.has('routes/')) dirs.set('routes/', []);

  return new (class extends Runtime {
    handle(resource: FetchParams[0], _init?: FetchParams[1]): FetchReturn {
      const path = typeof resource === 'string'
        ? resource
        : resource instanceof URL
        ? resource.pathname
        : resource.url;
      const trailingPath = path.endsWith('/') ? path : path + '/';

      if (dirs.has(trailingPath)) {
        return Promise.resolve(
          new Response(JSON.stringify(dirs.get(trailingPath)), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }

      // Check if it's a known file (any non-directory path that exists in some directory listing)
      const parentDir = path.replace(/\/[^/]+$/, '') + '/';
      const fileName = path.split('/').pop() ?? '';
      const parentEntries = dirs.get(parentDir);
      if (parentEntries?.includes(fileName)) {
        return Promise.resolve(new Response('', { status: 200 }));
      }

      return Promise.resolve(new Response('Not found', { status: 404 }));
    }

    query(resource: FetchParams[0], options?: FetchParams[1] & { as?: 'text' }): any {
      if (options && 'as' in options && options.as === 'text') {
        return this.handle(resource, options).then((r: Response) => r.text());
      }
      return this.handle(resource, options);
    }
  })();
}

// ============================================================================
// Flat File Routes
// ============================================================================

test('generator - flat file produces exact route', async () => {
  const runtime = createMockRuntime(['routes/about.page.md']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/about');
  expect(result.routes[0].files?.md).toEqual('routes/about.page.md');
  expect(result.routes[0].type).toEqual('page');
});

test('generator - root index page', async () => {
  const runtime = createMockRuntime(['routes/index.page.ts']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/');
  expect(result.routes[0].files?.ts).toEqual('routes/index.page.ts');
});

test('generator - nested flat file route', async () => {
  const runtime = createMockRuntime(['routes/projects/list.page.html']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/projects/list');
  expect(result.routes[0].files?.html).toEqual('routes/projects/list.page.html');
});

// ============================================================================
// Directory Index Routes (Wildcard)
// ============================================================================

test('generator - directory index produces wildcard route', async () => {
  const runtime = createMockRuntime(['routes/about/index.page.md']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/about/:rest*');
  expect(result.routes[0].files?.md).toEqual('routes/about/index.page.md');
});

test('generator - root index stays exact (no wildcard)', async () => {
  const runtime = createMockRuntime(['routes/index.page.ts']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/');
});

test('generator - deeply nested directory index becomes wildcard', async () => {
  const runtime = createMockRuntime(['routes/docs/guides/index.page.md']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/docs/guides/:rest*');
});

// ============================================================================
// Flat + Directory Coexistence
// ============================================================================

test('generator - flat and directory index are separate routes', async () => {
  const runtime = createMockRuntime([
    'routes/crypto.page.html',
    'routes/crypto/index.page.md',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  const exact = result.routes.find((r) => r.pattern === '/crypto');
  expect(exact?.files?.html).toEqual('routes/crypto.page.html');

  const wildcard = result.routes.find((r) => r.pattern === '/crypto/:rest*');
  expect(wildcard?.files?.md).toEqual('routes/crypto/index.page.md');
});

test('generator - same file type: flat and directory produce separate routes', async () => {
  const runtime = createMockRuntime([
    'routes/crypto.page.md',
    'routes/crypto/index.page.md',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  const exact = result.routes.find((r) => r.pattern === '/crypto');
  expect(exact?.files?.md).toEqual('routes/crypto.page.md');

  const wildcard = result.routes.find((r) => r.pattern === '/crypto/:rest*');
  expect(wildcard?.files?.md).toEqual('routes/crypto/index.page.md');
});

test('generator - children coexist with wildcard parent and flat layout', async () => {
  const runtime = createMockRuntime([
    'routes/crypto.page.html',
    'routes/crypto/index.page.md',
    'routes/crypto/eth.page.md',
    'routes/crypto/sol.page.md',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  const exact = result.routes.find((r) => r.pattern === '/crypto');
  expect(exact?.files?.html).toEqual('routes/crypto.page.html');

  const wildcard = result.routes.find((r) => r.pattern === '/crypto/:rest*');
  expect(wildcard?.files?.md).toEqual('routes/crypto/index.page.md');

  const eth = result.routes.find((r) => r.pattern === '/crypto/eth');
  expect(eth?.files?.md).toEqual('routes/crypto/eth.page.md');

  const sol = result.routes.find((r) => r.pattern === '/crypto/sol');
  expect(sol?.files?.md).toEqual('routes/crypto/sol.page.md');
});

// ============================================================================
// Dynamic Route Segments ([param])
// ============================================================================

test('generator - dynamic segment produces :param pattern', async () => {
  const runtime = createMockRuntime(['routes/projects/[id].page.ts']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/projects/:id');
  expect(result.routes[0].files?.ts).toEqual('routes/projects/[id].page.ts');
});

test('generator - multiple dynamic segments', async () => {
  const runtime = createMockRuntime(['routes/users/[userId]/posts/[postId].page.md']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/users/:userId/posts/:postId');
});

test('generator - dynamic segment with directory index', async () => {
  const runtime = createMockRuntime(['routes/projects/[id]/index.page.ts']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/projects/:id/:rest*');
});

// ============================================================================
// Sort Order (specificity)
// ============================================================================

test('generator - wildcard routes sort after specific routes', async () => {
  const runtime = createMockRuntime([
    'routes/crypto/index.page.md',
    'routes/crypto/eth.page.md',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes[0].pattern).toEqual('/crypto/eth');
  expect(result.routes[1].pattern).toEqual('/crypto/:rest*');
});

test('generator - static routes before dynamic routes', async () => {
  const runtime = createMockRuntime([
    'routes/projects/new.page.md',
    'routes/projects/[id].page.md',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes[0].pattern).toEqual('/projects/new');
  expect(result.routes[1].pattern).toEqual('/projects/:id');
});

test('generator - longer paths sort before shorter paths', async () => {
  const runtime = createMockRuntime([
    'routes/api/v1/users.page.ts',
    'routes/api/users.page.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes[0].pattern).toEqual('/api/v1/users');
  expect(result.routes[1].pattern).toEqual('/api/users');
});

// ============================================================================
// CSS Companion Files
// ============================================================================

test('generator - css companion file is grouped with page route', async () => {
  const runtime = createMockRuntime([
    'routes/about.page.html',
    'routes/about.page.css',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/about');
  expect(result.routes[0].files?.html).toEqual('routes/about.page.html');
  expect(result.routes[0].files?.css).toEqual('routes/about.page.css');
});

test('generator - css companion with ts and md files', async () => {
  const runtime = createMockRuntime([
    'routes/dashboard.page.ts',
    'routes/dashboard.page.md',
    'routes/dashboard.page.css',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].files?.ts).toEqual('routes/dashboard.page.ts');
  expect(result.routes[0].files?.md).toEqual('routes/dashboard.page.md');
  expect(result.routes[0].files?.css).toEqual('routes/dashboard.page.css');
  expect(result.routes[0].modulePath).toEqual('routes/dashboard.page.ts');
});

test('generator - css file alone does not create a route', async () => {
  const runtime = createMockRuntime(['routes/orphan.page.css']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(0);
});

test('generator - nested css companion file', async () => {
  const runtime = createMockRuntime([
    'routes/projects/[id].page.ts',
    'routes/projects/[id].page.css',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/projects/:id');
  expect(result.routes[0].files?.ts).toEqual('routes/projects/[id].page.ts');
  expect(result.routes[0].files?.css).toEqual('routes/projects/[id].page.css');
});

test('generator - css with directory index route', async () => {
  const runtime = createMockRuntime([
    'routes/docs/index.page.md',
    'routes/docs/index.page.css',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/docs/:rest*');
  expect(result.routes[0].files?.md).toEqual('routes/docs/index.page.md');
  expect(result.routes[0].files?.css).toEqual('routes/docs/index.page.css');
});

// ============================================================================
// File Type Precedence
// ============================================================================

test('generator - ts takes precedence over html and md', async () => {
  const runtime = createMockRuntime([
    'routes/dashboard.page.ts',
    'routes/dashboard.page.html',
    'routes/dashboard.page.md',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].modulePath).toEqual('routes/dashboard.page.ts');
  expect(result.routes[0].files?.ts).toEqual('routes/dashboard.page.ts');
  expect(result.routes[0].files?.html).toEqual('routes/dashboard.page.html');
  expect(result.routes[0].files?.md).toEqual('routes/dashboard.page.md');
});

test('generator - html takes precedence over md when ts is absent', async () => {
  const runtime = createMockRuntime([
    'routes/about.page.html',
    'routes/about.page.md',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].modulePath).toEqual('routes/about.page.html');
  expect(result.routes[0].files?.html).toEqual('routes/about.page.html');
  expect(result.routes[0].files?.md).toEqual('routes/about.page.md');
});

test('generator - md becomes modulePath when no ts or html', async () => {
  const runtime = createMockRuntime(['routes/guide.page.md']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].modulePath).toEqual('routes/guide.page.md');
});

// ============================================================================
// Error Handling (.error.ts)
// ============================================================================

test('generator - index.error.ts at root becomes errorHandler', async () => {
  const runtime = createMockRuntime([
    'routes/index.page.md',
    'routes/index.error.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.errorHandler?.pattern).toEqual('/');
  expect(result.errorHandler?.type).toEqual('error');
  expect(result.errorHandler?.modulePath).toEqual('routes/index.error.ts');
  expect(result.errorBoundaries.length).toEqual(0);
});

test('generator - scoped .error.ts becomes error boundary', async () => {
  const runtime = createMockRuntime([
    'routes/projects/[id].page.ts',
    'routes/projects/[id].error.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.errorBoundaries.length).toEqual(1);
  expect(result.errorBoundaries[0].pattern).toEqual('/projects');
  expect(result.errorBoundaries[0].modulePath).toEqual('routes/projects/[id].error.ts');
  expect(result.errorHandler).toEqual(undefined);
});

test('generator - nested error boundary strips file, not pattern', async () => {
  const runtime = createMockRuntime([
    'routes/docs/guides/[slug].page.md',
    'routes/docs/guides/[slug].error.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.errorBoundaries.length).toEqual(1);
  expect(result.errorBoundaries[0].pattern).toEqual('/docs/guides');
});

test('generator - root error handler and scoped boundary coexist', async () => {
  const runtime = createMockRuntime([
    'routes/index.error.ts',
    'routes/projects/[id].error.ts',
    'routes/projects/[id].page.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.errorHandler?.modulePath).toEqual('routes/index.error.ts');
  expect(result.errorBoundaries.length).toEqual(1);
  expect(result.errorBoundaries[0].pattern).toEqual('/projects');
});

test('generator - multiple error boundaries', async () => {
  const runtime = createMockRuntime([
    'routes/api/users/[id].page.ts',
    'routes/api/users/[id].error.ts',
    'routes/admin/dashboard.page.ts',
    'routes/admin/dashboard.error.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.errorBoundaries.length).toEqual(2);
  expect(result.errorBoundaries.some((b) => b.pattern === '/api/users')).toEqual(true);
  expect(result.errorBoundaries.some((b) => b.pattern === '/admin')).toEqual(true);
});

test('generator - bare error.ts at root is ignored (not a route)', async () => {
  const runtime = createMockRuntime([
    'routes/index.page.md',
    'routes/error.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.errorHandler).toEqual(undefined);
  expect(result.errorBoundaries.length).toEqual(0);
  expect(result.routes.length).toEqual(1);
});

// ============================================================================
// Status Pages (404, 401, 403)
// ============================================================================

test('generator - status pages are registered by code', async () => {
  const runtime = createMockRuntime([
    'routes/index.page.md',
    'routes/404.page.html',
    'routes/401.page.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.statusPages.size).toEqual(2);
  expect(result.statusPages.get(404)?.statusCode).toEqual(404);
  expect(result.statusPages.get(404)?.files?.html).toEqual('routes/404.page.html');
  expect(result.statusPages.get(401)?.statusCode).toEqual(401);
  expect(result.statusPages.get(401)?.files?.ts).toEqual('routes/401.page.ts');
});

test('generator - 403 status page', async () => {
  const runtime = createMockRuntime(['routes/403.page.md']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.statusPages.size).toEqual(1);
  expect(result.statusPages.get(403)?.statusCode).toEqual(403);
  expect(result.statusPages.get(403)?.files?.md).toEqual('routes/403.page.md');
});

test('generator - status page pattern is fixed to /{code}', async () => {
  const runtime = createMockRuntime(['routes/404.page.html']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.statusPages.get(404)?.pattern).toEqual('/404');
});

test('generator - status page with companion css', async () => {
  const runtime = createMockRuntime([
    'routes/404.page.html',
    'routes/404.page.css',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  const statusPage = result.statusPages.get(404);
  expect(statusPage?.files?.html).toEqual('routes/404.page.html');
  // CSS files don't get added to status pages because they don't match the status page pattern
  expect(statusPage?.files?.css).toEqual(undefined);
});

test('generator - status page and regular routes coexist', async () => {
  const runtime = createMockRuntime([
    'routes/index.page.md',
    'routes/about.page.md',
    'routes/404.page.html',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(2);
  expect(result.statusPages.size).toEqual(1);
  expect(result.routes.some((r) => r.pattern === '/')).toEqual(true);
  expect(result.routes.some((r) => r.pattern === '/about')).toEqual(true);
});

// ============================================================================
// Redirect Detection (.redirect.ts)
// ============================================================================

test('generator - redirect file creates redirect route', async () => {
  const runtime = createMockRuntime([
    'routes/old.redirect.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/old');
  expect(result.routes[0].type).toEqual('redirect');
  expect(result.routes[0].modulePath).toEqual('routes/old.redirect.ts');
});

test('generator - nested redirect route', async () => {
  const runtime = createMockRuntime([
    'routes/legacy/api/v1.redirect.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/legacy/api/v1');
  expect(result.routes[0].type).toEqual('redirect');
});

test('generator - dynamic redirect route', async () => {
  const runtime = createMockRuntime([
    'routes/old-posts/[id].redirect.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/old-posts/:id');
  expect(result.routes[0].type).toEqual('redirect');
});

test('generator - redirects and pages coexist', async () => {
  const runtime = createMockRuntime([
    'routes/index.page.md',
    'routes/about.page.md',
    'routes/old-about.redirect.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(3);
  const redirect = result.routes.find((r) => r.pattern === '/old-about');
  expect(redirect?.type).toEqual('redirect');
});

// ============================================================================
// Parent Route Association (Nesting)
// ============================================================================

test('generator - nested route has parent reference', async () => {
  const runtime = createMockRuntime([
    'routes/projects/list.page.md',
    'routes/projects/[id].page.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  const idRoute = result.routes.find((r) => r.pattern === '/projects/:id');
  expect(idRoute?.parent).toEqual('/projects');
});

test('generator - root routes have no parent', async () => {
  const runtime = createMockRuntime([
    'routes/about.page.md',
    'routes/contact.page.md',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  for (const route of result.routes) {
    expect(route.parent).toEqual(undefined);
  }
});

test('generator - deeply nested routes have correct parent', async () => {
  const runtime = createMockRuntime([
    'routes/admin/users/list.page.ts',
    'routes/admin/users/[id]/edit.page.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  const editRoute = result.routes.find((r) => r.pattern === '/admin/users/:id/edit');
  expect(editRoute?.parent).toEqual('/admin/users/:id');
});


// ============================================================================
// Collision Detection
// ============================================================================

test('generator - flat and directory are separate patterns (no collision)', async () => {
  const runtime = createMockRuntime([
    'routes/products.page.ts',
    'routes/products/index.page.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  // Flat file creates /products, directory index creates /products/:rest*
  // These are different patterns, so no collision detected
  expect(result.warnings.length).toEqual(0);
  expect(result.routes.length).toEqual(2);
});

test('generator - multiple file types for same route no collision', async () => {
  const runtime = createMockRuntime([
    'routes/about.page.ts',
    'routes/about.page.html',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  // Both ts and html are flat files for /about pattern, no collision since they're the same route
  expect(result.warnings.length).toEqual(0);
  expect(result.routes.length).toEqual(1);
});

test('generator - no collision for pure directory index', async () => {
  const runtime = createMockRuntime([
    'routes/items/index.page.ts',
    'routes/items/index.page.html',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.warnings.length).toEqual(0);
});

// ============================================================================
// Empty Directories
// ============================================================================

test('generator - handles empty routes directory', async () => {
  const runtime = createMockRuntime([]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(0);
  expect(result.errorBoundaries.length).toEqual(0);
  expect(result.statusPages.size).toEqual(0);
  expect(result.errorHandler).toEqual(undefined);
});

// ============================================================================
// Complex Real-World Scenarios
// ============================================================================

test('generator - real-world blog structure', async () => {
  const runtime = createMockRuntime([
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
  const result = await generateRoutesManifest('routes', runtime);

  // index, about, blog (flat), blog (directory index), blog/slug, admin/dashboard, admin/users/id = 7 routes
  expect(result.routes.length).toEqual(7);
  expect(result.errorBoundaries.length).toEqual(1);
  expect(result.statusPages.size).toEqual(1);
  expect(result.errorHandler?.modulePath).toEqual('routes/index.error.ts');
});

test('generator - real-world with all file types', async () => {
  const runtime = createMockRuntime([
    'routes/docs.page.html',
    'routes/docs.page.css',
    'routes/docs/index.page.md',
    'routes/docs/[slug].page.ts',
    'routes/docs/[slug].page.css',
    'routes/docs/[slug].error.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  // /docs (flat), /docs/:rest* (directory index), /docs/:slug (dynamic)
  expect(result.routes.length).toEqual(3);
  // The flat /docs route has the html file, but CSS is added separately
  const docsRoute = result.routes.find((r) => r.pattern === '/docs');
  expect(docsRoute?.files?.html).toEqual('routes/docs.page.html');
  expect(docsRoute?.files?.css).toEqual('routes/docs.page.css');
});

test('generator - deeply nested structure', async () => {
  const runtime = createMockRuntime([
    'routes/api/v1/users/[userId]/posts/[postId]/comments/[commentId].page.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(1);
  expect(result.routes[0].pattern).toEqual('/api/v1/users/:userId/posts/:postId/comments/:commentId');
  expect(result.routes[0].parent).toEqual('/api/v1/users/:userId/posts/:postId/comments');
});

// ============================================================================
// Edge Cases
// ============================================================================

test('generator - ignores non-route files', async () => {
  const runtime = createMockRuntime([
    'routes/README.md',
    'routes/utils.ts',
    'routes/.gitkeep',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes.length).toEqual(0);
});

test('generator - handles routes with hyphens', async () => {
  const runtime = createMockRuntime(['routes/my-route-name.page.md']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes[0].pattern).toEqual('/my-route-name');
});

test('generator - handles routes with numbers', async () => {
  const runtime = createMockRuntime(['routes/v2-api.page.ts']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes[0].pattern).toEqual('/v2-api');
});

// ============================================================================
// Manifest Integrity
// ============================================================================

test('generator - all routes have required fields', async () => {
  const runtime = createMockRuntime([
    'routes/index.page.ts',
    'routes/about.page.md',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  for (const route of result.routes) {
    expect(route.pattern).toBeDefined();
    expect(route.type).toBeDefined();
    expect(route.modulePath).toBeDefined();
  }
});

test('generator - all error boundaries have required fields', async () => {
  const runtime = createMockRuntime([
    'routes/api/[id].page.ts',
    'routes/api/[id].error.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  for (const boundary of result.errorBoundaries) {
    expect(boundary.pattern).toBeDefined();
    expect(boundary.modulePath).toBeDefined();
  }
});

test('generator - status pages keyed correctly', async () => {
  const runtime = createMockRuntime([
    'routes/404.page.html',
    'routes/401.page.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.statusPages.has(404)).toEqual(true);
  expect(result.statusPages.has(401)).toEqual(true);
  expect(result.statusPages.get(404)?.statusCode).toEqual(404);
  expect(result.statusPages.get(401)?.statusCode).toEqual(401);
});

// ============================================================================
// Route Type Consistency
// ============================================================================

test('generator - all regular routes have type page', async () => {
  const runtime = createMockRuntime([
    'routes/about.page.md',
    'routes/contact.page.html',
    'routes/dashboard.page.ts',
  ]);
  const result = await generateRoutesManifest('routes', runtime);

  for (const route of result.routes) {
    if (!route.modulePath.includes('404') && !route.modulePath.includes('401')) {
      expect(route.type).toEqual('page');
    }
  }
});

test('generator - redirect routes have type redirect', async () => {
  const runtime = createMockRuntime(['routes/old-page.redirect.ts']);
  const result = await generateRoutesManifest('routes', runtime);

  expect(result.routes[0].type).toEqual('redirect');
});
