#!/usr/bin/env bun
/**
 * Print sitemap.xml from the browser test fixtures.
 *
 * Usage: bun test/browser/print-sitemap.ts
 */

import { generateRoutesManifest } from '../../server/scanner.util.ts';
import { generateSitemap } from '../../runtime/sitemap.generator.ts';
import { BunFsRuntime } from '../../runtime/bun/fs/bun-fs.runtime.ts';

const runtime = new BunFsRuntime('test/browser/fixtures');

const manifest = await generateRoutesManifest('/routes', runtime);

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
