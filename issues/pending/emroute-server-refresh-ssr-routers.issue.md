# emroute server needs a way to refresh SSR routers after adding routes

## Problem

`createEmrouteServer()` builds the routes manifest and SSR routers once at
startup. When new pages are written to the runtime at runtime (e.g. via
`runtime.command('/routes/new.page.md', { body })` followed by
`runtime.invalidateManifests()`), the manifest cache is cleared but the SSR
routers still hold the old snapshot of routes. New pages return 404 on
`/html/*` and `/md/*`.

The only workaround is to call `createEmrouteServer()` again, which
re-initialises everything (manifest scanning, widget imports, bundling).
This is wasteful and blocks the request while rebundling.

## Expected behaviour

The returned server object should expose a method to refresh routes:

```ts
const emroute = await createEmrouteServer(config, runtime);

// After writing a new page:
await runtime.command('/routes/new.page.md', { body: content });
runtime.invalidateManifests();
await emroute.refresh(); // re-scans manifest, rebuilds SSR routers
```

`refresh()` should:
1. Re-read the routes manifest from the runtime (which triggers a fresh scan
   since manifests were invalidated)
2. Rebuild the SSR HTML and MD routers with the new manifest
3. Optionally re-import new widget modules
4. NOT re-bundle (the SPA bundle is stale but that's acceptable — SSR serves
   the new page immediately)

## Use case

Dynamic page creation from the browser. A Hono API endpoint writes markdown
to the SQLite runtime and needs the new page to be SSR-renderable immediately.

## Current workaround

Full page reload using `window.location.href` (bypasses the stale SPA router)
combined with re-calling `createEmrouteServer()` on every write (expensive).
