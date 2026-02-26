# Runtime should auto-invalidate manifests on write

## Problem

`mergeModules()` (in `buildClientBundles`) writes the route and widget manifests
as physical files to the runtime at `/routes.manifest.json` and
`/widgets.manifest.json`. When new pages are written at runtime via
`runtime.command('/routes/new.page.md', { body })`, calling
`runtime.invalidateManifests()` only clears the in-memory cache — the stored
manifest file in SQLite still exists, so the next read returns the stale version
instead of triggering a fresh `resolveRoutesManifest()` scan.

The server itself doesn't snapshot — it reads from the runtime on each
`createEmrouteServer()` call. The issue is purely that the stored manifest file
shadows the scan.

## Expected behaviour

`runtime.command()` should detect writes under `routesDir/` or `widgetsDir/`
and automatically:
1. Delete the stored manifest file (if any)
2. Clear the in-memory manifest cache

This way the next `query('/routes.manifest.json')` triggers a fresh scan that
includes the new page.

## Current workaround

Consumer manually deletes the stored manifest files and calls
`invalidateManifests()` before re-creating the server:

```ts
runtime.deleteFile('/routes.manifest.json');
runtime.deleteFile('/widgets.manifest.json');
runtime.invalidateManifests();
emroute = await createEmrouteServer(serverConfig, runtime);
```

## Affected version

`@emkodev/emroute@1.6.6-beta.5`
