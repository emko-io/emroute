#!/usr/bin/env -S deno run --allow-read
/**
 * Print sitemap.xml from the browser test fixtures.
 *
 * Usage: deno run --allow-read test/browser/print-sitemap.ts
 */

import { generateRoutesManifest } from '../../tool/route.generator.ts';
import { generateSitemap } from '../../tool/sitemap.generator.ts';
import { denoServerRuntime } from '../../server/server.deno.ts';

const ROUTES_DIR = 'test/browser/fixtures/routes';

const manifest = await generateRoutesManifest(ROUTES_DIR, denoServerRuntime);

const xml = await generateSitemap(manifest, {
  baseUrl: 'https://example.com',
  defaults: { changefreq: 'weekly' },
  routes: {
    '/': { priority: 1.0 },
    '/about': { priority: 0.8, lastmod: '2025-06-15' },
  },
  enumerators: {
    '/projects/:id': () => Promise.resolve(['alpha', 'beta', 'gamma']),
  },
});

console.log(xml);
