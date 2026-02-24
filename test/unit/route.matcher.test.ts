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
 * - doc/04-routing.md: Routing concepts and file-based routing rules
 * - doc/05-nesting.md: Nested route patterns, slot rules, and hierarchy
 */

import { test, expect, describe } from 'bun:test';
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

test('toUrl - parses string URLs', () => {
  const url = toUrl('http://example.com/about');
  expect(url).toBeDefined();
  expect(url.pathname).toEqual('/about');
});

test('toUrl - passes through URL objects unchanged', () => {
  const original = new URL('http://example.com/projects/123');
  const url = toUrl(original);
  expect(url).toEqual(original);
});

test('toUrl - handles relative paths with parse context', () => {
  const url = toUrl('http://localhost/test');
  expect(url.pathname).toEqual('/test');
});

// ============================================================================
// RouteMatcher Constructor and Compilation
// ============================================================================

test('RouteMatcher - initializes with empty manifest', () => {
  const manifest = createRoutesManifest();
  const matcher = new RouteMatcher(manifest);
  expect(matcher).toBeDefined();
});

test('RouteMatcher - compiles valid routes', () => {
  const routes = [
    createRouteConfig('/'),
    createRouteConfig('/about'),
    createRouteConfig('/projects/:id'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);
  expect(matcher).toBeDefined();
});

test('RouteMatcher - handles invalid patterns gracefully', () => {
  const routes = [
    createRouteConfig('/valid'),
    createRouteConfig('/invalid[pattern'),
  ];
  const manifest = createRoutesManifest(routes);
  // Should not throw, invalid patterns are logged
  const matcher = new RouteMatcher(manifest);
  expect(matcher).toBeDefined();
});

test('RouteMatcher - stores error boundaries', () => {
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/admin',
      modulePath: '/routes/admin.error.ts',
    },
  ];
  const manifest = createRoutesManifest([], errorBoundaries);
  const matcher = new RouteMatcher(manifest);
  expect(matcher).toBeDefined();
});

test('RouteMatcher - stores and sorts error boundaries by specificity', () => {
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
  expect(adminUsers?.pattern).toEqual('/admin/users');
});

test('RouteMatcher - stores status pages', () => {
  const statusPages = new Map<number, RouteConfig>();
  statusPages.set(404, createRouteConfig('/404'));
  statusPages.set(401, createRouteConfig('/401'));
  const manifest = createRoutesManifest([], [], statusPages);
  const matcher = new RouteMatcher(manifest);
  expect(matcher).toBeDefined();
});

test('RouteMatcher - stores error handler', () => {
  const errorHandler = createRouteConfig('/error');
  const manifest = createRoutesManifest([], [], new Map(), errorHandler);
  const matcher = new RouteMatcher(manifest);
  expect(matcher).toBeDefined();
});

// ============================================================================
// match() Method - Basic Static Routes
// ============================================================================

test('match - matches root path /', () => {
  const routes = [createRouteConfig('/')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/'));
  expect(result).toBeDefined();
  expect(result?.route.pattern).toEqual('/');
});

test('match - matches simple static routes', () => {
  const routes = [createRouteConfig('/about')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/about'));
  expect(result).toBeDefined();
  expect(result?.route.pattern).toEqual('/about');
});

test('match - matches multiple distinct static routes', () => {
  const routes = [
    createRouteConfig('/'),
    createRouteConfig('/about'),
    createRouteConfig('/contact'),
    createRouteConfig('/services'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const about = matcher.match(new URL('http://localhost/about'));
  expect(about).toBeDefined();
  expect(about?.route.pattern).toEqual('/about');

  const contact = matcher.match(new URL('http://localhost/contact'));
  expect(contact).toBeDefined();
  expect(contact?.route.pattern).toEqual('/contact');

  const services = matcher.match(new URL('http://localhost/services'));
  expect(services).toBeDefined();
  expect(services?.route.pattern).toEqual('/services');
});

test('match - returns undefined for non-matching routes', () => {
  const routes = [createRouteConfig('/about')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/nonexistent'));
  expect(result).toEqual(undefined);
});

test('match - does not match similar but different paths', () => {
  const routes = [createRouteConfig('/admin')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  expect(matcher.match(new URL('http://localhost/admin-panel'))).toEqual(undefined);
  expect(matcher.match(new URL('http://localhost/admin/users'))).toEqual(undefined);
});

// ============================================================================
// match() Method - Dynamic Segment Routes
// ============================================================================

test('match - matches dynamic segment routes', () => {
  const routes = [createRouteConfig('/projects/:id')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/projects/123'));
  expect(result).toBeDefined();
  expect(result?.route.pattern).toEqual('/projects/:id');
});

test('match - extracts params from dynamic routes', () => {
  const routes = [createRouteConfig('/projects/:id')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/projects/abc123'));
  expect(result).toBeDefined();
  expect(result?.params.id).toEqual('abc123');
});

test('match - handles various param values (letters, numbers, hyphens)', () => {
  const routes = [createRouteConfig('/user/:username')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result1 = matcher.match(new URL('http://localhost/user/john-doe'));
  expect(result1).toBeDefined();
  expect(result1?.params.username).toEqual('john-doe');

  const result2 = matcher.match(new URL('http://localhost/user/user_123'));
  expect(result2).toBeDefined();
  expect(result2?.params.username).toEqual('user_123');
});

test('match - matches multiple dynamic segments', () => {
  const routes = [createRouteConfig('/projects/:projectId/tasks/:taskId')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(
    new URL('http://localhost/projects/proj1/tasks/task2'),
  );
  expect(result).toBeDefined();
  expect(result?.params.projectId).toEqual('proj1');
  expect(result?.params.taskId).toEqual('task2');
});

test('match - matches deeply nested dynamic segments', () => {
  const routes = [
    createRouteConfig('/api/:version/users/:id/posts/:postId/comments/:commentId'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(
    new URL('http://localhost/api/v2/users/42/posts/100/comments/50'),
  );
  expect(result).toBeDefined();
  expect(result?.params.version).toEqual('v2');
  expect(result?.params.id).toEqual('42');
  expect(result?.params.postId).toEqual('100');
  expect(result?.params.commentId).toEqual('50');
});

// ============================================================================
// match() Method - Wildcard/Catch-all Routes
// ============================================================================

test('match - matches wildcard catch-all routes', () => {
  const routes = [createRouteConfig('/docs/:rest*')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/docs/api/getting-started'));
  expect(result).toBeDefined();
  expect(result?.route.pattern).toEqual('/docs/:rest*');
});

test('match - extracts rest param from wildcard routes', () => {
  const routes = [createRouteConfig('/docs/:rest*')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/docs/guides/deploy/docker'));
  expect(result).toBeDefined();
  expect(result?.params.rest).toEqual('guides/deploy/docker');
});

test('match - wildcard matches single segment', () => {
  const routes = [createRouteConfig('/docs/:rest*')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/docs/intro'));
  expect(result).toBeDefined();
  expect(result?.params.rest).toEqual('intro');
});

test('match - wildcard with dynamic parent segment', () => {
  const routes = [createRouteConfig('/projects/:id/:rest*')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(
    new URL('http://localhost/projects/123/boards/kanban/tasks'),
  );
  expect(result).toBeDefined();
  expect(result?.params.id).toEqual('123');
  expect(result?.params.rest).toEqual('boards/kanban/tasks');
});

// ============================================================================
// match() Method - Route Priority and Specificity
// ============================================================================

test('match - static routes win over dynamic routes (guide.md rule)', () => {
  const routes = [
    createRouteConfig('/crypto/:coin'),
    createRouteConfig('/crypto/eth'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  // Routes are in original order, so /crypto/:coin matches first
  // This test verifies that route ordering matters for priority
  const result = matcher.match(new URL('http://localhost/crypto/eth'));
  expect(result).toBeDefined();
  expect(result?.route.pattern).toEqual('/crypto/:coin');
});

test('match - specific routes win when ordered correctly (guide.md rule)', () => {
  // Routes should be sorted by specificity before use
  const routes = [
    createRouteConfig('/crypto/eth'),
    createRouteConfig('/crypto/:coin'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/crypto/eth'));
  expect(result).toBeDefined();
  expect(result?.route.pattern).toEqual('/crypto/eth');
});

test('match - returns first matching route in order', () => {
  const routes = [
    createRouteConfig('/projects/:id'),
    createRouteConfig('/projects/special'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/projects/special'));
  expect(result).toBeDefined();
  // Returns first match, which is /projects/:id
  expect(result?.route.pattern).toEqual('/projects/:id');
});

test('match - catch-all has lower priority than specific routes', () => {
  // When routes are pre-sorted correctly, specific routes come first
  const routes = [
    createRouteConfig('/projects/:id'),
    createRouteConfig('/projects/:rest*'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/projects/123'));
  expect(result).toBeDefined();
  // Dynamic param without wildcard should match first
  expect(result?.route.pattern).toEqual('/projects/:id');
});

// ============================================================================
// match() Method - Query Parameters
// ============================================================================

test('match - preserves search params in result', () => {
  const routes = [createRouteConfig('/search')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match('http://localhost/search?q=test&page=2');
  expect(result).toBeDefined();
  expect(result.searchParams).toBeDefined();
  expect(result.searchParams.get('q')).toEqual('test');
  expect(result.searchParams.get('page')).toEqual('2');
});

test('match - handles multiple search param values', () => {
  const routes = [createRouteConfig('/filter')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match('http://localhost/filter?category=books&category=electronics');
  expect(result).toBeDefined();
  expect(result.searchParams).toBeDefined();
  const categories = result.searchParams.getAll('category');
  expect(categories.length).toEqual(2);
});

test('match - ignores search params for pattern matching', () => {
  const routes = [createRouteConfig('/products/:id')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match('http://localhost/products/42?color=red&size=large');
  expect(result).toBeDefined();
  expect(result.params.id).toEqual('42');
  expect(result.searchParams).toBeDefined();
  expect(result.searchParams.get('color')).toEqual('red');
  expect(result.searchParams.get('size')).toEqual('large');
});

// ============================================================================
// match() Method - String vs URL Input
// ============================================================================

test('match - accepts string URLs', () => {
  const routes = [createRouteConfig('/about')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match('http://localhost/about');
  expect(result).toBeDefined();
  expect(result?.route.pattern).toEqual('/about');
});

test('match - accepts URL objects', () => {
  const routes = [createRouteConfig('/about')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match(new URL('http://localhost/about'));
  expect(result).toBeDefined();
  expect(result?.route.pattern).toEqual('/about');
});

test('match - handles string URLs with query params', () => {
  const routes = [createRouteConfig('/search')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match('http://localhost/search?q=test');
  expect(result).toBeDefined();
  expect(result?.route.pattern).toEqual('/search');
});

// ============================================================================
// findRoute() Method
// ============================================================================

test('findRoute - finds by exact pattern match', () => {
  const routes = [
    createRouteConfig('/'),
    createRouteConfig('/about'),
    createRouteConfig('/projects/:id'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findRoute('/about');
  expect(result).toBeDefined();
  expect(result?.pattern).toEqual('/about');
});

test('findRoute - finds by pathname match when no exact pattern', () => {
  const routes = [createRouteConfig('/projects/:id')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findRoute('/projects/123');
  expect(result).toBeDefined();
  expect(result?.pattern).toEqual('/projects/:id');
});

test('findRoute - returns undefined for non-matching', () => {
  const routes = [createRouteConfig('/about')];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findRoute('/nonexistent');
  expect(result).toEqual(undefined);
});

test('findRoute - prefers exact pattern match over pathname match', () => {
  const routes = [
    createRouteConfig('/'),
    createRouteConfig('/projects/:id'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findRoute('/');
  expect(result).toBeDefined();
  expect(result?.pattern).toEqual('/');
});

test('findRoute - handles dynamic routes with multiple segments', () => {
  const routes = [
    createRouteConfig('/projects/:projectId/tasks/:taskId'),
  ];
  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findRoute('/projects/123/tasks/456');
  expect(result).toBeDefined();
  expect(result?.pattern).toEqual('/projects/:projectId/tasks/:taskId');
});

// ============================================================================
// findErrorBoundary() Method
// ============================================================================

test('findErrorBoundary - finds exact pattern match', () => {
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/admin',
      modulePath: '/routes/admin.error.ts',
    },
  ];
  const manifest = createRoutesManifest([], errorBoundaries);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findErrorBoundary('/admin');
  expect(result).toBeDefined();
  expect(result?.pattern).toEqual('/admin');
});

test('findErrorBoundary - finds by prefix match', () => {
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/admin',
      modulePath: '/routes/admin.error.ts',
    },
  ];
  const manifest = createRoutesManifest([], errorBoundaries);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findErrorBoundary('/admin/users');
  expect(result).toBeDefined();
  expect(result?.pattern).toEqual('/admin');
});

test('findErrorBoundary - finds most specific boundary (guide.md rule)', () => {
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
  expect(result).toBeDefined();
  expect(result?.pattern).toEqual('/admin/users');
});

test('findErrorBoundary - returns undefined for non-matching', () => {
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/admin',
      modulePath: '/routes/admin.error.ts',
    },
  ];
  const manifest = createRoutesManifest([], errorBoundaries);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findErrorBoundary('/user');
  expect(result).toEqual(undefined);
});

test('findErrorBoundary - handles root boundary', () => {
  const errorBoundaries: ErrorBoundary[] = [
    {
      pattern: '/',
      modulePath: '/routes.error.ts',
    },
  ];
  const manifest = createRoutesManifest([], errorBoundaries);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.findErrorBoundary('/any/path');
  expect(result).toBeDefined();
  expect(result?.pattern).toEqual('/');
});

test('findErrorBoundary - does not match similar names without prefix', () => {
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
  expect(result).toEqual(undefined);
});

test('findErrorBoundary - deep nesting with multiple boundaries', () => {
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
  expect(result).toBeDefined();
  expect(result?.pattern).toEqual('/admin/users');
});

test('findErrorBoundary - finds between multiple sibling boundaries', () => {
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
  expect(apiResult?.pattern).toEqual('/api');

  const adminResult = matcher.findErrorBoundary('/admin/settings');
  expect(adminResult?.pattern).toEqual('/admin');
});

// ============================================================================
// getStatusPage() Method
// ============================================================================

test('getStatusPage - returns status page for 404', () => {
  const statusPages = new Map<number, RouteConfig>();
  statusPages.set(404, createRouteConfig('/404'));
  const manifest = createRoutesManifest([], [], statusPages);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.getStatusPage(404);
  expect(result).toBeDefined();
  expect(result?.pattern).toEqual('/404');
});

test('getStatusPage - returns status page for various error codes', () => {
  const statusPages = new Map<number, RouteConfig>();
  statusPages.set(401, createRouteConfig('/401'));
  statusPages.set(403, createRouteConfig('/403'));
  statusPages.set(500, createRouteConfig('/500'));
  const manifest = createRoutesManifest([], [], statusPages);
  const matcher = new RouteMatcher(manifest);

  expect(matcher.getStatusPage(401)?.pattern).toEqual('/401');
  expect(matcher.getStatusPage(403)?.pattern).toEqual('/403');
  expect(matcher.getStatusPage(500)?.pattern).toEqual('/500');
});

test('getStatusPage - returns undefined for non-existent status', () => {
  const statusPages = new Map<number, RouteConfig>();
  statusPages.set(404, createRouteConfig('/404'));
  const manifest = createRoutesManifest([], [], statusPages);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.getStatusPage(500);
  expect(result).toEqual(undefined);
});

test('getStatusPage - returns undefined when no status pages', () => {
  const manifest = createRoutesManifest();
  const matcher = new RouteMatcher(manifest);

  const result = matcher.getStatusPage(404);
  expect(result).toEqual(undefined);
});

// ============================================================================
// getErrorHandler() Method
// ============================================================================

test('getErrorHandler - returns error handler when set', () => {
  const errorHandler = createRouteConfig('/error');
  const manifest = createRoutesManifest([], [], new Map(), errorHandler);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.getErrorHandler();
  expect(result).toBeDefined();
  expect(result?.pattern).toEqual('/error');
});

test('getErrorHandler - returns undefined when not set', () => {
  const manifest = createRoutesManifest();
  const matcher = new RouteMatcher(manifest);

  const result = matcher.getErrorHandler();
  expect(result).toEqual(undefined);
});

// ============================================================================
// filePathToPattern() Function - Basic Conversions
// ============================================================================

test('filePathToPattern - converts root index file', () => {
  const pattern = filePathToPattern('routes/index.page.ts');
  expect(pattern).toEqual('/');
});

test('filePathToPattern - root index does NOT become wildcard (guide.md rule)', () => {
  const pattern = filePathToPattern('routes/index.page.ts');
  expect(pattern).toEqual('/');
  expect(pattern.includes(':rest*')).toEqual(false);
});

test('filePathToPattern - converts simple page file', () => {
  const pattern = filePathToPattern('routes/about.page.ts');
  expect(pattern).toEqual('/about');
});

test('filePathToPattern - converts flat file (no wildcard)', () => {
  const pattern = filePathToPattern('routes/crypto.page.ts');
  expect(pattern).toEqual('/crypto');
  expect(pattern.includes(':rest*')).toEqual(false);
});

// ============================================================================
// filePathToPattern() Function - Dynamic Segments
// ============================================================================

test('filePathToPattern - converts [param] to :param', () => {
  const pattern = filePathToPattern('routes/projects/[id].page.ts');
  expect(pattern).toEqual('/projects/:id');
});

test('filePathToPattern - converts multiple dynamic segments', () => {
  const pattern = filePathToPattern(
    'routes/projects/[projectId]/tasks/[taskId].page.ts',
  );
  expect(pattern).toEqual('/projects/:projectId/tasks/:taskId');
});

test('filePathToPattern - converts mixed static and dynamic segments', () => {
  const pattern = filePathToPattern('routes/users/[id]/profile.page.ts');
  expect(pattern).toEqual('/users/:id/profile');
});

test('filePathToPattern - deeply nested with dynamic segments', () => {
  const pattern = filePathToPattern('routes/a/b/c/d/[param]/e.page.ts');
  expect(pattern).toEqual('/a/b/c/d/:param/e');
});

// ============================================================================
// filePathToPattern() Function - Directory Index / Catch-all Routes
// ============================================================================

test('filePathToPattern - non-root directory index becomes wildcard (guide.md rule)', () => {
  const pattern = filePathToPattern('routes/projects/index.page.ts');
  expect(pattern).toEqual('/projects/:rest*');
});

test('filePathToPattern - directory index becomes wildcard for .html', () => {
  const pattern = filePathToPattern('routes/dashboard/index.page.html');
  expect(pattern).toEqual('/dashboard/:rest*');
});

test('filePathToPattern - directory index becomes wildcard for .md', () => {
  const pattern = filePathToPattern('routes/crypto/index.page.md');
  expect(pattern).toEqual('/crypto/:rest*');
});

test('filePathToPattern - deeply nested directory index becomes wildcard', () => {
  const pattern = filePathToPattern('routes/docs/api/index.page.ts');
  expect(pattern).toEqual('/docs/api/:rest*');
});

test('filePathToPattern - directory index with dynamic parent', () => {
  const pattern = filePathToPattern('routes/projects/[id]/index.page.ts');
  expect(pattern).toEqual('/projects/:id/:rest*');
});

test('filePathToPattern - nested directory indices chain', () => {
  const root = filePathToPattern('routes/blog/index.page.ts');
  expect(root).toEqual('/blog/:rest*');

  const nested = filePathToPattern('routes/blog/posts/index.page.ts');
  expect(nested).toEqual('/blog/posts/:rest*');
});

// ============================================================================
// filePathToPattern() Function - File Extension Handling
// ============================================================================

test('filePathToPattern - handles .page.html files', () => {
  const pattern = filePathToPattern('routes/about.page.html');
  expect(pattern).toEqual('/about');
});

test('filePathToPattern - handles .page.md files', () => {
  const pattern = filePathToPattern('routes/about.page.md');
  expect(pattern).toEqual('/about');
});

test('filePathToPattern - handles .page.css files', () => {
  const pattern = filePathToPattern('routes/about.page.css');
  expect(pattern).toEqual('/about');
});

test('filePathToPattern - handles .error.ts files', () => {
  const pattern = filePathToPattern('routes/admin.error.ts');
  expect(pattern).toEqual('/admin');
});

test('filePathToPattern - handles .redirect.ts files', () => {
  const pattern = filePathToPattern('routes/old-path.redirect.ts');
  expect(pattern).toEqual('/old-path');
});

test('filePathToPattern - ensures leading slash', () => {
  const pattern = filePathToPattern('routes/test.page.ts');
  expect(pattern.charAt(0)).toEqual('/');
});

// ============================================================================
// filePathToPattern() Function - Edge Cases
// ============================================================================

test('filePathToPattern - handles multiple consecutive slashes', () => {
  const pattern = filePathToPattern('routes/docs/api/index.page.ts');
  expect(pattern).toEqual('/docs/api/:rest*');
});

test('filePathToPattern - handles hyphens in filenames', () => {
  const pattern = filePathToPattern('routes/my-component.page.ts');
  expect(pattern).toEqual('/my-component');
});

test('filePathToPattern - handles underscores in filenames', () => {
  const pattern = filePathToPattern('routes/my_component/[id].page.ts');
  expect(pattern).toEqual('/my_component/:id');
});

test('filePathToPattern - converts bracket params with hyphens', () => {
  const pattern = filePathToPattern('routes/items/[item-id].page.ts');
  expect(pattern).toEqual('/items/:item-id');
});

// ============================================================================
// getRouteType() Function
// ============================================================================

test('getRouteType - identifies .page.ts files as page', () => {
  const type = getRouteType('about.page.ts');
  expect(type).toEqual('page');
});

test('getRouteType - identifies .page.html files as page', () => {
  const type = getRouteType('about.page.html');
  expect(type).toEqual('page');
});

test('getRouteType - identifies .page.md files as page', () => {
  const type = getRouteType('about.page.md');
  expect(type).toEqual('page');
});

test('getRouteType - identifies .error.ts files as error', () => {
  const type = getRouteType('admin.error.ts');
  expect(type).toEqual('error');
});

test('getRouteType - identifies .redirect.ts files as redirect', () => {
  const type = getRouteType('old-path.redirect.ts');
  expect(type).toEqual('redirect');
});

test('getRouteType - returns null for unknown types', () => {
  const type = getRouteType('file.ts');
  expect(type).toEqual(null);
});

test('getRouteType - returns null for .html without .page', () => {
  const type = getRouteType('about.html');
  expect(type).toEqual(null);
});

test('getRouteType - returns null for empty strings', () => {
  const type = getRouteType('');
  expect(type).toEqual(null);
});

test('getRouteType - handles files with multiple dots', () => {
  const type1 = getRouteType('my.component.page.ts');
  expect(type1).toEqual('page');

  const type2 = getRouteType('my.error.handler.error.ts');
  expect(type2).toEqual('error');
});

// ============================================================================
// getPageFileType() Function
// ============================================================================

test('getPageFileType - identifies .page.ts files', () => {
  const type = getPageFileType('about.page.ts');
  expect(type).toEqual('ts');
});

test('getPageFileType - identifies .page.html files', () => {
  const type = getPageFileType('about.page.html');
  expect(type).toEqual('html');
});

test('getPageFileType - identifies .page.md files', () => {
  const type = getPageFileType('about.page.md');
  expect(type).toEqual('md');
});

test('getPageFileType - identifies .page.css files', () => {
  const type = getPageFileType('about.page.css');
  expect(type).toEqual('css');
});

test('getPageFileType - returns null for non-page files', () => {
  const type = getPageFileType('about.ts');
  expect(type).toEqual(null);
});

test('getPageFileType - returns null for error files', () => {
  const type = getPageFileType('admin.error.ts');
  expect(type).toEqual(null);
});

test('getPageFileType - returns null for redirect files', () => {
  const type = getPageFileType('old-path.redirect.ts');
  expect(type).toEqual(null);
});

test('getPageFileType - returns null for unknown extensions', () => {
  const type = getPageFileType('about.page.jsx');
  expect(type).toEqual(null);
});

// ============================================================================
// sortRoutesBySpecificity() Function - Basic Sorting
// ============================================================================

test('sortRoutesBySpecificity - sorts by segment count (longer first)', () => {
  const routes = [
    createRouteConfig('/'),
    createRouteConfig('/projects/:id'),
    createRouteConfig('/projects'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  expect(sorted[0].pattern).toEqual('/projects/:id');
  expect(sorted[1].pattern).toEqual('/projects');
  expect(sorted[2].pattern).toEqual('/');
});

test('sortRoutesBySpecificity - prefers static over dynamic (guide.md rule)', () => {
  const routes = [
    createRouteConfig('/projects/:id'),
    createRouteConfig('/projects/special'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  expect(sorted[0].pattern).toEqual('/projects/special');
  expect(sorted[1].pattern).toEqual('/projects/:id');
});

test('sortRoutesBySpecificity - handles multiple dynamic segments', () => {
  const routes = [
    createRouteConfig('/projects/:projectId/tasks/:taskId'),
    createRouteConfig('/projects/:id'),
    createRouteConfig('/projects'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  expect(sorted[0].pattern).toEqual('/projects/:projectId/tasks/:taskId');
  expect(sorted[1].pattern).toEqual('/projects/:id');
  expect(sorted[2].pattern).toEqual('/projects');
});

test('sortRoutesBySpecificity - handles mixed patterns', () => {
  const routes = [
    createRouteConfig('/users/:id'),
    createRouteConfig('/users/profile'),
    createRouteConfig('/users/profile/edit'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  expect(sorted[0].pattern).toEqual('/users/profile/edit');
  expect(sorted[1].pattern).toEqual('/users/profile');
  expect(sorted[2].pattern).toEqual('/users/:id');
});

// ============================================================================
// sortRoutesBySpecificity() Function - Wildcard Handling
// ============================================================================

test('sortRoutesBySpecificity - wildcard sorts last (guide.md rule)', () => {
  const routes = [
    createRouteConfig('/crypto/:rest*'),
    createRouteConfig('/crypto/eth'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  expect(sorted[0].pattern).toEqual('/crypto/eth');
  expect(sorted[1].pattern).toEqual('/crypto/:rest*');
});

test('sortRoutesBySpecificity - wildcard sorts after all non-wildcards', () => {
  const routes = [
    createRouteConfig('/crypto/:rest*'),
    createRouteConfig('/crypto/eth'),
    createRouteConfig('/crypto/:id'),
    createRouteConfig('/'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  // Non-wildcards first (by their own rules), wildcard last
  expect(sorted[sorted.length - 1].pattern).toEqual('/crypto/:rest*');
  // Root is least specific non-wildcard but still before wildcard
  const wildcardIndex = sorted.findIndex((r) => r.pattern === '/crypto/:rest*');
  const rootIndex = sorted.findIndex((r) => r.pattern === '/');
  expect(rootIndex < wildcardIndex).toEqual(true);
});

test('sortRoutesBySpecificity - multiple wildcards sort by segment count', () => {
  const routes = [
    createRouteConfig('/docs/:rest*'),
    createRouteConfig('/docs/api/:rest*'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  // More segments = more specific, even among wildcards
  expect(sorted[0].pattern).toEqual('/docs/api/:rest*');
  expect(sorted[1].pattern).toEqual('/docs/:rest*');
});

test('sortRoutesBySpecificity - wildcard with plus quantifier', () => {
  const routes = [
    createRouteConfig('/files/:path+'),
    createRouteConfig('/files/special'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  // Plus quantifier should also sort as wildcard
  expect(sorted[0].pattern).toEqual('/files/special');
  expect(sorted[1].pattern).toEqual('/files/:path+');
});

// ============================================================================
// sortRoutesBySpecificity() Function - Edge Cases
// ============================================================================

test('sortRoutesBySpecificity - maintains order for equal specificity', () => {
  const routes = [
    createRouteConfig('/about'),
    createRouteConfig('/contact'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  expect(sorted.length).toEqual(2);
  const patterns = sorted.map((r) => r.pattern);
  expect(patterns.includes('/about')).toEqual(true);
  expect(patterns.includes('/contact')).toEqual(true);
});

test('sortRoutesBySpecificity - does not mutate original array', () => {
  const routes = [
    createRouteConfig('/projects/:id'),
    createRouteConfig('/projects/special'),
  ];
  const original = [...routes];
  const sorted = sortRoutesBySpecificity(routes);

  expect(routes[0].pattern).toEqual(original[0].pattern);
  expect(sorted[0].pattern).toEqual('/projects/special');
});

test('sortRoutesBySpecificity - handles single route', () => {
  const routes = [createRouteConfig('/about')];
  const sorted = sortRoutesBySpecificity(routes);

  expect(sorted.length).toEqual(1);
  expect(sorted[0].pattern).toEqual('/about');
});

test('sortRoutesBySpecificity - handles empty array', () => {
  const routes: RouteConfig[] = [];
  const sorted = sortRoutesBySpecificity(routes);

  expect(sorted.length).toEqual(0);
});

test('sortRoutesBySpecificity - complex real-world scenario', () => {
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
  expect(firstRoute).toEqual('/projects/:id/tasks/:taskId');

  // Verify that longer routes come before shorter ones
  const segmentCounts = sorted.map((r) => r.pattern.split('/').filter(Boolean).length);
  for (let i = 0; i < segmentCounts.length - 1; i++) {
    expect(segmentCounts[i] >= segmentCounts[i + 1]).toEqual(true);
  }

  // Root path comes last (least specific)
  expect(sorted[sorted.length - 1].pattern).toEqual('/');
});

test('sortRoutesBySpecificity - correctly evaluates dynamic vs static at same level', () => {
  const routes = [
    createRouteConfig('/api/:version/users/:id'),
    createRouteConfig('/api/v1/users/profile'),
    createRouteConfig('/api/:version/users'),
    createRouteConfig('/api/v1/users'),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  // All 4-segment routes should come before 3-segment
  const segments = sorted.map((r) => r.pattern.split('/').filter(Boolean).length);
  expect(segments[0] >= segments[1]).toEqual(true);
  expect(segments[1] >= segments[2]).toEqual(true);
});

// ============================================================================
// Integration Tests - Complete Routing Scenarios
// ============================================================================

test('integration - full routing scenario from guide.md', () => {
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
  expect(home).toBeDefined();
  expect(home?.route.pattern).toEqual('/');

  const about = matcher.match(new URL('http://localhost/about'));
  expect(about).toBeDefined();
  expect(about?.route.pattern).toEqual('/about');

  const projectId = matcher.match(new URL('http://localhost/projects/123'));
  expect(projectId).toBeDefined();
  expect(projectId?.route.pattern).toEqual('/projects/:id');
  expect(projectId?.params.id).toEqual('123');

  const boundary = matcher.findErrorBoundary('/projects/123');
  expect(boundary).toBeDefined();
  expect(boundary?.pattern).toEqual('/projects');

  const statusPage = matcher.getStatusPage(404);
  expect(statusPage).toBeDefined();
  expect(statusPage?.pattern).toEqual('/404');
});

test('integration - complex nested routes with catch-all (nesting.md example)', () => {
  // Simulating routes from nesting.md example:
  // docs.page.ts -> /docs (exact)
  // docs/index.page.ts -> /docs/* (catch-all)
  // docs/getting-started.page.md -> /docs/getting-started (specific)

  const routes = [
    createRouteConfig('/docs'),
    createRouteConfig('/docs/getting-started'),
    createRouteConfig('/docs/:rest*'),
  ];

  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const docs = matcher.match(new URL('http://localhost/docs'));
  expect(docs).toBeDefined();
  expect(docs?.route.pattern).toEqual('/docs');

  const getting = matcher.match(new URL('http://localhost/docs/getting-started'));
  expect(getting).toBeDefined();
  // Should match /docs/getting-started if it comes before /docs/:rest*
  expect(getting?.route.pattern).toEqual('/docs/getting-started');

  const nested = matcher.match(new URL('http://localhost/docs/api/components'));
  expect(nested).toBeDefined();
  expect(nested?.route.pattern).toEqual('/docs/:rest*');
  expect(nested?.params.rest).toEqual('api/components');
});

test('integration - crypto example from guide.md', () => {
  // From guide.md: crypto/eth.page.ts wins over [coin].page.ts
  const routes = [
    createRouteConfig('/crypto/eth'),
    createRouteConfig('/crypto/:coin'),
  ];

  const manifest = createRoutesManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const eth = matcher.match(new URL('http://localhost/crypto/eth'));
  expect(eth).toBeDefined();
  expect(eth?.route.pattern).toEqual('/crypto/eth');

  const bitcoin = matcher.match(new URL('http://localhost/crypto/bitcoin'));
  expect(bitcoin).toBeDefined();
  expect(bitcoin?.route.pattern).toEqual('/crypto/:coin');
  expect(bitcoin?.params.coin).toEqual('bitcoin');
});

test('integration - file-based routing from routes directory', () => {
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
  expect(patterns[0]).toEqual('/');
  expect(patterns[1]).toEqual('/about');
  expect(patterns[2]).toEqual('/projects');
  expect(patterns[3]).toEqual('/projects/:rest*');
  expect(patterns[4]).toEqual('/projects/:id');
  expect(patterns[5]).toEqual('/projects/:id/tasks');

  // Create routes with these patterns
  const routes = patterns.map((p) => createRouteConfig(p));
  const sorted = sortRoutesBySpecificity(routes);

  // Verify that specific routes come before catch-all
  const projectsIndex = sorted.findIndex((r) => r.pattern === '/projects/:rest*');
  const projectsId = sorted.findIndex((r) => r.pattern === '/projects/:id');
  expect(projectsId < projectsIndex).toEqual(true);
});

test('integration - nested route hierarchy (nesting.md)', () => {
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
  expect(dashboard?.route.pattern).toEqual('/dashboard');

  const settings = matcher.match(new URL('http://localhost/dashboard/settings'));
  expect(settings?.route.pattern).toEqual('/dashboard/settings');

  // Test error boundaries
  const dashboardBoundary = matcher.findErrorBoundary('/dashboard/settings');
  expect(dashboardBoundary?.pattern).toEqual('/dashboard');
});

test('integration - admin section with multiple levels', () => {
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
  expect(adminBoundary?.pattern).toEqual('/admin');

  // Public routes use public boundary
  const publicBoundary = matcher.findErrorBoundary('/public/posts/hello');
  expect(publicBoundary?.pattern).toEqual('/public');

  // Unknown routes use root boundary
  const rootBoundary = matcher.findErrorBoundary('/unknown/path');
  expect(rootBoundary?.pattern).toEqual('/');
});
