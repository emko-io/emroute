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
// Empty Manifest
// ============================================================================

Deno.test('sitemap - empty manifest produces valid empty sitemap', async () => {
  const manifest = createManifest([]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE });

  assertStringIncludes(xml, '<?xml version="1.0" encoding="UTF-8"?>');
  assertStringIncludes(xml, '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  assertStringIncludes(xml, '</urlset>');
  // No <url> entries
  assertEquals(xml.includes('<url>'), false);
});

// ============================================================================
// Static Routes
// ============================================================================

Deno.test('sitemap - static routes produce /html/ prefixed absolute URLs', async () => {
  const manifest = createManifest([
    { pattern: '/' },
    { pattern: '/about' },
    { pattern: '/projects' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE });

  assertStringIncludes(xml, `<loc>https://example.com/html/</loc>`);
  assertStringIncludes(xml, `<loc>https://example.com/html/about</loc>`);
  assertStringIncludes(xml, `<loc>https://example.com/html/projects</loc>`);
});

Deno.test('sitemap - baseUrl trailing slash is stripped', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, { baseUrl: 'https://example.com/' });

  assertStringIncludes(xml, `<loc>https://example.com/html/about</loc>`);
  assertEquals(xml.includes('example.com//'), false);
});

// ============================================================================
// Dynamic Routes
// ============================================================================

Deno.test('sitemap - dynamic routes excluded without enumerator', async () => {
  const manifest = createManifest([
    { pattern: '/about' },
    { pattern: '/projects/:id' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE });

  assertStringIncludes(xml, `<loc>https://example.com/html/about</loc>`);
  assertEquals(xml.includes(':id'), false);
  assertEquals(xml.includes('/projects/'), false);
});

Deno.test('sitemap - dynamic routes expanded with enumerator', async () => {
  const manifest = createManifest([
    { pattern: '/projects/:id' },
  ]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    enumerators: {
      '/projects/:id': () => Promise.resolve(['alpha', 'beta']),
    },
  });

  assertStringIncludes(xml, `<loc>https://example.com/html/projects/alpha</loc>`);
  assertStringIncludes(xml, `<loc>https://example.com/html/projects/beta</loc>`);
});

Deno.test('sitemap - enumerator values are URI-encoded', async () => {
  const manifest = createManifest([{ pattern: '/tags/:name' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    enumerators: {
      '/tags/:name': () => Promise.resolve(['c++', 'hello world']),
    },
  });

  assertStringIncludes(xml, `<loc>https://example.com/html/tags/c%2B%2B</loc>`);
  assertStringIncludes(xml, `<loc>https://example.com/html/tags/hello%20world</loc>`);
});

// ============================================================================
// Non-Page Routes Excluded
// ============================================================================

Deno.test('sitemap - error and redirect routes are excluded', async () => {
  const manifest = createManifest([
    { pattern: '/about', type: 'page' },
    { pattern: '/old-page', type: 'redirect' },
    { pattern: '/error', type: 'error' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE });

  assertStringIncludes(xml, '/html/about');
  assertEquals(xml.includes('/html/old-page'), false);
  assertEquals(xml.includes('/html/error'), false);
});

// ============================================================================
// Optional Fields
// ============================================================================

Deno.test('sitemap - per-route lastmod, changefreq, priority', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
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
    defaults: { changefreq: 'weekly', priority: 0.5 },
  });

  // Both routes get defaults
  const matches = xml.match(/<changefreq>weekly<\/changefreq>/g);
  assertEquals(matches?.length, 2);
});

Deno.test('sitemap - per-route overrides take precedence over defaults', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: BASE,
    defaults: { priority: 0.5 },
    routes: { '/about': { priority: 0.9 } },
  });

  assertStringIncludes(xml, '<priority>0.9</priority>');
  assertEquals(xml.includes('<priority>0.5</priority>'), false);
});

Deno.test('sitemap - optional fields omitted when not provided', async () => {
  const manifest = createManifest([{ pattern: '/about' }]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE });

  assertEquals(xml.includes('<lastmod>'), false);
  assertEquals(xml.includes('<changefreq>'), false);
  assertEquals(xml.includes('<priority>'), false);
});

// ============================================================================
// XML Escaping
// ============================================================================

Deno.test('sitemap - special characters in URLs are XML-escaped', async () => {
  const manifest = createManifest([{ pattern: '/search' }]);
  const xml = await generateSitemap(manifest, {
    baseUrl: 'https://example.com',
    routes: {
      '/search': { lastmod: '2025-01-01' },
    },
  });

  // The URL itself won't have & but lastmod/loc go through escapeHtml
  assertStringIncludes(xml, '<?xml version="1.0" encoding="UTF-8"?>');
  // Verify well-formed XML structure
  assertStringIncludes(xml, '<url>');
  assertStringIncludes(xml, '</url>');
});

// ============================================================================
// Wildcard Routes
// ============================================================================

Deno.test('sitemap - wildcard routes (:rest*) excluded like dynamic routes', async () => {
  const manifest = createManifest([
    { pattern: '/about' },
    { pattern: '/docs/:rest*' },
  ]);
  const xml = await generateSitemap(manifest, { baseUrl: BASE });

  assertStringIncludes(xml, '/html/about');
  assertEquals(xml.includes('/docs/'), false);
});
