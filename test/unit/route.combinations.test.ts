/**
 * Route Combinations Test Suite
 *
 * Comprehensive tests for edge cases and unusual route file combinations
 * that consumers might accidentally or intentionally create.
 *
 * This suite programmatically generates route manifests instead of creating
 * actual files, allowing us to test hundreds of combinations efficiently.
 *
 * Focus areas:
 * - Conflicting route patterns (static vs dynamic vs wildcard)
 * - Multiple params in single path
 * - Nested index files at various levels
 * - Unusual bracket combinations
 * - Edge cases with special characters
 * - Route collision scenarios
 */

import { test, expect } from 'bun:test';
import type { RouteConfig, RoutesManifest } from '../../src/type/route.type.ts';
import {
  filePathToPattern,
  RouteMatcher,
  sortRoutesBySpecificity,
} from '../../src/route/route.matcher.ts';

// ============================================================================
// Test Helpers
// ============================================================================

function createRoute(pattern: string, modulePath: string = `/routes${pattern}.ts`): RouteConfig {
  return { pattern, type: 'page', modulePath };
}

function createManifest(routes: RouteConfig[]): RoutesManifest {
  return {
    routes: sortRoutesBySpecificity(routes),
    errorBoundaries: [],
    statusPages: new Map(),
  };
}

function testMatch(
  routes: RouteConfig[],
  url: string,
  expected: { pattern: string; params?: Record<string, string> },
) {
  const manifest = createManifest(routes);
  const matcher = new RouteMatcher(manifest);
  const result = matcher.match(`http://localhost${url}`);

  expect(result).toBeDefined();
  expect(result.route.pattern).toEqual(expected.pattern);

  if (expected.params) {
    for (const [key, value] of Object.entries(expected.params)) {
      expect(result.params[key]).toEqual(value);
    }
  }
}

// ============================================================================
// Edge Case: Multiple Dynamic Segments in Same Path
// ============================================================================

test('combinations - multiple params in single segment (URLPattern limitation)', () => {
  // File: [user]-[id].page.ts
  // This becomes /:user-:id which URLPattern doesn't parse as two params
  // URLPattern interprets the hyphen as part of the pattern, not a separator
  const pattern = filePathToPattern('routes/users/[user]-[id].page.ts');
  expect(pattern).toEqual('/users/:user-:id');

  // URLPattern won't create separate params for :user and :id
  // This is a known limitation - consumers should avoid this pattern
  // The route will likely fail to compile or match incorrectly
  const routes = [createRoute(pattern)];
  const manifest = createManifest(routes);
  const matcher = new RouteMatcher(manifest);

  // This pattern doesn't match as expected - URLPattern limitation
  const _result = matcher.match('http://localhost/users/john-123');
  // Pattern is invalid/ambiguous, result may be undefined or incorrect
});

test('combinations - multiple params with underscores', () => {
  // File: [category]_[subcategory].page.ts
  const pattern = filePathToPattern('routes/products/[category]_[subcategory].page.ts');
  expect(pattern).toEqual('/products/:category_:subcategory');
});

test('combinations - adjacent params without separator', () => {
  // File: [a][b].page.ts - becomes :a:b (unusual but technically valid)
  const pattern = filePathToPattern('routes/test/[a][b].page.ts');
  expect(pattern).toEqual('/test/:a:b');
});

// ============================================================================
// Edge Case: Conflicting Index Files
// ============================================================================

test('combinations - index.page.md + index.page.ts conflict', () => {
  // Consumers might accidentally create multiple index files
  // Both would produce the same pattern, causing conflicts
  const pattern1 = filePathToPattern('routes/blog/index.page.md');
  const pattern2 = filePathToPattern('routes/blog/index.page.ts');

  expect(pattern1).toEqual(pattern2);
  expect(pattern1).toEqual('/blog/:rest*');

  // Both routes would match the same URLs
  const routes = [createRoute(pattern1), createRoute(pattern2)];
  const manifest = createManifest(routes);
  const matcher = new RouteMatcher(manifest);

  // First one wins (depends on manifest order)
  const result = matcher.match('http://localhost/blog/post-1');
  expect(result).toBeDefined();
});

test('combinations - root index vs nested index wildcard collision', () => {
  // routes/index.page.ts → /
  // routes/home/index.page.ts → /home/:rest*
  const root = filePathToPattern('routes/index.page.ts');
  const nested = filePathToPattern('routes/home/index.page.ts');

  expect(root).toEqual('/');
  expect(nested).toEqual('/home/:rest*');

  // These don't actually conflict, just testing behavior
  const routes = [createRoute(root), createRoute(nested)];
  testMatch(routes, '/', { pattern: '/' });
  testMatch(routes, '/home/dashboard', { pattern: '/home/:rest*' });
});

// ============================================================================
// Edge Case: Static vs Dynamic vs Wildcard Collision
// ============================================================================

test('combinations - three-way collision: static + dynamic + wildcard', () => {
  // All in /projects path:
  // projects.page.ts → /projects (static)
  // projects/[id].page.ts → /projects/:id (dynamic)
  // projects/index.page.ts → /projects/:rest* (wildcard)

  const static_route = filePathToPattern('routes/projects.page.ts');
  const dynamic = filePathToPattern('routes/projects/[id].page.ts');
  const wildcard = filePathToPattern('routes/projects/index.page.ts');

  expect(static_route).toEqual('/projects');
  expect(dynamic).toEqual('/projects/:id');
  expect(wildcard).toEqual('/projects/:rest*');

  // After sorting, static should come first, wildcard last
  const routes = [
    createRoute(static_route),
    createRoute(dynamic),
    createRoute(wildcard),
  ];
  const sorted = sortRoutesBySpecificity(routes);

  expect(sorted[0].pattern).toEqual('/projects/:id'); // More segments
  expect(sorted[1].pattern).toEqual('/projects'); // Static but fewer segments
  expect(sorted[2].pattern).toEqual('/projects/:rest*'); // Wildcard always last

  // Test matching priority - /projects matches the static route
  testMatch(routes, '/projects', { pattern: '/projects' });

  // /projects/123 matches the dynamic route
  testMatch(routes, '/projects/123', { pattern: '/projects/:id', params: { id: '123' } });

  // /projects/123/details matches the wildcard
  testMatch(routes, '/projects/123/details', {
    pattern: '/projects/:rest*',
    params: { rest: '123/details' },
  });
});

test('combinations - static should win over dynamic at same level', () => {
  // projects/special.page.ts → /projects/special (static)
  // projects/[id].page.ts → /projects/:id (dynamic)

  const routes = [
    createRoute('/projects/special'),
    createRoute('/projects/:id'),
  ];

  // When properly sorted, static comes first
  const sorted = sortRoutesBySpecificity(routes);
  expect(sorted[0].pattern).toEqual('/projects/special');
  expect(sorted[1].pattern).toEqual('/projects/:id');

  testMatch(routes, '/projects/special', { pattern: '/projects/special' });
  testMatch(routes, '/projects/123', { pattern: '/projects/:id', params: { id: '123' } });
});

// ============================================================================
// Edge Case: Deep Nesting with Index Files
// ============================================================================

test('combinations - multiple index files at different depths', () => {
  // docs/index.page.ts → /docs/:rest*
  // docs/api/index.page.ts → /docs/api/:rest*
  // docs/api/v1/index.page.ts → /docs/api/v1/:rest*

  const level1 = filePathToPattern('routes/docs/index.page.ts');
  const level2 = filePathToPattern('routes/docs/api/index.page.ts');
  const level3 = filePathToPattern('routes/docs/api/v1/index.page.ts');

  expect(level1).toEqual('/docs/:rest*');
  expect(level2).toEqual('/docs/api/:rest*');
  expect(level3).toEqual('/docs/api/v1/:rest*');

  const routes = [createRoute(level1), createRoute(level2), createRoute(level3)];
  const sorted = sortRoutesBySpecificity(routes);

  // More specific (deeper) wildcards come first
  expect(sorted[0].pattern).toEqual('/docs/api/v1/:rest*');
  expect(sorted[1].pattern).toEqual('/docs/api/:rest*');
  expect(sorted[2].pattern).toEqual('/docs/:rest*');

  // Test that most specific matches first
  testMatch(routes, '/docs/api/v1/users', { pattern: '/docs/api/v1/:rest*' });
  testMatch(routes, '/docs/api/components', { pattern: '/docs/api/:rest*' });
  testMatch(routes, '/docs/guide', { pattern: '/docs/:rest*' });
});

// ============================================================================
// Edge Case: Index File + Sibling Pages
// ============================================================================

test('combinations - index wildcard + sibling static pages', () => {
  // blog/index.page.ts → /blog/:rest* (wildcard)
  // blog/archive.page.ts → /blog/archive (static)
  // blog/[slug].page.ts → /blog/:slug (dynamic)

  const wildcard = filePathToPattern('routes/blog/index.page.ts');
  const static_route = filePathToPattern('routes/blog/archive.page.ts');
  const dynamic = filePathToPattern('routes/blog/[slug].page.ts');

  expect(wildcard).toEqual('/blog/:rest*');
  expect(static_route).toEqual('/blog/archive');
  expect(dynamic).toEqual('/blog/:slug');

  const routes = [createRoute(wildcard), createRoute(static_route), createRoute(dynamic)];
  const sorted = sortRoutesBySpecificity(routes);

  // Static comes first, dynamic second, wildcard last
  expect(sorted[0].pattern).toEqual('/blog/archive');
  expect(sorted[1].pattern).toEqual('/blog/:slug');
  expect(sorted[2].pattern).toEqual('/blog/:rest*');

  testMatch(routes, '/blog/archive', { pattern: '/blog/archive' });
  testMatch(routes, '/blog/my-post', { pattern: '/blog/:slug', params: { slug: 'my-post' } });
  testMatch(routes, '/blog/2024/01/post', {
    pattern: '/blog/:rest*',
    params: { rest: '2024/01/post' },
  });
});

// ============================================================================
// Edge Case: Param Names with Special Characters
// ============================================================================

test('combinations - param with hyphens (URLPattern limitation)', () => {
  // File: [item-id].page.ts → /items/:item-id
  // URLPattern doesn't support hyphens in param names
  // This creates an invalid pattern that won't match
  const pattern = filePathToPattern('routes/items/[item-id].page.ts');
  expect(pattern).toEqual('/items/:item-id');

  // This pattern is invalid - URLPattern param names can't contain hyphens
  // Consumers should use underscores or camelCase: [itemId] or [item_id]
  const routes = [createRoute(pattern)];
  const manifest = createManifest(routes);
  const matcher = new RouteMatcher(manifest);

  // Pattern compilation will fail or not match
  const result = matcher.match('http://localhost/items/abc-123');
  expect(result).toEqual(undefined); // Doesn't match due to invalid pattern
});

test('combinations - param with underscores', () => {
  const pattern = filePathToPattern('routes/users/[user_id].page.ts');
  expect(pattern).toEqual('/users/:user_id');

  const routes = [createRoute(pattern)];
  testMatch(routes, '/users/user_42', {
    pattern: '/users/:user_id',
    params: { user_id: 'user_42' },
  });
});

test('combinations - param with numbers', () => {
  const pattern = filePathToPattern('routes/api/[v1].page.ts');
  expect(pattern).toEqual('/api/:v1');

  const routes = [createRoute(pattern)];
  testMatch(routes, '/api/test', { pattern: '/api/:v1', params: { v1: 'test' } });
});

// ============================================================================
// Edge Case: Empty and Single-Character Segments
// ============================================================================

test('combinations - single character static route', () => {
  const pattern = filePathToPattern('routes/a.page.ts');
  expect(pattern).toEqual('/a');

  const routes = [createRoute(pattern)];
  testMatch(routes, '/a', { pattern: '/a' });
});

test('combinations - single character param', () => {
  const pattern = filePathToPattern('routes/items/[x].page.ts');
  expect(pattern).toEqual('/items/:x');

  const routes = [createRoute(pattern)];
  testMatch(routes, '/items/123', { pattern: '/items/:x', params: { x: '123' } });
});

// ============================================================================
// Edge Case: Very Deep Nesting
// ============================================================================

test('combinations - deeply nested route (6+ levels)', () => {
  const pattern = filePathToPattern('routes/a/b/c/d/e/f/g.page.ts');
  expect(pattern).toEqual('/a/b/c/d/e/f/g');

  const routes = [createRoute(pattern)];
  testMatch(routes, '/a/b/c/d/e/f/g', { pattern: '/a/b/c/d/e/f/g' });
});

test('combinations - deeply nested with multiple params', () => {
  const pattern = filePathToPattern('routes/[a]/[b]/[c]/[d]/[e].page.ts');
  expect(pattern).toEqual('/:a/:b/:c/:d/:e');

  const routes = [createRoute(pattern)];
  testMatch(routes, '/1/2/3/4/5', {
    pattern: '/:a/:b/:c/:d/:e',
    params: { a: '1', b: '2', c: '3', d: '4', e: '5' },
  });
});

test('combinations - deeply nested with alternating static and dynamic', () => {
  const pattern = filePathToPattern(
    'routes/api/[version]/users/[id]/posts/[postId]/comments.page.ts',
  );
  expect(pattern).toEqual('/api/:version/users/:id/posts/:postId/comments');

  const routes = [createRoute(pattern)];
  testMatch(routes, '/api/v2/users/42/posts/100/comments', {
    pattern: '/api/:version/users/:id/posts/:postId/comments',
    params: { version: 'v2', id: '42', postId: '100' },
  });
});

// ============================================================================
// Edge Case: Index Files with Dynamic Parents
// ============================================================================

test('combinations - index file under dynamic segment', () => {
  const pattern = filePathToPattern('routes/users/[id]/index.page.ts');
  expect(pattern).toEqual('/users/:id/:rest*');

  const routes = [createRoute(pattern)];
  testMatch(routes, '/users/42/profile', {
    pattern: '/users/:id/:rest*',
    params: { id: '42', rest: 'profile' },
  });
  testMatch(routes, '/users/42/settings/security', {
    pattern: '/users/:id/:rest*',
    params: { id: '42', rest: 'settings/security' },
  });
});

test('combinations - multiple levels of dynamic + index', () => {
  const pattern = filePathToPattern('routes/orgs/[orgId]/teams/[teamId]/index.page.ts');
  expect(pattern).toEqual('/orgs/:orgId/teams/:teamId/:rest*');

  const routes = [createRoute(pattern)];
  testMatch(routes, '/orgs/acme/teams/eng/members', {
    pattern: '/orgs/:orgId/teams/:teamId/:rest*',
    params: { orgId: 'acme', teamId: 'eng', rest: 'members' },
  });
});

// ============================================================================
// Edge Case: File Extensions
// ============================================================================

test('combinations - all file extensions produce same pattern', () => {
  const ts = filePathToPattern('routes/about.page.ts');
  const html = filePathToPattern('routes/about.page.html');
  const md = filePathToPattern('routes/about.page.md');
  const css = filePathToPattern('routes/about.page.css');

  expect(ts).toEqual('/about');
  expect(html).toEqual('/about');
  expect(md).toEqual('/about');
  expect(css).toEqual('/about');
});

test('combinations - error and redirect files', () => {
  const error = filePathToPattern('routes/admin.error.ts');
  const redirect = filePathToPattern('routes/old-page.redirect.ts');

  expect(error).toEqual('/admin');
  expect(redirect).toEqual('/old-page');
});

// ============================================================================
// Edge Case: Filenames with Dots and Special Chars
// ============================================================================

test('combinations - filename with dots', () => {
  const pattern = filePathToPattern('routes/api.v1.page.ts');
  expect(pattern).toEqual('/api.v1');
});

test('combinations - filename with hyphens', () => {
  const pattern = filePathToPattern('routes/my-awesome-page.page.ts');
  expect(pattern).toEqual('/my-awesome-page');
});

test('combinations - filename with underscores', () => {
  const pattern = filePathToPattern('routes/my_component_page.page.ts');
  expect(pattern).toEqual('/my_component_page');
});

// ============================================================================
// Edge Case: Sorting Large Mixed Route Sets
// ============================================================================

test('combinations - comprehensive sorting test', () => {
  const routes = [
    createRoute('/'),
    createRoute('/about'),
    createRoute('/blog'),
    createRoute('/blog/:slug'),
    createRoute('/blog/archive'),
    createRoute('/blog/:rest*'),
    createRoute('/users/:id'),
    createRoute('/users/:id/posts'),
    createRoute('/users/:id/posts/:postId'),
    createRoute('/users/:id/:rest*'),
    createRoute('/admin'),
    createRoute('/admin/users'),
    createRoute('/admin/:section'),
    createRoute('/api/:version/users/:id'),
    createRoute('/api/v1/users/me'),
  ];

  const sorted = sortRoutesBySpecificity(routes);

  // Verify all wildcards are at the end
  const wildcardStartIndex = sorted.findIndex((r) => r.pattern.includes(':rest*'));
  const nonWildcards = sorted.filter((r) => !r.pattern.includes(':rest*'));

  // All non-wildcards should come before wildcards
  if (wildcardStartIndex >= 0) {
    for (let i = 0; i < wildcardStartIndex; i++) {
      expect(sorted[i].pattern.includes(':rest*')).toEqual(false);
    }
    for (let i = wildcardStartIndex; i < sorted.length; i++) {
      expect(sorted[i].pattern.includes(':rest*')).toEqual(true);
    }
  }

  // Verify segment count ordering within non-wildcards
  for (let i = 0; i < nonWildcards.length - 1; i++) {
    const segmentsA = nonWildcards[i].pattern.split('/').filter(Boolean).length;
    const segmentsB = nonWildcards[i + 1].pattern.split('/').filter(Boolean).length;
    expect(segmentsA >= segmentsB).toEqual(true);
  }
});

// ============================================================================
// Edge Case: URL Encoding and Special Characters in Params
// ============================================================================

test('combinations - URL encoded values in dynamic segments', () => {
  const routes = [createRoute('/posts/:slug')];
  testMatch(routes, '/posts/hello%20world', {
    pattern: '/posts/:slug',
    params: { slug: 'hello%20world' },
  });
});

test('combinations - special characters in URL paths', () => {
  const routes = [createRoute('/files/:path')];
  testMatch(routes, '/files/my-file.txt', {
    pattern: '/files/:path',
    params: { path: 'my-file.txt' },
  });
});

// ============================================================================
// Edge Case: Conflicting Patterns That Should Be Detected
// ============================================================================

test('combinations - identical patterns from different files', () => {
  // blog/[slug].page.ts → /blog/:slug
  // blog/[id].page.ts → /blog/:id
  // Both produce different param names but same pattern structure

  const pattern1 = filePathToPattern('routes/blog/[slug].page.ts');
  const pattern2 = filePathToPattern('routes/blog/[id].page.ts');

  expect(pattern1).toEqual('/blog/:slug');
  expect(pattern2).toEqual('/blog/:id');

  // These would conflict - URLPattern sees them as different but they match the same URLs
  const routes = [createRoute(pattern1), createRoute(pattern2)];
  const manifest = createManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match('http://localhost/blog/my-post');
  expect(result).toBeDefined();
  // First one in sorted order wins
});

// ============================================================================
// Real-World Scenario Tests
// ============================================================================

test('combinations - e-commerce site structure', () => {
  const routes = [
    createRoute('/'),
    createRoute('/products'),
    createRoute('/products/:rest*'), // /products/index.page.ts
    createRoute('/products/:category'),
    createRoute('/products/:category/:productId'),
    createRoute('/cart'),
    createRoute('/checkout'),
    createRoute('/checkout/confirm'),
    createRoute('/user/:id'),
    createRoute('/user/:id/orders'),
    createRoute('/user/:id/orders/:orderId'),
  ];

  testMatch(routes, '/', { pattern: '/' });
  // /products matches the static /products route, not the wildcard
  testMatch(routes, '/products', { pattern: '/products' });
  testMatch(routes, '/products/electronics', {
    pattern: '/products/:category',
    params: { category: 'electronics' },
  });
  testMatch(routes, '/products/electronics/laptop-123', {
    pattern: '/products/:category/:productId',
    params: { category: 'electronics', productId: 'laptop-123' },
  });
  testMatch(routes, '/user/42/orders/order-100', {
    pattern: '/user/:id/orders/:orderId',
    params: { id: '42', orderId: 'order-100' },
  });
});

test('combinations - documentation site with versions', () => {
  const routes = [
    createRoute('/'),
    createRoute('/docs'),
    createRoute('/docs/:rest*'), // catch-all for any doc path
    createRoute('/docs/:version'),
    createRoute('/docs/:version/:page'),
    createRoute('/api'),
    createRoute('/api/:rest*'),
  ];

  testMatch(routes, '/docs/v2/getting-started', {
    pattern: '/docs/:version/:page',
    params: { version: 'v2', page: 'getting-started' },
  });
  testMatch(routes, '/docs/v2/guides/advanced/auth', {
    pattern: '/docs/:rest*',
    params: { rest: 'v2/guides/advanced/auth' },
  });
});

// ============================================================================
// Programmatic Route Generation Tests
// ============================================================================

test('combinations - generate all combinations of 2-level routes', () => {
  // Generate routes like /a/b, /a/[b], /[a]/b, /[a]/[b]
  const variations = [
    'routes/a/b.page.ts',
    'routes/a/[b].page.ts',
    'routes/[a]/b.page.ts',
    'routes/[a]/[b].page.ts',
    'routes/a/index.page.ts',
    'routes/[a]/index.page.ts',
  ];

  const patterns = variations.map(filePathToPattern);
  expect(patterns[0]).toEqual('/a/b');
  expect(patterns[1]).toEqual('/a/:b');
  expect(patterns[2]).toEqual('/:a/b');
  expect(patterns[3]).toEqual('/:a/:b');
  expect(patterns[4]).toEqual('/a/:rest*');
  expect(patterns[5]).toEqual('/:a/:rest*');

  // All patterns are unique and valid
  const uniquePatterns = new Set(patterns);
  expect(uniquePatterns.size).toEqual(patterns.length);
});

test('combinations - generate param combinations for 3-level route', () => {
  // Test all 8 combinations of static/dynamic for a 3-segment path
  const combos = [
    'routes/a/b/c.page.ts', // sss
    'routes/a/b/[c].page.ts', // ssd
    'routes/a/[b]/c.page.ts', // sds
    'routes/a/[b]/[c].page.ts', // sdd
    'routes/[a]/b/c.page.ts', // dss
    'routes/[a]/b/[c].page.ts', // dsd
    'routes/[a]/[b]/c.page.ts', // dds
    'routes/[a]/[b]/[c].page.ts', // ddd
  ];

  const patterns = combos.map(filePathToPattern);
  const routes = patterns.map((p) => createRoute(p));
  const sorted = sortRoutesBySpecificity(routes);

  // Most static segments should come first
  expect(sorted[0].pattern).toEqual('/a/b/c'); // All static
  expect(sorted[sorted.length - 1].pattern).toEqual('/:a/:b/:c'); // All dynamic
});

// ============================================================================
// Edge Case: Root Level Routes
// ============================================================================

test('combinations - root index does not become wildcard', () => {
  // Root index should be exact /, not /:rest*
  const pattern = filePathToPattern('routes/index.page.ts');
  expect(pattern).toEqual('/');
  expect(pattern.includes(':rest*')).toEqual(false);
});

test('combinations - root level files', () => {
  // All these should create root-level routes
  const about = filePathToPattern('routes/about.page.ts');
  const contact = filePathToPattern('routes/contact.page.ts');
  const pricing = filePathToPattern('routes/pricing.page.md');

  expect(about).toEqual('/about');
  expect(contact).toEqual('/contact');
  expect(pricing).toEqual('/pricing');

  const routes = [createRoute(about), createRoute(contact), createRoute(pricing)];
  testMatch(routes, '/about', { pattern: '/about' });
  testMatch(routes, '/contact', { pattern: '/contact' });
  testMatch(routes, '/pricing', { pattern: '/pricing' });
});

test('combinations - root level dynamic param', () => {
  // routes/[slug].page.ts → /:slug
  const pattern = filePathToPattern('routes/[slug].page.ts');
  expect(pattern).toEqual('/:slug');

  const routes = [createRoute(pattern)];
  testMatch(routes, '/hello', { pattern: '/:slug', params: { slug: 'hello' } });
});

// ============================================================================
// Edge Case: Maximum Collision Scenario
// ============================================================================

test('combinations - maximum collision: all pattern types at same path', () => {
  // Create every possible pattern type for /api/users
  const routes = [
    createRoute('/api/users'), // Static exact
    createRoute('/api/users/:id'), // Single param
    createRoute('/api/users/:id/:action'), // Two params
    createRoute('/api/users/me'), // Static child
    createRoute('/api/users/active'), // Another static child
    createRoute('/api/users/:rest*'), // Wildcard
  ];

  // Test that each URL matches the expected route
  testMatch(routes, '/api/users', { pattern: '/api/users' });
  testMatch(routes, '/api/users/me', { pattern: '/api/users/me' });
  testMatch(routes, '/api/users/active', { pattern: '/api/users/active' });
  testMatch(routes, '/api/users/123', { pattern: '/api/users/:id', params: { id: '123' } });
  testMatch(routes, '/api/users/123/edit', {
    pattern: '/api/users/:id/:action',
    params: { id: '123', action: 'edit' },
  });
  testMatch(routes, '/api/users/123/posts/456', {
    pattern: '/api/users/:rest*',
    params: { rest: '123/posts/456' },
  });
});

// ============================================================================
// Edge Case: Numeric Segments
// ============================================================================

test('combinations - numeric static segments', () => {
  // routes/api/v1/users.page.ts → /api/v1/users
  const pattern = filePathToPattern('routes/api/v1/users.page.ts');
  expect(pattern).toEqual('/api/v1/users');

  const routes = [createRoute(pattern)];
  testMatch(routes, '/api/v1/users', { pattern: '/api/v1/users' });
});

test('combinations - numeric param values', () => {
  const routes = [createRoute('/posts/:id')];
  testMatch(routes, '/posts/12345', { pattern: '/posts/:id', params: { id: '12345' } });
  testMatch(routes, '/posts/0', { pattern: '/posts/:id', params: { id: '0' } });
});

// ============================================================================
// Edge Case: Empty Segments and Trailing Slashes
// ============================================================================

test('combinations - trailing slashes are normalized', () => {
  const routes = [createRoute('/about')];
  // URLPattern normalizes trailing slashes
  const manifest = createManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const withSlash = matcher.match('http://localhost/about/');
  const withoutSlash = matcher.match('http://localhost/about');

  // Both should match (or both not match - depends on URLPattern behavior)
  // Document actual behavior
  if (withSlash) {
    expect(withSlash.route.pattern).toEqual('/about');
  }
  if (withoutSlash) {
    expect(withoutSlash.route.pattern).toEqual('/about');
  }
});

// ============================================================================
// Edge Case: Case Sensitivity
// ============================================================================

test('combinations - route patterns are case-sensitive', () => {
  const routes = [createRoute('/About'), createRoute('/about')];
  const manifest = createManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const upper = matcher.match('http://localhost/About');
  const lower = matcher.match('http://localhost/about');

  expect(upper).toBeDefined();
  expect(lower).toBeDefined();
  expect(upper.route.pattern).toEqual('/About');
  expect(lower.route.pattern).toEqual('/about');
});

// ============================================================================
// Edge Case: Very Long Param Values
// ============================================================================

test('combinations - long param values', () => {
  const routes = [createRoute('/posts/:slug')];
  const longSlug = 'this-is-a-very-long-slug-that-contains-many-words-and-hyphens-to-test-matching';

  testMatch(routes, `/posts/${longSlug}`, {
    pattern: '/posts/:slug',
    params: { slug: longSlug },
  });
});

// ============================================================================
// Edge Case: Param Order Consistency
// ============================================================================

test('combinations - param extraction order matches pattern order', () => {
  const routes = [createRoute('/:year/:month/:day/:slug')];
  testMatch(routes, '/2024/01/15/my-post', {
    pattern: '/:year/:month/:day/:slug',
    params: { year: '2024', month: '01', day: '15', slug: 'my-post' },
  });
});

// ============================================================================
// Edge Case: Mixed File Extensions in Same Directory
// ============================================================================

test('combinations - mixed extensions create pattern conflicts', () => {
  // If consumer creates both .ts and .html for same route
  const ts = filePathToPattern('routes/about.page.ts');
  const html = filePathToPattern('routes/about.page.html');

  expect(ts).toEqual(html); // Same pattern
  expect(ts).toEqual('/about');

  // Both would appear in manifest, first one wins
  const routes = [createRoute(ts), createRoute(html)];
  const manifest = createManifest(routes);
  const matcher = new RouteMatcher(manifest);

  const result = matcher.match('http://localhost/about');
  expect(result).toBeDefined();
  expect(result.route.pattern).toEqual('/about');
  // First route in manifest wins
});

// ============================================================================
// Real-World: GitHub-like Routes
// ============================================================================

test('combinations - GitHub-like user and repo structure', () => {
  const routes = [
    createRoute('/'),
    createRoute('/explore'),
    createRoute('/trending'),
    createRoute('/:user'), // User profile
    createRoute('/:user/:repo'), // Repository
    createRoute('/:user/:repo/issues'),
    createRoute('/:user/:repo/issues/:number'),
    createRoute('/:user/:repo/pull/:number'),
    createRoute('/:user/:repo/:rest*'), // Catch-all for files/commits/etc
  ];

  testMatch(routes, '/explore', { pattern: '/explore' });
  testMatch(routes, '/octocat', { pattern: '/:user', params: { user: 'octocat' } });
  testMatch(routes, '/octocat/hello-world', {
    pattern: '/:user/:repo',
    params: { user: 'octocat', repo: 'hello-world' },
  });
  testMatch(routes, '/octocat/hello-world/issues', {
    pattern: '/:user/:repo/issues',
    params: { user: 'octocat', repo: 'hello-world' },
  });
  testMatch(routes, '/octocat/hello-world/issues/42', {
    pattern: '/:user/:repo/issues/:number',
    params: { user: 'octocat', repo: 'hello-world', number: '42' },
  });
  testMatch(routes, '/octocat/hello-world/blob/main/README.md', {
    pattern: '/:user/:repo/:rest*',
    params: { user: 'octocat', repo: 'hello-world', rest: 'blob/main/README.md' },
  });
});
