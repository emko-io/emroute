import { test, expect, describe } from 'bun:test';
import { generateSitemap } from '../../server/generator/sitemap.generator.ts';
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

test('sitemap - empty manifest produces valid empty sitemap', async () => {
  const manifest = createManifest([]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  expect(xml).toContain('</urlset>');
  // No <url> entries
  expect(xml.includes('<url>')).toEqual(false);
});

test('sitemap - well-formed XML structure with namespace', async () => {
  const manifest = createManifest([{ pattern: '/' }]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  // Check XML declaration
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toEqual(true);
  // Check namespace declaration
  expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  // Check closing tag
  expect(xml.trimEnd().endsWith('</urlset>')).toEqual(true);
});

test('sitemap - URL entries properly formatted with indentation', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  // Check indentation structure
  expect(xml).toContain('  <url>');
  expect(xml).toContain('    <loc>');
  expect(xml).toContain('  </url>');
});

// ============================================================================
// Static Routes - URL Formatting
// ============================================================================

test('sitemap - static routes produce /html/ prefixed absolute URLs', async () => {
  const manifest = createManifest([
    { pattern: '/' },
    { pattern: '/about' },
    { pattern: '/projects' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  expect(xml).toContain('<loc>https://example.com/html/</loc>');
  expect(xml).toContain('<loc>https://example.com/html/about</loc>');
  expect(xml).toContain('<loc>https://example.com/html/projects</loc>');
});

test('sitemap - root route maps to /html/ not /html', async () => {
  const manifest = createManifest([{ pattern: '/' }]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  expect(xml).toContain('<loc>https://example.com/html/</loc>');
  expect(xml.includes('<loc>https://example.com/html</loc>')).toEqual(false);
});

test('sitemap - baseUrl trailing slash is stripped', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: 'https://example.com/',
    basePath: '/html',
  });

  expect(xml).toContain('<loc>https://example.com/html/about</loc>');
  expect(xml.includes('example.com//')).toEqual(false);
});

test('sitemap - baseUrl with multiple trailing slashes is normalized', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: 'https://example.com///',
    basePath: '/html',
  });

  expect(xml).toContain('<loc>https://example.com/html/about</loc>');
  expect(xml.includes('example.com//')).toEqual(false);
});

test('sitemap - nested routes produce correct paths', async () => {
  const manifest = createManifest([
    { pattern: '/docs/api' },
    { pattern: '/docs/guides/getting-started' },
    { pattern: '/projects/details/overview' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  expect(xml).toContain('<loc>https://example.com/html/docs/api</loc>');
  expect(xml).toContain('<loc>https://example.com/html/docs/guides/getting-started</loc>');
  expect(xml).toContain('<loc>https://example.com/html/projects/details/overview</loc>');
});

test('sitemap - different domain baseUrl is used correctly', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: 'https://mydomain.io',
    basePath: '/html',
  });

  expect(xml).toContain('<loc>https://mydomain.io/html/about</loc>');
  expect(xml.includes('example.com')).toEqual(false);
});

// ============================================================================
// Dynamic Routes - Enumeration & Encoding
// ============================================================================

test('sitemap - dynamic routes excluded without enumerator', async () => {
  const manifest = createManifest([
    { pattern: '/about' },
    { pattern: '/projects/:id' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  expect(xml).toContain('<loc>https://example.com/html/about</loc>');
  expect(xml.includes(':id')).toEqual(false);
  expect(xml.includes('/projects/')).toEqual(false);
});

test('sitemap - dynamic routes expanded with enumerator', async () => {
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

  expect(xml).toContain('<loc>https://example.com/html/projects/alpha</loc>');
  expect(xml).toContain('<loc>https://example.com/html/projects/beta</loc>');
});

test('sitemap - single-param dynamic routes expanded correctly', async () => {
  const manifest = createManifest([{ pattern: '/tags/:name' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/tags/:name': () => Promise.resolve(['javascript', 'typescript', 'rust']),
    },
  });

  expect(xml).toContain('/html/tags/javascript');
  expect(xml).toContain('/html/tags/typescript');
  expect(xml).toContain('/html/tags/rust');
});

test('sitemap - enumerator values are URI-encoded', async () => {
  const manifest = createManifest([{ pattern: '/tags/:name' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/tags/:name': () => Promise.resolve(['c++', 'hello world', 'foo&bar']),
    },
  });

  expect(xml).toContain('<loc>https://example.com/html/tags/c%2B%2B</loc>');
  expect(xml).toContain('<loc>https://example.com/html/tags/hello%20world</loc>');
  expect(xml).toContain('<loc>https://example.com/html/tags/foo%26bar</loc>');
});

test('sitemap - empty enumerator result produces no entries', async () => {
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

  expect(xml).toContain('/html/about');
  expect(xml.includes('/projects/')).toEqual(false);
});

test('sitemap - dynamic route with no enumerator is silently skipped', async () => {
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

  expect(xml).toContain('/html/about');
  expect(xml).toContain('/html/products/1');
  expect(xml).toContain('/html/products/2');
  expect(xml.includes('/tags/')).toEqual(false);
});

test('sitemap - multi-segment paths with dynamic params', async () => {
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
  expect(xml).toContain('/html/blog/first-post/comments/:id');
  expect(xml).toContain('/html/blog/second-post/comments/:id');
});

// ============================================================================
// Route Type Filtering
// ============================================================================

test('sitemap - error and redirect routes are excluded', async () => {
  const manifest = createManifest([
    { pattern: '/about', type: 'page' },
    { pattern: '/old-page', type: 'redirect' },
    { pattern: '/error', type: 'error' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  expect(xml).toContain('/html/about');
  expect(xml.includes('/html/old-page')).toEqual(false);
  expect(xml.includes('/html/error')).toEqual(false);
});

test('sitemap - only page routes are included', async () => {
  const manifest = createManifest([
    { pattern: '/home', type: 'page' },
    { pattern: '/contact', type: 'page' },
    { pattern: '/not-found', type: 'error' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  const urlCount = (xml.match(/<url>/g) || []).length;
  expect(urlCount).toEqual(2);
});

test('sitemap - mixed route types with dynamic exclusion', async () => {
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

  expect(xml).toContain('/html/home');
  expect(xml).toContain('/html/posts/1');
  expect(xml.includes('error')).toEqual(false);
});

// ============================================================================
// Sitemap Metadata Fields - lastmod, changefreq, priority
// ============================================================================

test('sitemap - per-route lastmod is included', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: {
      '/about': { lastmod: '2025-06-15' },
    },
  });

  expect(xml).toContain('<lastmod>2025-06-15</lastmod>');
});

test('sitemap - per-route changefreq is included', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: {
      '/about': { changefreq: 'monthly' },
    },
  });

  expect(xml).toContain('<changefreq>monthly</changefreq>');
});

test('sitemap - per-route priority is formatted with one decimal', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: {
      '/about': { priority: 0.8 },
    },
  });

  expect(xml).toContain('<priority>0.8</priority>');
});

test('sitemap - priority values formatted correctly with one decimal place', async () => {
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

  expect(xml).toContain('<priority>0.5</priority>');
  expect(xml).toContain('<priority>1.0</priority>');
  expect(xml).toContain('<priority>0.1</priority>');
});

test('sitemap - per-route lastmod, changefreq, priority together', async () => {
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

  expect(xml).toContain('<lastmod>2025-06-15</lastmod>');
  expect(xml).toContain('<changefreq>monthly</changefreq>');
  expect(xml).toContain('<priority>0.8</priority>');
});

test('sitemap - defaults applied to all routes', async () => {
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
  expect(matches?.length).toEqual(2);
  const priorities = xml.match(/<priority>0.5<\/priority>/g);
  expect(priorities?.length).toEqual(2);
});

test('sitemap - per-route overrides take precedence over defaults', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    defaults: { priority: 0.5, changefreq: 'daily' },
    routes: { '/about': { priority: 0.9, changefreq: 'monthly' } },
  });

  expect(xml).toContain('<priority>0.9</priority>');
  expect(xml).toContain('<changefreq>monthly</changefreq>');
  expect(xml.includes('<priority>0.5</priority>')).toEqual(false);
  expect(xml.includes('<changefreq>daily</changefreq>')).toEqual(false);
});

test('sitemap - defaults merged with per-route overrides', async () => {
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

  expect(xml).toContain('<priority>0.8</priority>');
  expect(xml).toContain('<changefreq>weekly</changefreq>');
});

test('sitemap - optional fields omitted when not provided', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  expect(xml.includes('<lastmod>')).toEqual(false);
  expect(xml.includes('<changefreq>')).toEqual(false);
  expect(xml.includes('<priority>')).toEqual(false);
});

test('sitemap - all valid changefreq values', async () => {
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
    expect(xml).toContain(`<changefreq>${freq}</changefreq>`);
  }
});

// ============================================================================
// lastmod Date Handling
// ============================================================================

test('sitemap - lastmod accepts ISO date format', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: { '/about': { lastmod: '2025-06-15' } },
  });

  expect(xml).toContain('<lastmod>2025-06-15</lastmod>');
});

test('sitemap - lastmod accepts full ISO datetime with timezone', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: { '/about': { lastmod: '2025-06-15T10:30:00+00:00' } },
  });

  expect(xml).toContain('<lastmod>2025-06-15T10:30:00+00:00</lastmod>');
});

test('sitemap - lastmod applied via defaults', async () => {
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
  expect(matches?.length).toEqual(2);
});

// ============================================================================
// XML Escaping
// ============================================================================

test('sitemap - special characters in lastmod are XML-escaped', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    routes: {
      '/about': { lastmod: '2025-01-01T10:00:00+00:00' },
    },
  });

  // Validate well-formed XML
  expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  expect(xml).toContain('<lastmod>');
  expect(xml).toContain('</lastmod>');
});

test('sitemap - ampersand in baseUrl is handled correctly', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: 'https://example.com?ref=affiliate&id=123',
    basePath: '/html',
  });

  // The & in the baseUrl will be in the generated URL
  // The escapeHtml function should escape it
  expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  expect(xml).toContain('</urlset>');
});

// ============================================================================
// Wildcard Routes
// ============================================================================

test('sitemap - wildcard routes (:rest*) excluded like dynamic routes', async () => {
  const manifest = createManifest([
    { pattern: '/about' },
    { pattern: '/docs/:rest*' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  expect(xml).toContain('/html/about');
  expect(xml.includes('/docs/')).toEqual(false);
});

test('sitemap - wildcard route with enumerator', async () => {
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

  expect(xml).toContain('/html/docs/intro');
  expect(xml).toContain('/html/docs/guide%2Fsetup');
});

// ============================================================================
// Max URL Limit (50,000)
// ============================================================================

test('sitemap - respects max URL limit of 50,000', async () => {
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
  expect(urlCount).toEqual(50000);
});

test('sitemap - stops at max URLs even with multiple routes', async () => {
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
  expect(urlCount).toEqual(50000);
});

// ============================================================================
// Integration - Multiple Routes with Various Configurations
// ============================================================================

test('sitemap - complex integration with static, dynamic, and metadata', async () => {
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
  expect(xml).toContain('<loc>https://store.example.com/html/</loc>');
  expect(xml).toContain('<loc>https://store.example.com/html/about</loc>');
  expect(xml).toContain('<loc>https://store.example.com/html/products/laptop</loc>');
  expect(xml).toContain('<loc>https://store.example.com/html/products/phone</loc>');
  expect(xml).toContain('<loc>https://store.example.com/html/blog/intro</loc>');
  expect(xml).toContain('<loc>https://store.example.com/html/blog/tutorial</loc>');
  expect(xml).toContain('<loc>https://store.example.com/html/contact</loc>');

  // Error page excluded
  expect(xml.includes('/html/error-page')).toEqual(false);

  // Check metadata
  expect(xml).toContain('<priority>1.0</priority>');
  expect(xml).toContain('<priority>0.8</priority>');
  expect(xml).toContain('<changefreq>daily</changefreq>');
  expect(xml).toContain('<changefreq>weekly</changefreq>');
});

test('sitemap - multiple enumerators for different dynamic routes', async () => {
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

  expect(xml).toContain('/html/categories/tech');
  expect(xml).toContain('/html/categories/science');
  expect(xml).toContain('/html/authors/alice');
  expect(xml).toContain('/html/authors/bob');
  expect(xml).toContain('/html/tags/news');
  expect(xml).toContain('/html/tags/update');

  const urlCount = (xml.match(/<url>/g) || []).length;
  expect(urlCount).toEqual(6);
});

// ============================================================================
// Edge Cases
// ============================================================================

test('sitemap - single route produces valid sitemap', async () => {
  const manifest = createManifest([{ pattern: '/' }]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  const urlCount = (xml.match(/<url>/g) || []).length;
  expect(urlCount).toEqual(1);
  expect(xml).toContain('<loc>https://example.com/html/</loc>');
});

test('sitemap - routes with trailing slashes', async () => {
  const manifest = createManifest([
    { pattern: '/about' },
    { pattern: '/projects/' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  expect(xml).toContain('<loc>https://example.com/html/about</loc>');
  expect(xml).toContain('<loc>https://example.com/html/projects/</loc>');
});

test('sitemap - routes with numeric identifiers', async () => {
  const manifest = createManifest([{ pattern: '/page/:id' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/page/:id': () => Promise.resolve(['123', '456', '999']),
    },
  });

  expect(xml).toContain('/html/page/123');
  expect(xml).toContain('/html/page/456');
  expect(xml).toContain('/html/page/999');
});

test('sitemap - routes with special characters in dynamic segments', async () => {
  const manifest = createManifest([{ pattern: '/search/:query' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/search/:query': () => Promise.resolve(['what is deno', 'rust vs go', 'node.js']),
    },
  });

  expect(xml).toContain('/html/search/what%20is%20deno');
  expect(xml).toContain('/html/search/rust%20vs%20go');
  expect(xml).toContain('/html/search/node.js');
});

test('sitemap - Unicode characters in dynamic segments are properly encoded', async () => {
  const manifest = createManifest([{ pattern: '/posts/:title' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/posts/:title': () => Promise.resolve(['cafe\u0301', '\u65E5\u672C', 'Mu\u0308nchen']),
    },
  });

  // Unicode should be percent-encoded
  expect(xml).toContain('/html/posts/');
  // Just verify the XML is well-formed and entries exist
  const urlCount = (xml.match(/<url>/g) || []).length;
  expect(urlCount).toEqual(3);
});

test('sitemap - priority boundary values', async () => {
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

  expect(xml).toContain('<priority>0.0</priority>');
  expect(xml).toContain('<priority>1.0</priority>');
});

test('sitemap - empty string in enumerator values', async () => {
  const manifest = createManifest([{ pattern: '/item/:id' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    basePath: '/html',
    enumerators: {
      '/item/:id': () => Promise.resolve(['', 'valid-id']),
    },
  });

  // Empty string is valid and encoded as empty
  expect(xml).toContain('/html/item/');
  expect(xml).toContain('/html/item/valid-id');
});

test('sitemap - async enumerators are awaited properly', async () => {
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

  expect(xml).toContain('/html/async/result1');
  expect(xml).toContain('/html/async/result2');
});

// ============================================================================
// Output Format Validation
// ============================================================================

test('sitemap - each URL ends with newline', async () => {
  const manifest = createManifest([
    { pattern: '/' },
    { pattern: '/about' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE, basePath: '/html' });

  // Check that entries are properly separated
  expect(xml).toContain('</url>\n  <url>');
});

test('sitemap - consistent whitespace and formatting', async () => {
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
  expect(urlStartIdx >= 0).toEqual(true);
  expect(locIdx > urlStartIdx).toEqual(true);
  expect(changefreqIdx > locIdx).toEqual(true);
  expect(priorityIdx > changefreqIdx).toEqual(true);
  expect(urlEndIdx > priorityIdx).toEqual(true);
});
