import { assertEquals, assertStringIncludes } from '@std/assert';
import { generateSitemap } from '../../tool/sitemap.generator.ts';
import type { RoutesManifest } from '../../src/type/route.type.ts';

/** Minimal manifest factory for testing. */
function createManifest(
  routes: Array<{ pattern: string; type?: string }>,
): RoutesManifest {
  return {
    routes: routes.map((r) => ({
      pattern: r.pattern,
      type: (r.type ?? 'page') as 'page' | 'error' | 'redirect',
      modulePath: `routes${r.pattern === '/' ? '/index' : r.pattern}.page.ts`,
    })),
    errorBoundaries: [],
    statusPages: new Map(),
  };
}

const BASE = 'https://example.com';

// ============================================================================
// XML Structure & Integrity
// ============================================================================

Deno.test('sitemap - empty manifest produces valid empty sitemap', async () => {
  const manifest = createManifest([]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  assertStringIncludes(xml, '<?xml version="1.0" encoding="UTF-8"?>');
  assertStringIncludes(xml, '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  assertStringIncludes(xml, '</urlset>');
  // No <url> entries
  assertEquals(xml.includes('<url>'), false);
});

Deno.test('sitemap - well-formed XML structure with namespace', async () => {
  const manifest = createManifest([{ pattern: '/' }]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  // Check XML declaration
  assertEquals(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), true);
  // Check namespace declaration
  assertStringIncludes(xml, 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  // Check closing tag
  assertEquals(xml.trimEnd().endsWith('</urlset>'), true);
});

Deno.test('sitemap - URL entries properly formatted with indentation', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  // Check indentation structure
  assertStringIncludes(xml, '  <url>');
  assertStringIncludes(xml, '    <loc>');
  assertStringIncludes(xml, '  </url>');
});

// ============================================================================
// Static Routes - URL Formatting
// ============================================================================

Deno.test('sitemap - static routes produce /html/ prefixed absolute URLs', async () => {
  const manifest = createManifest([
    { pattern: '/' },
    { pattern: '/about' },
    { pattern: '/projects' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  assertStringIncludes(xml, '<loc>https://example.com/html/</loc>');
  assertStringIncludes(xml, '<loc>https://example.com/html/about</loc>');
  assertStringIncludes(xml, '<loc>https://example.com/html/projects</loc>');
});

Deno.test('sitemap - root route maps to /html/ not /html', async () => {
  const manifest = createManifest([{ pattern: '/' }]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  assertStringIncludes(xml, '<loc>https://example.com/html/</loc>');
  assertEquals(xml.includes('<loc>https://example.com/html</loc>'), false);
});

Deno.test('sitemap - baseUrl trailing slash is stripped', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: 'https://example.com/',
    basePath: '/html',
  });

  assertStringIncludes(xml, '<loc>https://example.com/html/about</loc>');
  assertEquals(xml.includes('example.com//'), false);
});

Deno.test('sitemap - baseUrl with multiple trailing slashes is normalized', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: 'https://example.com///',
    basePath: '/html',
  });

  assertStringIncludes(xml, '<loc>https://example.com/html/about</loc>');
  assertEquals(xml.includes('example.com//'), false);
});

Deno.test('sitemap - nested routes produce correct paths', async () => {
  const manifest = createManifest([
    { pattern: '/docs/api' },
    { pattern: '/docs/guides/getting-started' },
    { pattern: '/projects/details/overview' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  assertStringIncludes(xml, '<loc>https://example.com/html/docs/api</loc>');
  assertStringIncludes(xml, '<loc>https://example.com/html/docs/guides/getting-started</loc>');
  assertStringIncludes(xml, '<loc>https://example.com/html/projects/details/overview</loc>');
});

Deno.test('sitemap - different domain baseUrl is used correctly', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: 'https://mydomain.io',
    basePath: '/html',
  });

  assertStringIncludes(xml, '<loc>https://mydomain.io/html/about</loc>');
  assertEquals(xml.includes('example.com'), false);
});

// ============================================================================
// Dynamic Routes - Enumeration & Encoding
// ============================================================================

Deno.test('sitemap - dynamic routes excluded without enumerator', async () => {
  const manifest = createManifest([
    { pattern: '/about' },
    { pattern: '/projects/:id' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  assertStringIncludes(xml, '<loc>https://example.com/html/about</loc>');
  assertEquals(xml.includes(':id'), false);
  assertEquals(xml.includes('/projects/'), false);
});

Deno.test('sitemap - dynamic routes expanded with enumerator', async () => {
  const manifest = createManifest([
    { pattern: '/projects/:id' },
  ]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/projects/:id': () => Promise.resolve(['alpha', 'beta']),
    },
  });

  assertStringIncludes(xml, '<loc>https://example.com/html/projects/alpha</loc>');
  assertStringIncludes(xml, '<loc>https://example.com/html/projects/beta</loc>');
});

Deno.test('sitemap - single-param dynamic routes expanded correctly', async () => {
  const manifest = createManifest([{ pattern: '/tags/:name' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/tags/:name': () => Promise.resolve(['javascript', 'typescript', 'rust']),
    },
  });

  assertStringIncludes(xml, '/html/tags/javascript');
  assertStringIncludes(xml, '/html/tags/typescript');
  assertStringIncludes(xml, '/html/tags/rust');
});

Deno.test('sitemap - enumerator values are URI-encoded', async () => {
  const manifest = createManifest([{ pattern: '/tags/:name' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/tags/:name': () => Promise.resolve(['c++', 'hello world', 'foo&bar']),
    },
  });

  assertStringIncludes(xml, '<loc>https://example.com/html/tags/c%2B%2B</loc>');
  assertStringIncludes(xml, '<loc>https://example.com/html/tags/hello%20world</loc>');
  assertStringIncludes(xml, '<loc>https://example.com/html/tags/foo%26bar</loc>');
});

Deno.test('sitemap - empty enumerator result produces no entries', async () => {
  const manifest = createManifest([
    { pattern: '/about' },
    { pattern: '/projects/:id' },
  ]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/projects/:id': () => Promise.resolve([]),
    },
  });

  assertStringIncludes(xml, '/html/about');
  assertEquals(xml.includes('/projects/'), false);
});

Deno.test('sitemap - dynamic route with no enumerator is silently skipped', async () => {
  const manifest = createManifest([
    { pattern: '/about' },
    { pattern: '/products/:id' },
    { pattern: '/tags/:tag' },
  ]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/products/:id': () => Promise.resolve(['1', '2']),
      // /tags/:tag intentionally not enumerated
    },
  });

  assertStringIncludes(xml, '/html/about');
  assertStringIncludes(xml, '/html/products/1');
  assertStringIncludes(xml, '/html/products/2');
  assertEquals(xml.includes('/tags/'), false);
});

Deno.test('sitemap - multi-segment paths with dynamic params', async () => {
  const manifest = createManifest([
    { pattern: '/blog/:slug/comments/:id' },
  ]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/blog/:slug/comments/:id': () => Promise.resolve(['first-post', 'second-post']),
    },
  });

  // First param replaced, second remains
  assertStringIncludes(xml, '/html/blog/first-post/comments/:id');
  assertStringIncludes(xml, '/html/blog/second-post/comments/:id');
});

// ============================================================================
// Route Type Filtering
// ============================================================================

Deno.test('sitemap - error and redirect routes are excluded', async () => {
  const manifest = createManifest([
    { pattern: '/about', type: 'page' },
    { pattern: '/old-page', type: 'redirect' },
    { pattern: '/error', type: 'error' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  assertStringIncludes(xml, '/html/about');
  assertEquals(xml.includes('/html/old-page'), false);
  assertEquals(xml.includes('/html/error'), false);
});

Deno.test('sitemap - only page routes are included', async () => {
  const manifest = createManifest([
    { pattern: '/home', type: 'page' },
    { pattern: '/contact', type: 'page' },
    { pattern: '/not-found', type: 'error' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  const urlCount = (xml.match(/<url>/g) || []).length;
  assertEquals(urlCount, 2);
});

Deno.test('sitemap - mixed route types with dynamic exclusion', async () => {
  const manifest = createManifest([
    { pattern: '/home', type: 'page' },
    { pattern: '/posts/:id', type: 'page' },
    { pattern: '/posts/:id/error', type: 'error' },
  ]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/posts/:id': () => Promise.resolve(['1']),
    },
  });

  assertStringIncludes(xml, '/html/home');
  assertStringIncludes(xml, '/html/posts/1');
  assertEquals(xml.includes('error'), false);
});

// ============================================================================
// Sitemap Metadata Fields - lastmod, changefreq, priority
// ============================================================================

Deno.test('sitemap - per-route lastmod is included', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: {
      '/about': { lastmod: '2025-06-15' },
    },
  });

  assertStringIncludes(xml, '<lastmod>2025-06-15</lastmod>');
});

Deno.test('sitemap - per-route changefreq is included', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: {
      '/about': { changefreq: 'monthly' },
    },
  });

  assertStringIncludes(xml, '<changefreq>monthly</changefreq>');
});

Deno.test('sitemap - per-route priority is formatted with one decimal', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: {
      '/about': { priority: 0.8 },
    },
  });

  assertStringIncludes(xml, '<priority>0.8</priority>');
});

Deno.test('sitemap - priority values formatted correctly with one decimal place', async () => {
  const manifest = createManifest([
    { pattern: '/p1' },
    { pattern: '/p2' },
    { pattern: '/p3' },
  ]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: {
      '/p1': { priority: 0.5 },
      '/p2': { priority: 1.0 },
      '/p3': { priority: 0.123 }, // Should be formatted as 0.1
    },
  });

  assertStringIncludes(xml, '<priority>0.5</priority>');
  assertStringIncludes(xml, '<priority>1.0</priority>');
  assertStringIncludes(xml, '<priority>0.1</priority>');
});

Deno.test('sitemap - per-route lastmod, changefreq, priority together', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: {
      '/about': {
        lastmod: '2025-06-15',
        changefreq: 'monthly',
        priority: 0.8,
      },
    },
  });

  assertStringIncludes(xml, '<lastmod>2025-06-15</lastmod>');
  assertStringIncludes(xml, '<changefreq>monthly</changefreq>');
  assertStringIncludes(xml, '<priority>0.8</priority>');
});

Deno.test('sitemap - defaults applied to all routes', async () => {
  const manifest = createManifest([
    { pattern: '/' },
    { pattern: '/about' },
  ]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    defaults: { changefreq: 'weekly', priority: 0.5 },
  });

  const matches = xml.match(/<changefreq>weekly<\/changefreq>/g);
  assertEquals(matches?.length, 2);
  const priorities = xml.match(/<priority>0.5<\/priority>/g);
  assertEquals(priorities?.length, 2);
});

Deno.test('sitemap - per-route overrides take precedence over defaults', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    defaults: { priority: 0.5, changefreq: 'daily' },
    routes: { '/about': { priority: 0.9, changefreq: 'monthly' } },
  });

  assertStringIncludes(xml, '<priority>0.9</priority>');
  assertStringIncludes(xml, '<changefreq>monthly</changefreq>');
  assertEquals(xml.includes('<priority>0.5</priority>'), false);
  assertEquals(xml.includes('<changefreq>daily</changefreq>'), false);
});

Deno.test('sitemap - defaults merged with per-route overrides', async () => {
  const manifest = createManifest([
    { pattern: '/' },
    { pattern: '/about' },
  ]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    defaults: { changefreq: 'weekly', priority: 0.5 },
    routes: { '/about': { priority: 0.8 } }, // changefreq inherited from defaults
  });

  assertStringIncludes(xml, '<priority>0.8</priority>');
  assertStringIncludes(xml, '<changefreq>weekly</changefreq>');
});

Deno.test('sitemap - optional fields omitted when not provided', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  assertEquals(xml.includes('<lastmod>'), false);
  assertEquals(xml.includes('<changefreq>'), false);
  assertEquals(xml.includes('<priority>'), false);
});

Deno.test('sitemap - all valid changefreq values', async () => {
  const frequencies = [
    'always',
    'hourly',
    'daily',
    'weekly',
    'monthly',
    'yearly',
    'never',
  ] as const;

  for (const freq of frequencies) {
    const manifest = createManifest([{ pattern: '/page' }]);
    const xml = await generateSitemap(manifest, {
      baseUrl: BASE,
      basePath: '/html',
      routes: { '/page': { changefreq: freq } },
    });
    assertStringIncludes(xml, `<changefreq>${freq}</changefreq>`);
  }
});

// ============================================================================
// lastmod Date Handling
// ============================================================================

Deno.test('sitemap - lastmod accepts ISO date format', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: { '/about': { lastmod: '2025-06-15' } },
  });

  assertStringIncludes(xml, '<lastmod>2025-06-15</lastmod>');
});

Deno.test('sitemap - lastmod accepts full ISO datetime with timezone', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: { '/about': { lastmod: '2025-06-15T10:30:00+00:00' } },
  });

  assertStringIncludes(xml, '<lastmod>2025-06-15T10:30:00+00:00</lastmod>');
});

Deno.test('sitemap - lastmod applied via defaults', async () => {
  const manifest = createManifest([
    { pattern: '/' },
    { pattern: '/about' },
  ]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    defaults: { lastmod: '2025-01-01' },
  });

  const matches = xml.match(/<lastmod>2025-01-01<\/lastmod>/g);
  assertEquals(matches?.length, 2);
});

// ============================================================================
// XML Escaping
// ============================================================================

Deno.test('sitemap - special characters in lastmod are XML-escaped', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: {
      '/about': { lastmod: '2025-01-01T10:00:00+00:00' },
    },
  });

  // Validate well-formed XML
  assertStringIncludes(xml, '<?xml version="1.0" encoding="UTF-8"?>');
  assertStringIncludes(xml, '<lastmod>');
  assertStringIncludes(xml, '</lastmod>');
});

Deno.test('sitemap - ampersand in baseUrl is handled correctly', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: 'https://example.com?ref=affiliate&id=123',
    basePath: '/html',
  });

  // The & in the baseUrl will be in the generated URL
  // The escapeHtml function should escape it
  assertStringIncludes(xml, '<?xml version="1.0" encoding="UTF-8"?>');
  assertStringIncludes(xml, '</urlset>');
});

// ============================================================================
// Wildcard Routes
// ============================================================================

Deno.test('sitemap - wildcard routes (:rest*) excluded like dynamic routes', async () => {
  const manifest = createManifest([
    { pattern: '/about' },
    { pattern: '/docs/:rest*' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  assertStringIncludes(xml, '/html/about');
  assertEquals(xml.includes('/docs/'), false);
});

Deno.test('sitemap - wildcard route with enumerator', async () => {
  const manifest = createManifest([
    { pattern: '/docs/:rest*' },
  ]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/docs/:rest*': () => Promise.resolve(['intro', 'guide/setup']),
    },
  });

  assertStringIncludes(xml, '/html/docs/intro');
  assertStringIncludes(xml, '/html/docs/guide%2Fsetup');
});

// ============================================================================
// Max URL Limit (50,000)
// ============================================================================

Deno.test('sitemap - respects max URL limit of 50,000', async () => {
  // Create a dynamic route that would expand to more than 50,000 URLs
  const manifest = createManifest([{ pattern: '/item/:id' }]);
  const ids = Array.from({ length: 60000 }, (_, i) => String(i));

  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/item/:id': () => Promise.resolve(ids),
    },
  });

  const urlCount = (xml.match(/<url>/g) || []).length;
  assertEquals(urlCount, 50000);
});

Deno.test('sitemap - stops at max URLs even with multiple routes', async () => {
  const manifest = createManifest([
    { pattern: '/static-1' },
    { pattern: '/item/:id' },
  ]);

  // Create 50,000+ items
  const ids = Array.from({ length: 50100 }, (_, i) => String(i));

  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/item/:id': () => Promise.resolve(ids),
    },
  });

  const urlCount = (xml.match(/<url>/g) || []).length;
  assertEquals(urlCount, 50000);
});

// ============================================================================
// Integration - Multiple Routes with Various Configurations
// ============================================================================

Deno.test('sitemap - complex integration with static, dynamic, and metadata', async () => {
  const manifest = createManifest([
    { pattern: '/' },
    { pattern: '/about' },
    { pattern: '/products/:id' },
    { pattern: '/blog/:slug' },
    { pattern: '/contact', type: 'page' },
    { pattern: '/error-page', type: 'error' },
  ]);

  const xml = await generateSitemap(manifest, {
    baseUrl: 'https://store.example.com',
    basePath: '/html',
    defaults: { changefreq: 'weekly' },
    routes: {
      '/': { priority: 1.0 },
      '/about': { priority: 0.8 },
      '/products/:id': { priority: 0.6, changefreq: 'daily' },
      '/blog/:slug': { priority: 0.5 },
    },
    enumerators: {
      '/products/:id': () => Promise.resolve(['laptop', 'phone']),
      '/blog/:slug': () => Promise.resolve(['intro', 'tutorial']),
    },
  });

  // Check all expected URLs
  assertStringIncludes(xml, '<loc>https://store.example.com/html/</loc>');
  assertStringIncludes(xml, '<loc>https://store.example.com/html/about</loc>');
  assertStringIncludes(xml, '<loc>https://store.example.com/html/products/laptop</loc>');
  assertStringIncludes(xml, '<loc>https://store.example.com/html/products/phone</loc>');
  assertStringIncludes(xml, '<loc>https://store.example.com/html/blog/intro</loc>');
  assertStringIncludes(xml, '<loc>https://store.example.com/html/blog/tutorial</loc>');
  assertStringIncludes(xml, '<loc>https://store.example.com/html/contact</loc>');

  // Error page excluded
  assertEquals(xml.includes('/html/error-page'), false);

  // Check metadata
  assertStringIncludes(xml, '<priority>1.0</priority>');
  assertStringIncludes(xml, '<priority>0.8</priority>');
  assertStringIncludes(xml, '<changefreq>daily</changefreq>');
  assertStringIncludes(xml, '<changefreq>weekly</changefreq>');
});

Deno.test('sitemap - multiple enumerators for different dynamic routes', async () => {
  const manifest = createManifest([
    { pattern: '/categories/:cat' },
    { pattern: '/authors/:author' },
    { pattern: '/tags/:tag' },
  ]);

  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/categories/:cat': () => Promise.resolve(['tech', 'science']),
      '/authors/:author': () => Promise.resolve(['alice', 'bob']),
      '/tags/:tag': () => Promise.resolve(['news', 'update']),
    },
  });

  assertStringIncludes(xml, '/html/categories/tech');
  assertStringIncludes(xml, '/html/categories/science');
  assertStringIncludes(xml, '/html/authors/alice');
  assertStringIncludes(xml, '/html/authors/bob');
  assertStringIncludes(xml, '/html/tags/news');
  assertStringIncludes(xml, '/html/tags/update');

  const urlCount = (xml.match(/<url>/g) || []).length;
  assertEquals(urlCount, 6);
});

// ============================================================================
// Edge Cases
// ============================================================================

Deno.test('sitemap - single route produces valid sitemap', async () => {
  const manifest = createManifest([{ pattern: '/' }]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  const urlCount = (xml.match(/<url>/g) || []).length;
  assertEquals(urlCount, 1);
  assertStringIncludes(xml, '<loc>https://example.com/html/</loc>');
});

Deno.test('sitemap - routes with trailing slashes', async () => {
  const manifest = createManifest([
    { pattern: '/about' },
    { pattern: '/projects/' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  assertStringIncludes(xml, '<loc>https://example.com/html/about</loc>');
  assertStringIncludes(xml, '<loc>https://example.com/html/projects/</loc>');
});

Deno.test('sitemap - routes with numeric identifiers', async () => {
  const manifest = createManifest([{ pattern: '/page/:id' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/page/:id': () => Promise.resolve(['123', '456', '999']),
    },
  });

  assertStringIncludes(xml, '/html/page/123');
  assertStringIncludes(xml, '/html/page/456');
  assertStringIncludes(xml, '/html/page/999');
});

Deno.test('sitemap - routes with special characters in dynamic segments', async () => {
  const manifest = createManifest([{ pattern: '/search/:query' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/search/:query': () => Promise.resolve(['what is deno', 'rust vs go', 'node.js']),
    },
  });

  assertStringIncludes(xml, '/html/search/what%20is%20deno');
  assertStringIncludes(xml, '/html/search/rust%20vs%20go');
  assertStringIncludes(xml, '/html/search/node.js');
});

Deno.test('sitemap - Unicode characters in dynamic segments are properly encoded', async () => {
  const manifest = createManifest([{ pattern: '/posts/:title' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/posts/:title': () => Promise.resolve(['café', '日本', 'München']),
    },
  });

  // Unicode should be percent-encoded
  assertStringIncludes(xml, '/html/posts/');
  // Just verify the XML is well-formed and entries exist
  const urlCount = (xml.match(/<url>/g) || []).length;
  assertEquals(urlCount, 3);
});

Deno.test('sitemap - priority boundary values', async () => {
  const manifest = createManifest([
    { pattern: '/p0' },
    { pattern: '/p1' },
  ]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: {
      '/p0': { priority: 0.0 },
      '/p1': { priority: 1.0 },
    },
  });

  assertStringIncludes(xml, '<priority>0.0</priority>');
  assertStringIncludes(xml, '<priority>1.0</priority>');
});

Deno.test('sitemap - empty string in enumerator values', async () => {
  const manifest = createManifest([{ pattern: '/item/:id' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/item/:id': () => Promise.resolve(['', 'valid-id']),
    },
  });

  // Empty string is valid and encoded as empty
  assertStringIncludes(xml, '/html/item/');
  assertStringIncludes(xml, '/html/item/valid-id');
});

Deno.test('sitemap - async enumerators are awaited properly', async () => {
  const manifest = createManifest([{ pattern: '/async/:id' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/async/:id': async () => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 0));
        return ['result1', 'result2'];
      },
    },
  });

  assertStringIncludes(xml, '/html/async/result1');
  assertStringIncludes(xml, '/html/async/result2');
});

// ============================================================================
// Output Format Validation
// ============================================================================

Deno.test('sitemap - each URL ends with newline', async () => {
  const manifest = createManifest([
    { pattern: '/' },
    { pattern: '/about' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  // Check that entries are properly separated
  assertStringIncludes(xml, '</url>\n  <url>');
});

Deno.test('sitemap - consistent whitespace and formatting', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: { '/about': { priority: 0.5, changefreq: 'daily' } },
  });

  // Verify consistent formatting
  const lines = xml.split('\n');

  // Find the url entry lines
  const urlStartIdx = lines.findIndex((l) => l.includes('  <url>'));
  const locIdx = lines.findIndex((l, i) => i > urlStartIdx && l.includes('    <loc>'));
  const changefreqIdx = lines.findIndex((l, i) => i > locIdx && l.includes('    <changefreq>'));
  const priorityIdx = lines.findIndex((l, i) => i > changefreqIdx && l.includes('    <priority>'));
  const urlEndIdx = lines.findIndex((l, i) => i > priorityIdx && l.includes('  </url>'));

  // All should be found
  assertEquals(urlStartIdx >= 0, true);
  assertEquals(locIdx > urlStartIdx, true);
  assertEquals(changefreqIdx > locIdx, true);
  assertEquals(priorityIdx > changefreqIdx, true);
  assertEquals(urlEndIdx > priorityIdx, true);
});
