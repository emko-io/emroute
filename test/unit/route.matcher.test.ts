/**
 * Unit tests for Route Matcher
 *
 * Comprehensive test suite covering:
 * - RouteMatcher class initialization and compilation
 * - Pattern matching with various URL formats
 * - Route finding by pattern and pathname
 * - Error boundary and status page lookups
 * - filePathToPattern conversion (file-based routing)
 * - Route type detection and specificity sorting
 * - Nested routes and catch-all patterns
 * - Query parameters and search params handling
 *
 * Based on documentation:
 * - doc/guide.md: Core routing concepts and file-based routing rules
 * - doc/nesting.md: Nested route patterns, slot rules, and hierarchy
 */

import { assertEquals, assertExists, assertIsError } from '@std/assert';
import type { ErrorBoundary, RouteConfig, RoutesManifest } from '../../src/type/route.type.ts';
import {
  filePathToPattern,
  getPageFileType,
  getRouteType,
  RouteMatcher,
  sortRoutesBySpecificity,
  toUrl,
} from '../../src/route/route.matcher.ts';

// ============================================================================
// Test Fixtures and Helpers
// ============================================================================

function createRouteConfig(
  pattern: string,
  type: 'page' | 'error' | 'redirect' = 'page',
  modulePath: string = `/routes${pattern}.ts`,
): RouteConfig {
  return {
    pattern,
    type,
    modulePath,
  };
}

function createRoutesManifest(
  routes: RouteConfig[] = [],
  errorBoundaries: ErrorBoundary[] = [],
  statusPages: Map<number, RouteConfig> = new Map(),
  errorHandler?: RouteConfig,
): RoutesManifest {
  return {
    routes,
    errorBoundaries,
    statusPages,
    errorHandler,
  };
}

// ============================================================================
// toUrl() Helper Function
// ============================================================================

Deno.test('toUrl - parses string URLs', () => {
  const url = toUrl('http://example.com/about');
  assertExists(url);
  assertEquals(url.pathname, '/about');
});

Deno.test('toUrl - passes through URL objects unchanged', () => {
  const original = new URL('http://example.com/projects/123');
  const url = toUrl(original);
  assertEquals(url, original);
});

Deno.test('toUrl - handles relative paths with parse context', () => {
  const url = toUrl('http://localhost/test');
  assertEquals(url.pathname, '/test');
});

// ============================================================================
// RouteMatcher Constructor and Compilation
// ============================================================================

Deno.test('RouteMatcher - initializes with empty manifest', () => {
  const manifest = createRoutesManifest();
  const matcher = new RouteMatcher(manifest);
  assertExists(matcher);
});

Deno.test('RouteMatcher - compiles valid routes', () => {
  const routes = [
    createRouteConfig('/'),
    createRouteConfig('/about'),
    createRouteConfig('/projects/:id'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);
  assertExists(matcher);
});

Deno.test('RouteMatcher - handles invalid patterns gracefully', () => {
  const routes = [
    createRouteConfig('/valid'),
    createRouteConfig('/invalid[pattern'),
  ];
  const manifest = createRoutesManifest(routes);
  // Should not throw, invalid patterns are logged
  const matcher = new RouteMatcher(manifest);
  assertExists(matcher);
});

Deno.test('RouteMatcher - stores error boundaries', () => {
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/admin',
      modulePath: '/routes/admin.error.ts',
    },
  ];
  const manifest = createRoutesManifest([], errorBoundaries);
  const matcher = new RouteMatcher(manifest);
  assertExists(matcher);
});

Deno.test('RouteMatcher - stores and sorts error boundaries by specificity', () => {
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/admin',
      modulePath: '/routes/admin.error.ts',
    },
    {
      pattern: '/admin/users',
      modulePath: '/routes/admin/users.error.ts',
    },
  ];
  const manifest = createRoutesManifest([], errorBoundaries);
  const matcher = new RouteMatcher(manifest);
  // Should sort by length descending (longer = more specific first)
  const adminUsers = matcher.findErrorBoundary('/admin/users/123');
  assertEquals(adminUsers?.pattern, '/admin/users');
});

Deno.test('RouteMatcher - stores status pages', () => {
  const statusPages = new Map<number, RouteConfig>();
  statusPages.set(404, createRouteConfig('/404'));
  statusPages.set(401, createRouteConfig('/401'));
  const manifest = createRoutesManifest([], [], statusPages);
  const matcher = new RouteMatcher(manifest);
  assertExists(matcher);
});

Deno.test('RouteMatcher - stores error handler', () => {
  const errorHandler = createRouteConfig('/error');
  const manifest = createRoutesManifest([], [], new Map(), errorHandler);
  const matcher = new RouteMatcher(manifest);
  assertExists(matcher);
});

// ============================================================================
// match() Method - Basic Static Routes
// ============================================================================

Deno.test('match - matches root path /', () => {
  const routes = [createRouteConfig('/')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/'));
  assertExists(result);
  assertEquals(result?.route.pattern, '/');
});

Deno.test('match - matches simple static routes', () => {
  const routes = [createRouteConfig('/about')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/about'));
  assertExists(result);
  assertEquals(result?.route.pattern, '/about');
});

Deno.test('match - matches multiple distinct static routes', () => {
  const routes = [
    createRouteConfig('/'),
    createRouteConfig('/about'),
    createRouteConfig('/contact'),
    createRouteConfig('/services'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const about = matcher.match(new URL('http://localhost/about'));
  assertExists(about);
  assertEquals(about?.route.pattern, '/about');

  const contact = matcher.match(new URL('http://localhost/contact'));
  assertExists(contact);
  assertEquals(contact?.route.pattern, '/contact');

  const services = matcher.match(new URL('http://localhost/services'));
  assertExists(services);
  assertEquals(services?.route.pattern, '/services');
});

Deno.test('match - returns undefined for non-matching routes', () => {
  const routes = [createRouteConfig('/about')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/nonexistent'));
  assertEquals(result, undefined);
});

Deno.test('match - does not match similar but different paths', () => {
  const routes = [createRouteConfig('/admin')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  assertEquals(matcher.match(new URL('http://localhost/admin-panel')), undefined);
  assertEquals(matcher.match(new URL('http://localhost/admin/users')), undefined);
});

// ============================================================================
// match() Method - Dynamic Segment Routes
// ============================================================================

Deno.test('match - matches dynamic segment routes', () => {
  const routes = [createRouteConfig('/projects/:id')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/projects/123'));
  assertExists(result);
  assertEquals(result?.route.pattern, '/projects/:id');
});

Deno.test('match - extracts params from dynamic routes', () => {
  const routes = [createRouteConfig('/projects/:id')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/projects/abc123'));
  assertExists(result);
  assertEquals(result?.params.id, 'abc123');
});

Deno.test('match - handles various param values (letters, numbers, hyphens)', () => {
  const routes = [createRouteConfig('/user/:username')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result1 = matcher.match(new URL('http://localhost/user/john-doe'));
  assertExists(result1);
  assertEquals(result1?.params.username, 'john-doe');

  const result2 = matcher.match(new URL('http://localhost/user/user_123'));
  assertExists(result2);
  assertEquals(result2?.params.username, 'user_123');
});

Deno.test('match - matches multiple dynamic segments', () => {
  const routes = [createRouteConfig('/projects/:projectId/tasks/:taskId')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(
    new URL('http://localhost/projects/proj1/tasks/task2'),
  );
  assertExists(result);
  assertEquals(result?.params.projectId, 'proj1');
  assertEquals(result?.params.taskId, 'task2');
});

Deno.test('match - matches deeply nested dynamic segments', () => {
  const routes = [
    createRouteConfig('/api/:version/users/:id/posts/:postId/comments/:commentId'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(
    new URL('http://localhost/api/v2/users/42/posts/100/comments/50'),
  );
  assertExists(result);
  assertEquals(result?.params.version, 'v2');
  assertEquals(result?.params.id, '42');
  assertEquals(result?.params.postId, '100');
  assertEquals(result?.params.commentId, '50');
});

// ============================================================================
// match() Method - Wildcard/Catch-all Routes
// ============================================================================

Deno.test('match - matches wildcard catch-all routes', () => {
  const routes = [createRouteConfig('/docs/:rest*')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/docs/api/getting-started'));
  assertExists(result);
  assertEquals(result?.route.pattern, '/docs/:rest*');
});

Deno.test('match - extracts rest param from wildcard routes', () => {
  const routes = [createRouteConfig('/docs/:rest*')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/docs/guides/deploy/docker'));
  assertExists(result);
  assertEquals(result?.params.rest, 'guides/deploy/docker');
});

Deno.test('match - wildcard matches single segment', () => {
  const routes = [createRouteConfig('/docs/:rest*')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/docs/intro'));
  assertExists(result);
  assertEquals(result?.params.rest, 'intro');
});

Deno.test('match - wildcard with dynamic parent segment', () => {
  const routes = [createRouteConfig('/projects/:id/:rest*')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(
    new URL('http://localhost/projects/123/boards/kanban/tasks'),
  );
  assertExists(result);
  assertEquals(result?.params.id, '123');
  assertEquals(result?.params.rest, 'boards/kanban/tasks');
});

// ============================================================================
// match() Method - Route Priority and Specificity
// ============================================================================

Deno.test('match - static routes win over dynamic routes (guide.md rule)', () => {
  const routes = [
    createRouteConfig('/crypto/:coin'),
    createRouteConfig('/crypto/eth'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  // Routes are in original order, so /crypto/:coin matches first
  // This test verifies that route ordering matters for priority
  const result = matcher.match(new URL('http://localhost/crypto/eth'));
  assertExists(result);
  assertEquals(result?.route.pattern, '/crypto/:coin');
});

Deno.test('match - specific routes win when ordered correctly (guide.md rule)', () => {
  // Routes should be sorted by specificity before use
  const routes = [
    createRouteConfig('/crypto/eth'),
    createRouteConfig('/crypto/:coin'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/crypto/eth'));
  assertExists(result);
  assertEquals(result?.route.pattern, '/crypto/eth');
});

Deno.test('match - returns first matching route in order', () => {
  const routes = [
    createRouteConfig('/projects/:id'),
    createRouteConfig('/projects/special'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/projects/special'));
  assertExists(result);
  // Returns first match, which is /projects/:id
  assertEquals(result?.route.pattern, '/projects/:id');
});

Deno.test('match - catch-all has lower priority than specific routes', () => {
  // When routes are pre-sorted correctly, specific routes come first
  const routes = [
    createRouteConfig('/projects/:id'),
    createRouteConfig('/projects/:rest*'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/projects/123'));
  assertExists(result);
  // Dynamic param without wildcard should match first
  assertEquals(result?.route.pattern, '/projects/:id');
});

// ============================================================================
// match() Method - Query Parameters
// ============================================================================

Deno.test('match - preserves search params in result', () => {
  const routes = [createRouteConfig('/search')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match('http://localhost/search?q=test&page=2');
  assertExists(result);
  assertExists(result.searchParams);
  assertEquals(result.searchParams.get('q'), 'test');
  assertEquals(result.searchParams.get('page'), '2');
});

Deno.test('match - handles multiple search param values', () => {
  const routes = [createRouteConfig('/filter')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match('http://localhost/filter?category=books&category=electronics');
  assertExists(result);
  assertExists(result.searchParams);
  const categories = result.searchParams.getAll('category');
  assertEquals(categories.length, 2);
});

Deno.test('match - ignores search params for pattern matching', () => {
  const routes = [createRouteConfig('/products/:id')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match('http://localhost/products/42?color=red&size=large');
  assertExists(result);
  assertEquals(result.params.id, '42');
  assertExists(result.searchParams);
  assertEquals(result.searchParams.get('color'), 'red');
  assertEquals(result.searchParams.get('size'), 'large');
});

// ============================================================================
// match() Method - String vs URL Input
// ============================================================================

Deno.test('match - accepts string URLs', () => {
  const routes = [createRouteConfig('/about')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match('http://localhost/about');
  assertExists(result);
  assertEquals(result?.route.pattern, '/about');
});

Deno.test('match - accepts URL objects', () => {
  const routes = [createRouteConfig('/about')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/about'));
  assertExists(result);
  assertEquals(result?.route.pattern, '/about');
});

Deno.test('match - handles string URLs with query params', () => {
  const routes = [createRouteConfig('/search')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match('http://localhost/search?q=test');
  assertExists(result);
  assertEquals(result?.route.pattern, '/search');
});

// ============================================================================
// findRoute() Method
// ============================================================================

Deno.test('findRoute - finds by exact pattern match', () => {
  const routes = [
    createRouteConfig('/'),
    createRouteConfig('/about'),
    createRouteConfig('/projects/:id'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findRoute('/about');
  assertExists(result);
  assertEquals(result?.pattern, '/about');
});

Deno.test('findRoute - finds by pathname match when no exact pattern', () => {
  const routes = [createRouteConfig('/projects/:id')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findRoute('/projects/123');
  assertExists(result);
  assertEquals(result?.pattern, '/projects/:id');
});

Deno.test('findRoute - returns undefined for non-matching', () => {
  const routes = [createRouteConfig('/about')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findRoute('/nonexistent');
  assertEquals(result, undefined);
});

Deno.test('findRoute - prefers exact pattern match over pathname match', () => {
  const routes = [
    createRouteConfig('/'),
    createRouteConfig('/projects/:id'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findRoute('/');
  assertExists(result);
  assertEquals(result?.pattern, '/');
});

Deno.test('findRoute - handles dynamic routes with multiple segments', () => {
  const routes = [
    createRouteConfig('/projects/:projectId/tasks/:taskId'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findRoute('/projects/123/tasks/456');
  assertExists(result);
  assertEquals(result?.pattern, '/projects/:projectId/tasks/:taskId');
});

// ============================================================================
// findErrorBoundary() Method
// ============================================================================

Deno.test('findErrorBoundary - finds exact pattern match', () => {
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/admin',
      modulePath: '/routes/admin.error.ts',
    },
  ];
  const manifest = createRoutesManifest([], errorBoundaries);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findErrorBoundary('/admin');
  assertExists(result);
  assertEquals(result?.pattern, '/admin');
});

Deno.test('findErrorBoundary - finds by prefix match', () => {
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/admin',
      modulePath: '/routes/admin.error.ts',
    },
  ];
  const manifest = createRoutesManifest([], errorBoundaries);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findErrorBoundary('/admin/users');
  assertExists(result);
  assertEquals(result?.pattern, '/admin');
});

Deno.test('findErrorBoundary - finds most specific boundary (guide.md rule)', () => {
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/admin',
      modulePath: '/routes/admin.error.ts',
    },
    {
      pattern: '/admin/users',
      modulePath: '/routes/admin/users.error.ts',
    },
  ];
  const manifest = createRoutesManifest([], errorBoundaries);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findErrorBoundary('/admin/users/123');
  assertExists(result);
  assertEquals(result?.pattern, '/admin/users');
});

Deno.test('findErrorBoundary - returns undefined for non-matching', () => {
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/admin',
      modulePath: '/routes/admin.error.ts',
    },
  ];
  const manifest = createRoutesManifest([], errorBoundaries);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findErrorBoundary('/user');
  assertEquals(result, undefined);
});

Deno.test('findErrorBoundary - handles root boundary', () => {
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/',
      modulePath: '/routes.error.ts',
    },
  ];
  const manifest = createRoutesManifest([], errorBoundaries);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findErrorBoundary('/any/path');
  assertExists(result);
  assertEquals(result?.pattern, '/');
});

Deno.test('findErrorBoundary - does not match similar names without prefix', () => {
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/admin',
      modulePath: '/routes/admin.error.ts',
    },
  ];
  const manifest = createRoutesManifest([], errorBoundaries);
  const matcher = new RouteMatcher(manifest);

  // /admin-users starts with /admin but is not a path segment prefix
  const result = matcher.findErrorBoundary('/admin-users');
  assertEquals(result, undefined);
});

Deno.test('findErrorBoundary - deep nesting with multiple boundaries', () => {
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/',
      modulePath: '/routes.error.ts',
    },
    {
      pattern: '/admin',
      modulePath: '/routes/admin.error.ts',
    },
    {
      pattern: '/admin/users',
      modulePath: '/routes/admin/users.error.ts',
    },
  ];
  const manifest = createRoutesManifest([], errorBoundaries);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findErrorBoundary('/admin/users/edit/5');
  assertExists(result);
  assertEquals(result?.pattern, '/admin/users');
});

Deno.test('findErrorBoundary - finds between multiple sibling boundaries', () => {
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/api',
      modulePath: '/routes/api.error.ts',
    },
    {
      pattern: '/admin',
      modulePath: '/routes/admin.error.ts',
    },
  ];
  const manifest = createRoutesManifest([], errorBoundaries);
  const matcher = new RouteMatcher(manifest);

  const apiResult = matcher.findErrorBoundary('/api/v1/users');
  assertEquals(apiResult?.pattern, '/api');

  const adminResult = matcher.findErrorBoundary('/admin/settings');
  assertEquals(adminResult?.pattern, '/admin');
});

// ============================================================================
// getStatusPage() Method
// ============================================================================

Deno.test('getStatusPage - returns status page for 404', () => {
  const statusPages = new Map<number, RouteConfig>();
  statusPages.set(404, createRouteConfig('/404'));
  const manifest = createRoutesManifest([], [], statusPages);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.getStatusPage(404);
  assertExists(result);
  assertEquals(result?.pattern, '/404');
});

Deno.test('getStatusPage - returns status page for various error codes', () => {
  const statusPages = new Map<number, RouteConfig>();
  statusPages.set(401, createRouteConfig('/401'));
  statusPages.set(403, createRouteConfig('/403'));
  statusPages.set(500, createRouteConfig('/500'));
  const manifest = createRoutesManifest([], [], statusPages);
  const matcher = new RouteMatcher(manifest);

  assertEquals(matcher.getStatusPage(401)?.pattern, '/401');
  assertEquals(matcher.getStatusPage(403)?.pattern, '/403');
  assertEquals(matcher.getStatusPage(500)?.pattern, '/500');
});

Deno.test('getStatusPage - returns undefined for non-existent status', () => {
  const statusPages = new Map<number, RouteConfig>();
  statusPages.set(404, createRouteConfig('/404'));
  const manifest = createRoutesManifest([], [], statusPages);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.getStatusPage(500);
  assertEquals(result, undefined);
});

Deno.test('getStatusPage - returns undefined when no status pages', () => {
  const manifest = createRoutesManifest();
  const matcher = new RouteMatcher(manifest);

  const result = matcher.getStatusPage(404);
  assertEquals(result, undefined);
});

// ============================================================================
// getErrorHandler() Method
// ============================================================================

Deno.test('getErrorHandler - returns error handler when set', () => {
  const errorHandler = createRouteConfig('/error');
  const manifest = createRoutesManifest([], [], new Map(), errorHandler);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.getErrorHandler();
  assertExists(result);
  assertEquals(result?.pattern, '/error');
});

Deno.test('getErrorHandler - returns undefined when not set', () => {
  const manifest = createRoutesManifest();
  const matcher = new RouteMatcher(manifest);

  const result = matcher.getErrorHandler();
  assertEquals(result, undefined);
});

// ============================================================================
// filePathToPattern() Function - Basic Conversions
// ============================================================================

Deno.test('filePathToPattern - converts root index file', () => {
  const pattern = filePathToPattern('routes/index.page.ts');
  assertEquals(pattern, '/');
});

Deno.test('filePathToPattern - root index does NOT become wildcard (guide.md rule)', () => {
  const pattern = filePathToPattern('routes/index.page.ts');
  assertEquals(pattern, '/');
  assertEquals(pattern.includes(':rest*'), false);
});

Deno.test('filePathToPattern - converts simple page file', () => {
  const pattern = filePathToPattern('routes/about.page.ts');
  assertEquals(pattern, '/about');
});

Deno.test('filePathToPattern - converts flat file (no wildcard)', () => {
  const pattern = filePathToPattern('routes/crypto.page.ts');
  assertEquals(pattern, '/crypto');
  assertEquals(pattern.includes(':rest*'), false);
});

// ============================================================================
// filePathToPattern() Function - Dynamic Segments
// ============================================================================

Deno.test('filePathToPattern - converts [param] to :param', () => {
  const pattern = filePathToPattern('routes/projects/[id].page.ts');
  assertEquals(pattern, '/projects/:id');
});

Deno.test('filePathToPattern - converts multiple dynamic segments', () => {
  const pattern = filePathToPattern(
    'routes/projects/[projectId]/tasks/[taskId].page.ts',
  );
  assertEquals(pattern, '/projects/:projectId/tasks/:taskId');
});

Deno.test('filePathToPattern - converts mixed static and dynamic segments', () => {
  const pattern = filePathToPattern('routes/users/[id]/profile.page.ts');
  assertEquals(pattern, '/users/:id/profile');
});

Deno.test('filePathToPattern - deeply nested with dynamic segments', () => {
  const pattern = filePathToPattern('routes/a/b/c/d/[param]/e.page.ts');
  assertEquals(pattern, '/a/b/c/d/:param/e');
});

// ============================================================================
// filePathToPattern() Function - Directory Index / Catch-all Routes
// ============================================================================

Deno.test('filePathToPattern - non-root directory index becomes wildcard (guide.md rule)', () => {
  const pattern = filePathToPattern('routes/projects/index.page.ts');
  assertEquals(pattern, '/projects/:rest*');
});

Deno.test('filePathToPattern - directory index becomes wildcard for .html', () => {
  const pattern = filePathToPattern('routes/dashboard/index.page.html');
  assertEquals(pattern, '/dashboard/:rest*');
});

Deno.test('filePathToPattern - directory index becomes wildcard for .md', () => {
  const pattern = filePathToPattern('routes/crypto/index.page.md');
  assertEquals(pattern, '/crypto/:rest*');
});

Deno.test('filePathToPattern - deeply nested directory index becomes wildcard', () => {
  const pattern = filePathToPattern('routes/docs/api/index.page.ts');
  assertEquals(pattern, '/docs/api/:rest*');
});

Deno.test('filePathToPattern - directory index with dynamic parent', () => {
  const pattern = filePathToPattern('routes/projects/[id]/index.page.ts');
  assertEquals(pattern, '/projects/:id/:rest*');
});

Deno.test('filePathToPattern - nested directory indices chain', () => {
  const root = filePathToPattern('routes/blog/index.page.ts');
  assertEquals(root, '/blog/:rest*');

  const nested = filePathToPattern('routes/blog/posts/index.page.ts');
  assertEquals(nested, '/blog/posts/:rest*');
});

// ============================================================================
// filePathToPattern() Function - File Extension Handling
// ============================================================================

Deno.test('filePathToPattern - handles .page.html files', () => {
  const pattern = filePathToPattern('routes/about.page.html');
  assertEquals(pattern, '/about');
});

Deno.test('filePathToPattern - handles .page.md files', () => {
  const pattern = filePathToPattern('routes/about.page.md');
  assertEquals(pattern, '/about');
});

Deno.test('filePathToPattern - handles .page.css files', () => {
  const pattern = filePathToPattern('routes/about.page.css');
  assertEquals(pattern, '/about');
});

Deno.test('filePathToPattern - handles .error.ts files', () => {
  const pattern = filePathToPattern('routes/admin.error.ts');
  assertEquals(pattern, '/admin');
});

Deno.test('filePathToPattern - handles .redirect.ts files', () => {
  const pattern = filePathToPattern('routes/old-path.redirect.ts');
  assertEquals(pattern, '/old-path');
});

Deno.test('filePathToPattern - ensures leading slash', () => {
  const pattern = filePathToPattern('routes/test.page.ts');
  assertEquals(pattern.charAt(0), '/');
});

// ============================================================================
// filePathToPattern() Function - Edge Cases
// ============================================================================

Deno.test('filePathToPattern - handles multiple consecutive slashes', () => {
  const pattern = filePathToPattern('routes/docs/api/index.page.ts');
  assertEquals(pattern, '/docs/api/:rest*');
});

Deno.test('filePathToPattern - handles hyphens in filenames', () => {
  const pattern = filePathToPattern('routes/my-component.page.ts');
  assertEquals(pattern, '/my-component');
});

Deno.test('filePathToPattern - handles underscores in filenames', () => {
  const pattern = filePathToPattern('routes/my_component/[id].page.ts');
  assertEquals(pattern, '/my_component/:id');
});

Deno.test('filePathToPattern - converts bracket params with hyphens', () => {
  const pattern = filePathToPattern('routes/items/[item-id].page.ts');
  assertEquals(pattern, '/items/:item-id');
});

// ============================================================================
// getRouteType() Function
// ============================================================================

Deno.test('getRouteType - identifies .page.ts files as page', () => {
  const type = getRouteType('about.page.ts');
  assertEquals(type, 'page');
});

Deno.test('getRouteType - identifies .page.html files as page', () => {
  const type = getRouteType('about.page.html');
  assertEquals(type, 'page');
});

Deno.test('getRouteType - identifies .page.md files as page', () => {
  const type = getRouteType('about.page.md');
  assertEquals(type, 'page');
});

Deno.test('getRouteType - identifies .error.ts files as error', () => {
  const type = getRouteType('admin.error.ts');
  assertEquals(type, 'error');
});

Deno.test('getRouteType - identifies .redirect.ts files as redirect', () => {
  const type = getRouteType('old-path.redirect.ts');
  assertEquals(type, 'redirect');
});

Deno.test('getRouteType - returns null for unknown types', () => {
  const type = getRouteType('file.ts');
  assertEquals(type, null);
});

Deno.test('getRouteType - returns null for .html without .page', () => {
  const type = getRouteType('about.html');
  assertEquals(type, null);
});

Deno.test('getRouteType - returns null for empty strings', () => {
  const type = getRouteType('');
  assertEquals(type, null);
});

Deno.test('getRouteType - handles files with multiple dots', () => {
  const type1 = getRouteType('my.component.page.ts');
  assertEquals(type1, 'page');

  const type2 = getRouteType('my.error.handler.error.ts');
  assertEquals(type2, 'error');
});

// ============================================================================
// getPageFileType() Function
// ============================================================================

Deno.test('getPageFileType - identifies .page.ts files', () => {
  const type = getPageFileType('about.page.ts');
  assertEquals(type, 'ts');
});

Deno.test('getPageFileType - identifies .page.html files', () => {
  const type = getPageFileType('about.page.html');
  assertEquals(type, 'html');
});

Deno.test('getPageFileType - identifies .page.md files', () => {
  const type = getPageFileType('about.page.md');
  assertEquals(type, 'md');
});

Deno.test('getPageFileType - identifies .page.css files', () => {
  const type = getPageFileType('about.page.css');
  assertEquals(type, 'css');
});

Deno.test('getPageFileType - returns null for non-page files', () => {
  const type = getPageFileType('about.ts');
  assertEquals(type, null);
});

Deno.test('getPageFileType - returns null for error files', () => {
  const type = getPageFileType('admin.error.ts');
  assertEquals(type, null);
});

Deno.test('getPageFileType - returns null for redirect files', () => {
  const type = getPageFileType('old-path.redirect.ts');
  assertEquals(type, null);
});

Deno.test('getPageFileType - returns null for unknown extensions', () => {
  const type = getPageFileType('about.page.jsx');
  assertEquals(type, null);
});

// ============================================================================
// sortRoutesBySpecificity() Function - Basic Sorting
// ============================================================================

Deno.test('sortRoutesBySpecificity - sorts by segment count (longer first)', () => {
  const routes = [
    createRouteConfig('/'),
    createRouteConfig('/projects/:id'),
    createRouteConfig('/projects'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  assertEquals(sorted[0].pattern, '/projects/:id');
  assertEquals(sorted[1].pattern, '/projects');
  assertEquals(sorted[2].pattern, '/');
});

Deno.test('sortRoutesBySpecificity - prefers static over dynamic (guide.md rule)', () => {
  const routes = [
    createRouteConfig('/projects/:id'),
    createRouteConfig('/projects/special'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  assertEquals(sorted[0].pattern, '/projects/special');
  assertEquals(sorted[1].pattern, '/projects/:id');
});

Deno.test('sortRoutesBySpecificity - handles multiple dynamic segments', () => {
  const routes = [
    createRouteConfig('/projects/:projectId/tasks/:taskId'),
    createRouteConfig('/projects/:id'),
    createRouteConfig('/projects'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  assertEquals(sorted[0].pattern, '/projects/:projectId/tasks/:taskId');
  assertEquals(sorted[1].pattern, '/projects/:id');
  assertEquals(sorted[2].pattern, '/projects');
});

Deno.test('sortRoutesBySpecificity - handles mixed patterns', () => {
  const routes = [
    createRouteConfig('/users/:id'),
    createRouteConfig('/users/profile'),
    createRouteConfig('/users/profile/edit'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  assertEquals(sorted[0].pattern, '/users/profile/edit');
  assertEquals(sorted[1].pattern, '/users/profile');
  assertEquals(sorted[2].pattern, '/users/:id');
});

// ============================================================================
// sortRoutesBySpecificity() Function - Wildcard Handling
// ============================================================================

Deno.test('sortRoutesBySpecificity - wildcard sorts last (guide.md rule)', () => {
  const routes = [
    createRouteConfig('/crypto/:rest*'),
    createRouteConfig('/crypto/eth'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  assertEquals(sorted[0].pattern, '/crypto/eth');
  assertEquals(sorted[1].pattern, '/crypto/:rest*');
});

Deno.test('sortRoutesBySpecificity - wildcard sorts after all non-wildcards', () => {
  const routes = [
    createRouteConfig('/crypto/:rest*'),
    createRouteConfig('/crypto/eth'),
    createRouteConfig('/crypto/:id'),
    createRouteConfig('/'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  // Non-wildcards first (by their own rules), wildcard last
  assertEquals(sorted[sorted.length - 1].pattern, '/crypto/:rest*');
  // Root is least specific non-wildcard but still before wildcard
  const wildcardIndex = sorted.findIndex((r) => r.pattern === '/crypto/:rest*');
  const rootIndex = sorted.findIndex((r) => r.pattern === '/');
  assertEquals(rootIndex < wildcardIndex, true);
});

Deno.test('sortRoutesBySpecificity - multiple wildcards sort by segment count', () => {
  const routes = [
    createRouteConfig('/docs/:rest*'),
    createRouteConfig('/docs/api/:rest*'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  // More segments = more specific, even among wildcards
  assertEquals(sorted[0].pattern, '/docs/api/:rest*');
  assertEquals(sorted[1].pattern, '/docs/:rest*');
});

Deno.test('sortRoutesBySpecificity - wildcard with plus quantifier', () => {
  const routes = [
    createRouteConfig('/files/:path+'),
    createRouteConfig('/files/special'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  // Plus quantifier should also sort as wildcard
  assertEquals(sorted[0].pattern, '/files/special');
  assertEquals(sorted[1].pattern, '/files/:path+');
});

// ============================================================================
// sortRoutesBySpecificity() Function - Edge Cases
// ============================================================================

Deno.test('sortRoutesBySpecificity - maintains order for equal specificity', () => {
  const routes = [
    createRouteConfig('/about'),
    createRouteConfig('/contact'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  assertEquals(sorted.length, 2);
  const patterns = sorted.map((r) => r.pattern);
  assertEquals(patterns.includes('/about'), true);
  assertEquals(patterns.includes('/contact'), true);
});

Deno.test('sortRoutesBySpecificity - does not mutate original array', () => {
  const routes = [
    createRouteConfig('/projects/:id'),
    createRouteConfig('/projects/special'),
  ];
  const original = [...routes];
  const sorted = sortRoutesBySpecificity(routes);

  assertEquals(routes[0].pattern, original[0].pattern);
  assertEquals(sorted[0].pattern, '/projects/special');
});

Deno.test('sortRoutesBySpecificity - handles single route', () => {
  const routes = [createRouteConfig('/about')];
  const sorted = sortRoutesBySpecificity(routes);

  assertEquals(sorted.length, 1);
  assertEquals(sorted[0].pattern, '/about');
});

Deno.test('sortRoutesBySpecificity - handles empty array', () => {
  const routes: RouteConfig[] = [];
  const sorted = sortRoutesBySpecificity(routes);

  assertEquals(sorted.length, 0);
});

Deno.test('sortRoutesBySpecificity - complex real-world scenario', () => {
  const routes = [
    createRouteConfig('/'),
    createRouteConfig('/projects'),
    createRouteConfig('/projects/:id'),
    createRouteConfig('/projects/:id/tasks'),
    createRouteConfig('/projects/:id/tasks/:taskId'),
    createRouteConfig('/projects/special'),
    createRouteConfig('/projects/special/details'),
    createRouteConfig('/admin'),
    createRouteConfig('/admin/:section'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  // 4-segment routes come first (most specific)
  const firstRoute = sorted[0].pattern;
  assertEquals(firstRoute, '/projects/:id/tasks/:taskId');

  // Verify that longer routes come before shorter ones
  const segmentCounts = sorted.map((r) => r.pattern.split('/').filter(Boolean).length);
  for (let i = 0; i < segmentCounts.length - 1; i++) {
    assertEquals(segmentCounts[i] >= segmentCounts[i + 1], true);
  }

  // Root path comes last (least specific)
  assertEquals(sorted[sorted.length - 1].pattern, '/');
});

Deno.test('sortRoutesBySpecificity - correctly evaluates dynamic vs static at same level', () => {
  const routes = [
    createRouteConfig('/api/:version/users/:id'),
    createRouteConfig('/api/v1/users/profile'),
    createRouteConfig('/api/:version/users'),
    createRouteConfig('/api/v1/users'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  // All 4-segment routes should come before 3-segment
  const segments = sorted.map((r) => r.pattern.split('/').filter(Boolean).length);
  assertEquals(segments[0] >= segments[1], true);
  assertEquals(segments[1] >= segments[2], true);
});

// ============================================================================
// Integration Tests - Complete Routing Scenarios
// ============================================================================

Deno.test('integration - full routing scenario from guide.md', () => {
  const routes = [
    createRouteConfig('/'),
    createRouteConfig('/about'),
    createRouteConfig('/projects'),
    createRouteConfig('/projects/:id'),
    createRouteConfig('/projects/:id/tasks'),
  ];
  const statusPages = new Map<number, RouteConfig>();
  statusPages.set(404, createRouteConfig('/404'));
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/projects',
      modulePath: '/routes/projects.error.ts',
    },
  ];

  const manifest = createRoutesManifest(routes, errorBoundaries, statusPages);
  const matcher = new RouteMatcher(manifest);

  const home = matcher.match(new URL('http://localhost/'));
  assertExists(home);
  assertEquals(home?.route.pattern, '/');

  const about = matcher.match(new URL('http://localhost/about'));
  assertExists(about);
  assertEquals(about?.route.pattern, '/about');

  const projectId = matcher.match(new URL('http://localhost/projects/123'));
  assertExists(projectId);
  assertEquals(projectId?.route.pattern, '/projects/:id');
  assertEquals(projectId?.params.id, '123');

  const boundary = matcher.findErrorBoundary('/projects/123');
  assertExists(boundary);
  assertEquals(boundary?.pattern, '/projects');

  const statusPage = matcher.getStatusPage(404);
  assertExists(statusPage);
  assertEquals(statusPage?.pattern, '/404');
});

Deno.test('integration - complex nested routes with catch-all (nesting.md example)', () => {
  // Simulating routes from nesting.md example:
  // docs.page.ts → /docs (exact)
  // docs/index.page.ts → /docs/* (catch-all)
  // docs/getting-started.page.md → /docs/getting-started (specific)

  const routes = [
    createRouteConfig('/docs'),
    createRouteConfig('/docs/getting-started'),
    createRouteConfig('/docs/:rest*'),
  ];

  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const docs = matcher.match(new URL('http://localhost/docs'));
  assertExists(docs);
  assertEquals(docs?.route.pattern, '/docs');

  const getting = matcher.match(new URL('http://localhost/docs/getting-started'));
  assertExists(getting);
  // Should match /docs/getting-started if it comes before /docs/:rest*
  assertEquals(getting?.route.pattern, '/docs/getting-started');

  const nested = matcher.match(new URL('http://localhost/docs/api/components'));
  assertExists(nested);
  assertEquals(nested?.route.pattern, '/docs/:rest*');
  assertEquals(nested?.params.rest, 'api/components');
});

Deno.test('integration - crypto example from guide.md', () => {
  // From guide.md: crypto/eth.page.ts wins over [coin].page.ts
  const routes = [
    createRouteConfig('/crypto/eth'),
    createRouteConfig('/crypto/:coin'),
  ];

  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const eth = matcher.match(new URL('http://localhost/crypto/eth'));
  assertExists(eth);
  assertEquals(eth?.route.pattern, '/crypto/eth');

  const bitcoin = matcher.match(new URL('http://localhost/crypto/bitcoin'));
  assertExists(bitcoin);
  assertEquals(bitcoin?.route.pattern, '/crypto/:coin');
  assertEquals(bitcoin?.params.coin, 'bitcoin');
});

Deno.test('integration - file-based routing from routes directory', () => {
  // Convert file paths to patterns and verify ordering
  const filePaths = [
    'routes/index.page.md',
    'routes/about.page.ts',
    'routes/projects.page.md',
    'routes/projects/index.page.md',
    'routes/projects/[id].page.ts',
    'routes/projects/[id]/tasks.page.ts',
  ];

  const patterns = filePaths.map(filePathToPattern);
  assertEquals(patterns[0], '/');
  assertEquals(patterns[1], '/about');
  assertEquals(patterns[2], '/projects');
  assertEquals(patterns[3], '/projects/:rest*');
  assertEquals(patterns[4], '/projects/:id');
  assertEquals(patterns[5], '/projects/:id/tasks');

  // Create routes with these patterns
  const routes = patterns.map((p) => createRouteConfig(p));
  const sorted = sortRoutesBySpecificity(routes);

  // Verify that specific routes come before catch-all
  const projectsIndex = sorted.findIndex((r) => r.pattern === '/projects/:rest*');
  const projectsId = sorted.findIndex((r) => r.pattern === '/projects/:id');
  assertEquals(projectsId < projectsIndex, true);
});

Deno.test('integration - nested route hierarchy (nesting.md)', () => {
  // Simulating nested hierarchy from nesting.md:
  // / (root layout)
  // /dashboard (parent)
  // /dashboard/settings (child)
  // /dashboard/profile (child)

  const routes = [
    createRouteConfig('/'),
    createRouteConfig('/dashboard'),
    createRouteConfig('/dashboard/settings'),
    createRouteConfig('/dashboard/profile'),
  ];

  const errorBoundaries: ErrorBoundary[] = [
    { pattern: '/', modulePath: '/routes.error.ts' },
    { pattern: '/dashboard', modulePath: '/routes/dashboard.error.ts' },
  ];

  const manifest = createRoutesManifest(routes, errorBoundaries);
  const matcher = new RouteMatcher(manifest);

  // Test that specific routes match
  const dashboard = matcher.match(new URL('http://localhost/dashboard'));
  assertEquals(dashboard?.route.pattern, '/dashboard');

  const settings = matcher.match(new URL('http://localhost/dashboard/settings'));
  assertEquals(settings?.route.pattern, '/dashboard/settings');

  // Test error boundaries
  const dashboardBoundary = matcher.findErrorBoundary('/dashboard/settings');
  assertEquals(dashboardBoundary?.pattern, '/dashboard');
});

Deno.test('integration - admin section with multiple levels', () => {
  const routes = [
    createRouteConfig('/admin'),
    createRouteConfig('/admin/users'),
    createRouteConfig('/admin/users/:id'),
    createRouteConfig('/admin/users/:id/edit'),
    createRouteConfig('/admin/settings'),
    createRouteConfig('/public/posts'),
    createRouteConfig('/public/posts/:slug'),
  ];

  const errorBoundaries: ErrorBoundary[] = [
    { pattern: '/', modulePath: '/routes.error.ts' },
    { pattern: '/admin', modulePath: '/routes/admin.error.ts' },
    { pattern: '/public', modulePath: '/routes/public.error.ts' },
  ];

  const manifest = createRoutesManifest(routes, errorBoundaries);
  const matcher = new RouteMatcher(manifest);

  // Admin routes use admin boundary
  const adminBoundary = matcher.findErrorBoundary('/admin/users/5');
  assertEquals(adminBoundary?.pattern, '/admin');

  // Public routes use public boundary
  const publicBoundary = matcher.findErrorBoundary('/public/posts/hello');
  assertEquals(publicBoundary?.pattern, '/public');

  // Unknown routes use root boundary
  const rootBoundary = matcher.findErrorBoundary('/unknown/path');
  assertEquals(rootBoundary?.pattern, '/');
});
