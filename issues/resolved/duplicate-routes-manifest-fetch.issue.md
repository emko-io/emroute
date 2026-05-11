# Routes manifest fetched twice during SPA boot

## Problem

`bootEmrouteApp()` fetches `routes.manifest.json` twice during SPA initialization:

1. **First fetch** — `bootEmrouteApp()` calls `runtime.handle(ROUTES_MANIFEST_PATH)` to parse the route tree
2. **Second fetch** — `Emroute.create()` calls `runtime.query(ROUTES_MANIFEST_PATH)` as a verification check (only checks status code, discards the body)

The second fetch is defensive code for multi-context support (SSR where manifest might not exist yet). In the SPA flow, the manifest always exists on disk, so the verification fetch is redundant.

## Where

- `renderer/spa/emroute.app.ts` — `bootEmrouteApp()` fetches and parses the manifest
- `core/server/emroute.server.ts` — `Emroute.create()` fetches it again to verify existence

## Possible fixes

1. Pass the already-fetched manifest response or parsed route tree into `Emroute.create()` so it skips the verification fetch
2. Cache responses in `FetchRuntime` so the second fetch is a no-op
3. Skip the existence check when `routeTree` is already provided and valid

## Impact

Extra network round-trip on every full page load (~1KB, visible in devtools as a duplicate request).
