# Compiled-binary resolver can't import emroute from disk-loaded files

## Problem

When `@emkodev/emroute` is imported by a `.page.ts` file loaded at runtime via `BunFsRuntime.loadModule()` **inside a Bun standalone binary** (`bun build --compile`), Bun's resolver fails:

```
ResolveMessage: Cannot find module '@emkodev/emroute'
  from '/opt/hardkore/hardkore-app/routes/dashboard/index.page.ts?t=1778779363827'
```

The package is installed at `/opt/hardkore/hardkore-app/node_modules/@emkodev/emroute/` with a valid `package.json` and a complete `src/` + `dist/`. Bun resolves it correctly in normal (non-compiled) mode.

## Root cause

Bun's standalone-binary resolver, when resolving a **bare specifier** from a file loaded via dynamic `import()` from disk, **ignores `main` and `exports` fields and only honors `<pkg>/index.js`** at the package root.

Minimal reproduction:

```sh
# package.json with only `exports` → fails inside compiled binary
{ "name": "lodash-es", "exports": { ".": "./dist/index.js" } }
# error: Cannot find package 'lodash-es' from '/disk/page.ts?t=...'

# package.json with only `main` pointing at subpath → also fails
{ "name": "lodash-es", "main": "./dist/index.js" }
# error: Cannot find package 'lodash-es' from '/disk/page.ts?t=...'

# top-level index.js at <pkg>/index.js → works
{ "name": "lodash-es" }   # plus index.js at root
```

emroute uses an `exports` map with `bun`/`types`/`default` conditions. Under `bun --compile`, none of these resolve when route files request `@emkodev/emroute` at runtime — and `index.js` doesn't exist at the package root.

This is an upstream Bun bug (worth filing): `import()` of a real disk path should apply the same module resolution rules as a normal Bun run. Until that's fixed, emroute can absorb it.

## Where

`package.json` — `exports` field for `"."` and the `files` array. There's no `index.ts`/`index.js` at the package root.

## Fix

Ship a thin root-level re-export so the degraded resolver in compiled binaries can find it:

1. Add `index.ts` at the package root:
   ```ts
   // index.ts
   export * from './src/index.ts';
   ```
2. Have the build (`tsc -p tsconfig.build.json`) emit the corresponding `index.js` at the package root.
3. Add `index.ts` and `index.js` to the `files` array.

Keep the existing `exports` map — normal Bun/Deno/Node still use it; compiled-binary resolution falls back to the root index.

## Caveats

- Only fixes the bare-specifier case (`import "@emkodev/emroute"`). Subpath imports from disk-loaded files (e.g. `import "@emkodev/emroute/runtime/bun/fs"`) would need their own `<subpath>/index.{ts,js}` shims if any downstream consumer hits them. Currently no known consumers import subpaths from runtime-loaded route files, so just the root is enough.
- Compiled binaries end up with **two module instances** of emroute: the one bundled into the binary (resolved via `exports.bun → src/index.ts` at build time) and the one disk-loaded routes reach via this shim (which re-exports from `src/index.ts` too). They're functionally equivalent — same source — but not `===`. If emroute ever relies on object identity across this boundary (e.g. a `WeakMap` keyed by `PageComponent`), the failure mode changes from "Cannot find module" to a subtle runtime mismatch. Verified empirically that current SSR (`<h1>Dashboard</h1>` via gainup-hardkore) renders correctly with the shim.

## Workaround (downstream)

Consumers can patch `node_modules/@emkodev/emroute/index.js` post-install:

```sh
echo "export * from './dist/src/index.js';" \
  > node_modules/@emkodev/emroute/index.js
```

This is what `gainup-hardkore/scripts/deploy.sh` does today (after `bun install --linker=hoisted` in its staging step) to make SSR work inside the compiled `hardkore-api` binary.

## Impact

Blocks any consumer that ships emroute SSR inside a Bun standalone binary. Without the shim, `BunFsRuntime` returns a "Cannot find module" error from every SSR-rendered page that imports anything from `@emkodev/emroute`.

## Resolution

**Resolved in 1.12.5.** Shipped `index.js` and `index.d.ts` at the package root,
each a one-line re-export from `./dist/src/index.js`. Both are added to the
`files` array; the `exports` map is unchanged so normal Bun/Deno/Node resolution
still goes through it. Inside a `bun build --compile` binary, the degraded
resolver finds `<pkg>/index.js` and the bare-specifier import from disk-loaded
route files works.

Subpath imports from disk-loaded files (`@emkodev/emroute/runtime/*`, `/spa`,
`/server`, etc.) still rely on the `exports` map and would hit the same Bun bug
if any downstream consumer imported them from a runtime-loaded route — none do
today.

Audit of the two-instance caveat: no `instanceof` checks against `Component`,
`PageComponent`, or `WidgetComponent` anywhere in `core/`, `src/`, `runtime/`,
or `server/`; `Pipeline.extractWidgetComponent` uses duck-typing (`'getData' in
value`); no `WeakMap`s keyed on component instances. Two structurally-identical
instances are safe today, but adding identity-keyed maps later would reintroduce
the risk.
