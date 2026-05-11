# Static files served without Cache-Control headers

## Problem

`BunFsRuntime.read()` only sets `Content-Type`, `Content-Length`, and `Last-Modified` headers on static file responses. No `Cache-Control` or `ETag` headers are set.

Without explicit cache directives, browsers use heuristic freshness and must revalidate on every navigation. This means widget JS, manifest JSON, vendor bundles, CSS, and all other static assets are re-fetched on every page load.

## Where

`runtime/bun/fs/bun-fs.runtime.ts` — the `read()` method (around line 95):

```typescript
const headers: HeadersInit = {
  'Content-Type': CONTENT_TYPES.get(ext) ?? 'application/octet-stream',
  'Content-Length': content.byteLength.toString(),
};
if (info.mtime) {
  headers['Last-Modified'] = info.mtime.toUTCString();
}
```

## Expected

Static file responses should include appropriate `Cache-Control` headers. Suggested strategy:

- **Manifests** (`*.manifest.json`): `no-cache, must-revalidate` — always revalidate since they change on rebuild
- **Widget/route JS, vendor bundles**: `public, max-age=86400` or use content-hashed filenames with immutable cache
- **HTML shell** (`index.html`): `no-cache`

An `ETag` based on file content hash would also enable efficient conditional requests (304 responses).

## Impact

Every SPA navigation re-downloads all widget JS and manifest files from scratch instead of serving from browser cache.

## Workaround

Subclass `BunFsRuntime` and override `handle()` to add headers after calling `super.handle()`. Since `handle()` returns a standard `Response`, headers can be set via `new Response(response.body, response)` before returning.
