# On-the-fly TypeScript transpilation

**Status:** In Progress
**Branch:** `feat/on-the-fly-transpilation`

## Problem

Two production bugs and one DX pain point stem from the same root cause — the
Runtime serves raw `.ts` to browsers and caches stale modules via `import()`:

1. **Stale modules after CMS writes.** `runtime.command()` writes an updated
   `.ts`/`.js` file and invalidates the manifest. But `BunFsRuntime.loadModule()`
   uses Bun's `import()` which caches by file path. The next SSR request renders
   the old module. This is a **production correctness bug** for any app where
   modules change at runtime (CMS, admin panels, CRUD APIs).

2. **Browsers can't run `.ts`.** Manifests reference `.ts` paths. When the
   browser fetches a module, the server returns raw TypeScript with
   `text/typescript` content type. `buildClientBundles()` exists solely to
   pre-transpile `.ts` → `.js` and rewrite manifest paths — an entire build step
   to paper over what the Runtime should handle natively.

3. **Dev reload pain.** Developers edit `.ts` files on disk (bypassing
   `runtime.command()`). Both manifests and modules go stale. The workaround is
   deleting manifest files and restarting the server after every change.

## Solution

Two changes to `BunFsRuntime`, both using capabilities that already exist on the
Runtime abstract class (`transpile()`, `loadModule()`):

### 1. `loadModule()` — blob-URL import

Read the file as text, transpile if `.ts`, import via a unique blob URL.
Each blob URL is distinct, so Bun's module cache is never hit. The module
always reflects the current file on disk (or the latest `command()` write).

This is the same pattern FetchRuntime and CacheRuntime already use — they
can't import by file path, so they use blob URLs. We apply it server-side
for correctness.

```ts
override async loadModule(path: string): Promise<unknown> {
  let source = await Bun.file(this.root + path).text();
  if (path.endsWith('.ts')) source = await this.transpile(source);
  const blob = new Blob([source], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  try { return await import(url); }
  finally { URL.revokeObjectURL(url); }
}
```

### 2. `read()` — serve `.ts` as transpiled JavaScript

When a `.ts` file is requested via `handle()`/`query()`, intercept the
response: read the source, transpile, discover and inline companion files
(`.html`, `.md`, `.css`) as `export const __files = { ... }`, and serve as
`application/javascript`.

This makes `buildClientBundles()` an optional production optimization (do
the work once) rather than a correctness requirement.

## What becomes optional

- **`buildClientBundles()` module merging** — the server now serves the same
  output on the fly. Pre-building is a perf optimization for production.
- **Manual manifest deletion** — manifests are always re-scanned from source
  `.ts` files, never stale `.js` artifacts.

## What stays

- **`buildClientBundles()` for emroute.js/app.js/importmap** — the SPA shell
  assets still need generation. This is orthogonal to module transpilation.
- **Dev-mode manifest invalidation** — for FS-editing workflows (edits bypass
  `command()`), consumers still need to invalidate manifests on each request.
  This is a dev-server concern, not a Runtime concern.

## Scope

- [ ] Move `escapeTemplateLiteral()` to a shared util
- [ ] `BunFsRuntime.loadModule()` — blob-URL import with transpilation
- [ ] `BunFsRuntime.read()` — on-the-fly `.ts` → JS serving with companion merging
- [ ] Update `UniversalFsRuntime` if it has the same `loadModule()` issue
- [ ] Tests: SSR picks up module changes without restart
- [ ] Tests: browser fetch of `.ts` returns valid JS with `__files`
- [ ] Clean up spike file (`test/browser/spike-dev-server.ts`)
- [ ] Delete `server/dev.server.ts` (scrapped subprocess approach)

## Proven

The blob-URL approach was spiked and verified:

- Bun `import(blobUrl)` resolves `node:` and package imports correctly
- Each blob URL bypasses Bun's module cache (proven: write v1, import, write
  v2, direct `import()` returns v1, blob import returns v2)
- On-the-fly transpilation + companion merging serves valid JS to browsers
- SSR picks up file edits without process restart

## Out of scope

- Dev-server wrapper (manifest invalidation per request for FS editing)
- Browser-side hot reload / HMR signaling
- Production caching layer inside `BunFsRuntime.loadModule()`
