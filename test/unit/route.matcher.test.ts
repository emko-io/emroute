/**
 * Unit tests for Route Matcher
 *
 * Tests cover:
 * - RouteMatcher class initialization and compilation
 * - Pattern matching with various URL formats
 * - Route finding by pattern and pathname
 * - Error boundary and status page lookups
 * - Utility functions for route type detection and sorting
 */

import { assertEquals, assertExists } from '@std/assert';
import type { ErrorBoundary, RouteConfig, RoutesManifest } from '../../src/type/route.type.ts';
import {
  filePathToPattern,
  getPageFileType,
  getRouteType,
  RouteMatcher,
  sortRoutesBySpecificity,
} from '../../src/route/route.matcher.ts';

// ============================================================================
// Test Fixtures
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
// match() Method - Basic Patterns
// ============================================================================

Deno.test('match - matches root path', () => {
  const routes = [createRouteConfig('/')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/'));
  assertExists(result);
  assertEquals(result?.route.pattern, '/');
});

Deno.test('match - matches static routes', () => {
  const routes = [createRouteConfig('/about')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/about'));
  assertExists(result);
  assertEquals(result?.route.pattern, '/about');
});

Deno.test('match - matches multiple static routes', () => {
  const routes = [
    createRouteConfig('/'),
    createRouteConfig('/about'),
    createRouteConfig('/contact'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const aboutResult = matcher.match(new URL('http://localhost/about'));
  assertExists(aboutResult);
  assertEquals(aboutResult?.route.pattern, '/about');

  const contactResult = matcher.match(new URL('http://localhost/contact'));
  assertExists(contactResult);
  assertEquals(contactResult?.route.pattern, '/contact');
});

Deno.test('match - returns undefined for non-matching routes', () => {
  const routes = [createRouteConfig('/about')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/nonexistent'));
  assertEquals(result, undefined);
});

// ============================================================================
// match() Method - Dynamic Routes
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

Deno.test('match - handles various param values', () => {
  const routes = [createRouteConfig('/user/:username')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result1 = matcher.match(new URL('http://localhost/user/john-doe'));
  assertExists(result1);
  assertEquals(result1?.params.username, 'john-doe');

  const result2 = matcher.match(new URL('http://localhost/user/user123'));
  assertExists(result2);
  assertEquals(result2?.params.username, 'user123');
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
// match() Method - Route Priority
// ============================================================================

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

Deno.test('match - respects route order for specificity', () => {
  const routes = [
    createRouteConfig('/projects/special'),
    createRouteConfig('/projects/:id'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/projects/special'));
  assertExists(result);
  // Returns first matching route
  assertEquals(result?.route.pattern, '/projects/special');
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

Deno.test('findRoute - finds by pathname match', () => {
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

// ============================================================================
// findErrorBoundary() Method
// ============================================================================

Deno.test('findErrorBoundary - finds exact match', () => {
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

Deno.test('findErrorBoundary - finds most specific boundary', () => {
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

Deno.test('findErrorBoundary - does not match without prefix', () => {
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

Deno.test('findErrorBoundary - prioritizes more specific over less specific', () => {
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

Deno.test('getStatusPage - returns status page for 401', () => {
  const statusPages = new Map<number, RouteConfig>();
  statusPages.set(401, createRouteConfig('/401'));

  const manifest = createRoutesManifest([], [], statusPages);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.getStatusPage(401);
  assertExists(result);
  assertEquals(result?.pattern, '/401');
});

Deno.test('getStatusPage - returns status page for 403', () => {
  const statusPages = new Map<number, RouteConfig>();
  statusPages.set(403, createRouteConfig('/403'));

  const manifest = createRoutesManifest([], [], statusPages);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.getStatusPage(403);
  assertExists(result);
  assertEquals(result?.pattern, '/403');
});

Deno.test('getStatusPage - returns status page for custom codes', () => {
  const statusPages = new Map<number, RouteConfig>();
  statusPages.set(500, createRouteConfig('/500'));
  statusPages.set(502, createRouteConfig('/502'));

  const manifest = createRoutesManifest([], [], statusPages);
  const matcher = new RouteMatcher(manifest);

  const result500 = matcher.getStatusPage(500);
  assertExists(result500);
  assertEquals(result500?.pattern, '/500');

  const result502 = matcher.getStatusPage(502);
  assertExists(result502);
  assertEquals(result502?.pattern, '/502');
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
// filePathToPattern() Function
// ============================================================================

Deno.test('filePathToPattern - converts root index file', () => {
  const pattern = filePathToPattern('routes/index.page.ts');
  assertEquals(pattern, '/');
});

Deno.test('filePathToPattern - converts simple page file', () => {
  const pattern = filePathToPattern('routes/about.page.ts');
  assertEquals(pattern, '/about');
});

Deno.test('filePathToPattern - converts nested index file to wildcard', () => {
  const pattern = filePathToPattern('routes/projects/index.page.ts');
  assertEquals(pattern, '/projects/:rest*');
});

Deno.test('filePathToPattern - converts nested page file', () => {
  const pattern = filePathToPattern('routes/projects/details.page.ts');
  assertEquals(pattern, '/projects/details');
});

Deno.test('filePathToPattern - converts dynamic segment', () => {
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

Deno.test('filePathToPattern - handles nested .page.css files', () => {
  const pattern = filePathToPattern('routes/projects/[id].page.css');
  assertEquals(pattern, '/projects/:id');
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

Deno.test('filePathToPattern - handles deeply nested routes', () => {
  const pattern = filePathToPattern(
    'routes/a/b/c/d/[param]/e.page.ts',
  );
  assertEquals(pattern, '/a/b/c/d/:param/e');
});

Deno.test('filePathToPattern - root index does NOT become wildcard', () => {
  const pattern = filePathToPattern('routes/index.page.ts');
  assertEquals(pattern, '/');
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

Deno.test('filePathToPattern - flat file stays exact (no wildcard)', () => {
  const pattern = filePathToPattern('routes/crypto.page.ts');
  assertEquals(pattern, '/crypto');
});

// ============================================================================
// getRouteType() Function
// ============================================================================

Deno.test('getRouteType - identifies .page.ts files', () => {
  const type = getRouteType('about.page.ts');
  assertEquals(type, 'page');
});

Deno.test('getRouteType - identifies .page.html files', () => {
  const type = getRouteType('about.page.html');
  assertEquals(type, 'page');
});

Deno.test('getRouteType - identifies .page.md files', () => {
  const type = getRouteType('about.page.md');
  assertEquals(type, 'page');
});

Deno.test('getRouteType - identifies .error.ts files', () => {
  const type = getRouteType('admin.error.ts');
  assertEquals(type, 'error');
});

Deno.test('getRouteType - identifies .redirect.ts files', () => {
  const type = getRouteType('old-path.redirect.ts');
  assertEquals(type, 'redirect');
});

Deno.test('getRouteType - returns null for unknown types', () => {
  const type = getRouteType('file.ts');
  assertEquals(type, null);
});

Deno.test('getRouteType - returns null for .html files without .page', () => {
  const type = getRouteType('about.html');
  assertEquals(type, null);
});

Deno.test('getRouteType - returns null for .md files without .page', () => {
  const type = getRouteType('about.md');
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

Deno.test('getPageFileType - identifies .page.css files', () => {
  const type = getPageFileType('about.page.css');
  assertEquals(type, 'css');
});

Deno.test('getPageFileType - returns null for unknown extensions', () => {
  const type = getPageFileType('about.page.jsx');
  assertEquals(type, null);
});

Deno.test('getPageFileType - returns null for empty strings', () => {
  const type = getPageFileType('');
  assertEquals(type, null);
});

// ============================================================================
// sortRoutesBySpecificity() Function
// ============================================================================

Deno.test('sortRoutesBySpecificity - sorts by segment count', () => {
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

Deno.test('sortRoutesBySpecificity - prefers static over dynamic', () => {
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

Deno.test('sortRoutesBySpecificity - maintains order for equal specificity', () => {
  const routes = [
    createRouteConfig('/about'),
    createRouteConfig('/contact'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  // Both have same specificity, order should be preserved or consistent
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

Deno.test('sortRoutesBySpecificity - complex real-world scenarios', () => {
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

Deno.test('sortRoutesBySpecificity - wildcard sorts after static', () => {
  const routes = [
    createRouteConfig('/crypto/:rest*'),
    createRouteConfig('/crypto/eth'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  assertEquals(sorted[0].pattern, '/crypto/eth');
  assertEquals(sorted[1].pattern, '/crypto/:rest*');
});

Deno.test('sortRoutesBySpecificity - wildcard sorts after dynamic param', () => {
  const routes = [
    createRouteConfig('/projects/:rest*'),
    createRouteConfig('/projects/:id'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  assertEquals(sorted[0].pattern, '/projects/:id');
  assertEquals(sorted[1].pattern, '/projects/:rest*');
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
  // / is least specific non-wildcard but still before wildcard
  const wildcardIndex = sorted.findIndex((r) => r.pattern === '/crypto/:rest*');
  const rootIndex = sorted.findIndex((r) => r.pattern === '/');
  assertEquals(rootIndex < wildcardIndex, true);
});

Deno.test('sortRoutesBySpecificity - multiple wildcards sort among themselves', () => {
  const routes = [
    createRouteConfig('/docs/:rest*'),
    createRouteConfig('/docs/api/:rest*'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  // More segments = more specific, even among wildcards
  assertEquals(sorted[0].pattern, '/docs/api/:rest*');
  assertEquals(sorted[1].pattern, '/docs/:rest*');
});

// ============================================================================
// Integration Tests
// ============================================================================

Deno.test('integration - full routing scenario', () => {
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

  // Test various route matches
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

  const taskRoute = matcher.match(
    new URL('http://localhost/projects/123/tasks'),
  );
  assertExists(taskRoute);
  assertEquals(taskRoute?.route.pattern, '/projects/:id/tasks');

  // Test error boundary
  const boundary = matcher.findErrorBoundary('/projects/123');
  assertExists(boundary);
  assertEquals(boundary?.pattern, '/projects');

  // Test status page
  const statusPage = matcher.getStatusPage(404);
  assertExists(statusPage);
  assertEquals(statusPage?.pattern, '/404');
});

Deno.test('integration - complex nested routes with error boundaries', () => {
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
    {
      pattern: '/',
      modulePath: '/routes.error.ts',
    },
    {
      pattern: '/admin',
      modulePath: '/routes/admin.error.ts',
    },
    {
      pattern: '/public',
      modulePath: '/routes/public.error.ts',
    },
  ];

  const manifest = createRoutesManifest(routes, errorBoundaries);
  const matcher = new RouteMatcher(manifest);

  // Admin routes use admin error boundary
  const adminBoundary = matcher.findErrorBoundary('/admin/users/5');
  assertExists(adminBoundary);
  assertEquals(adminBoundary?.pattern, '/admin');

  // Public routes use public error boundary
  const publicBoundary = matcher.findErrorBoundary('/public/posts/hello-world');
  assertExists(publicBoundary);
  assertEquals(publicBoundary?.pattern, '/public');

  // Unknown routes use root error boundary
  const rootBoundary = matcher.findErrorBoundary('/random/path');
  assertExists(rootBoundary);
  assertEquals(rootBoundary?.pattern, '/');
});
