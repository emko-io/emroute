/**
 * Sitemap Generator — Opt-in Submodule
 *
 * Generates sitemap.xml from a RoutesManifest. Pure function over manifest data,
 * no filesystem access needed.
 *
 * Usage:
 *   import { generateSitemap } from '@emkodev/emroute/sitemap';
 *   const xml = await generateSitemap(manifest, { baseUrl: 'https://example.com' });
 *
 * Per sitemaps.org protocol:
 * - <loc> is required (full absolute URL)
 * - <lastmod>, <changefreq>, <priority> are optional
 * - URLs use route patterns as-is (patterns include basePath when present)
 * - Max 50,000 URLs per sitemap file
 *
 * @see https://www.sitemaps.org/protocol.html
 */

import { escapeHtml } from '../src/util/html.util.ts';
import type { RoutesManifest } from '../src/type/route.type.ts';

/** Valid changefreq values per sitemaps.org protocol. */
export type Changefreq =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never';

/** Per-route sitemap overrides. */
export interface SitemapRouteOptions {
  /** W3C Datetime, e.g. '2025-06-15' or '2025-06-15T10:30:00+00:00' */
  lastmod?: string;
  changefreq?: Changefreq;
  /** 0.0–1.0, default 0.5 per protocol */
  priority?: number;
}

/** Options for sitemap generation. */
export interface SitemapOptions {
  /** Site origin with protocol, e.g. 'https://example.com'. No trailing slash. */
  baseUrl: string;

  /** Per-route overrides keyed by route pattern (including basePath if present). */
  routes?: Record<string, SitemapRouteOptions>;

  /** Defaults applied when a route has no specific override. */
  defaults?: SitemapRouteOptions;

  /**
   * Enumerators for dynamic routes. Keyed by route pattern (e.g. '/html/projects/:id').
   * Each function returns concrete path segments to substitute for the parameter.
   * Dynamic routes without an enumerator are excluded from the sitemap.
   */
  enumerators?: Record<string, () => Promise<string[]>>;

  /**
   * Base path to prepend to patterns when manifest contains bare patterns.
   * When the manifest already has prefixed patterns (e.g. from generateManifestCode),
   * leave this unset.
   */
  basePath?: string;
}

/** A resolved URL entry before XML serialization. */
interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: Changefreq;
  priority?: number;
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';
const URLSET_OPEN = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
const URLSET_CLOSE = '</urlset>';
const MAX_URLS = 50_000;

/** Check if a route pattern contains dynamic segments. */
function isDynamic(pattern: string): boolean {
  return pattern.includes(':');
}

/** Build the absolute URL for a route path. */
function buildLoc(baseUrl: string, path: string, basePath = ''): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (path === '/' && basePath) return `${base}${basePath}/`;
  return `${base}${basePath}${path}`;
}

/**
 * Expand a dynamic pattern using an enumerator's param values.
 * Supports single-param patterns like '/projects/:id'.
 * Multi-param patterns are expanded per value (first param replaced).
 */
function expandDynamic(pattern: string, values: string[]): string[] {
  // Find the first :param segment
  const paramMatch = pattern.match(/:([^/]+)/);
  if (!paramMatch) return [];

  return values.map((value) => pattern.replace(paramMatch[0], encodeURIComponent(value)));
}

/** Resolve route options: per-route override > defaults > empty. */
function resolveOptions(
  pattern: string,
  options: SitemapOptions,
): SitemapRouteOptions {
  return { ...options.defaults, ...options.routes?.[pattern] };
}

/** Serialize a single <url> entry. */
function serializeEntry(entry: SitemapEntry): string {
  const lines = [`  <url>`, `    <loc>${escapeHtml(entry.loc)}</loc>`];

  if (entry.lastmod !== undefined) {
    lines.push(`    <lastmod>${escapeHtml(entry.lastmod)}</lastmod>`);
  }
  if (entry.changefreq !== undefined) {
    lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
  }
  if (entry.priority !== undefined) {
    lines.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
  }

  lines.push(`  </url>`);
  return lines.join('\n');
}

/**
 * Generate sitemap.xml content from a routes manifest.
 *
 * Static routes (no :param) are included directly.
 * Dynamic routes are included only if an enumerator is provided.
 * All URLs point to /html/ prefixed paths for SSR HTML rendering.
 */
export async function generateSitemap(
  manifest: RoutesManifest,
  options: SitemapOptions,
): Promise<string> {
  const entries: SitemapEntry[] = [];
  const bp = options.basePath ?? '';

  // Filter to page routes only (exclude error, redirect)
  const pages = manifest.routes.filter((r) => r.type === 'page');

  for (const route of pages) {
    const routeOpts = resolveOptions(route.pattern, options);

    if (isDynamic(route.pattern)) {
      // Dynamic route — use enumerator if provided, skip otherwise
      const enumerator = options.enumerators?.[route.pattern];
      if (!enumerator) continue;

      const values = await enumerator();
      const paths = expandDynamic(route.pattern, values);

      for (const path of paths) {
        entries.push({
          loc: buildLoc(options.baseUrl, path, bp),
          ...routeOpts,
        });
      }
    } else {
      // Static route — include directly
      entries.push({
        loc: buildLoc(options.baseUrl, route.pattern, bp),
        ...routeOpts,
      });
    }

    if (entries.length >= MAX_URLS) break;
  }

  const urlEntries = entries.slice(0, MAX_URLS).map(serializeEntry).join('\n');

  return `${XML_HEADER}\n${URLSET_OPEN}\n${urlEntries}\n${URLSET_CLOSE}\n`;
}
