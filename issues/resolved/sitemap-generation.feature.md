Generate sitemap.xml from route manifest

**Status**: Complete — implemented in beta.13 as opt-in `@emkodev/emroute/sitemap` submodule.

## Resolution

Sitemap generation is a pure function over `RoutesManifest` — no filesystem
access needed. The consumer imports `generateSitemap` and calls it with the
manifest and a `baseUrl`.

### Open questions resolved

- **lastmod** — provided by the consumer via `SitemapOptions.routes` or
  `.defaults`, not derived from file mtime. This keeps the generator pure and
  avoids expanding the `FileSystem` interface.
- **priority/changefreq configurable per route** — yes, via `SitemapOptions.routes`
  keyed by pattern. Defaults are set via `SitemapOptions.defaults`.
- **Dynamic route enumeration** — build-time. Optional async enumerators keyed by
  pattern in `SitemapOptions.enumerators`. Dynamic routes without an enumerator
  are excluded.

### Implementation

| File | Purpose |
| --- | --- |
| `tool/sitemap.generator.ts` | Core generator + types, exported as `@emkodev/emroute/sitemap` |
| `test/unit/sitemap.generator.test.ts` | 13 unit tests |
| `test/browser/print-sitemap.ts` | Manual test script against browser fixtures |

### Design

- Static routes (no `:param`) → `/html/{pattern}` absolute URLs
- Dynamic routes → expanded via enumerator or excluded
- All four protocol fields supported: `<loc>` (required), `<lastmod>`,
  `<changefreq>`, `<priority>` (optional)
- XML entity escaping reuses existing `escapeHtml` (covers all 5 XML entities)
- 50,000 URL cap per sitemaps.org protocol

Reference: https://www.sitemaps.org/protocol.html
