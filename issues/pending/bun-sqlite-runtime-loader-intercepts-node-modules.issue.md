# BunSqliteRuntime esbuild plugin intercepts node_modules files

## Problem

`BunSqliteRuntime.bundle()` creates the runtime-loader plugin with `root: ''`:

```ts
const runtimeLoader = createRuntimeLoaderPlugin({ runtime: this, root: '' });
```

The plugin's `onResolve` guard skips the root boundary check when `root` is
falsy:

```ts
// esbuild-runtime-loader.plugin.ts:68
if (root && !absPath.startsWith(root + '/')) return undefined;
```

This means **every** `.ts`/`.js` file with a relative import is intercepted and
redirected into the `runtime` namespace. When the `onLoad` handler then calls
`runtime.query()`, files that exist on disk but not in SQLite (e.g.
`node_modules/@emkodev/emkoma/dist/block/registry.js`) produce a `Not found`
error, failing the build.

### Secondary issue: empty resolveDir for root-level files

Files stored at the virtual root (e.g. `/main.ts`) get `resolveDir: ''` from
the `onLoad` handler:

```ts
const resolveDir = args.path.slice(0, args.path.lastIndexOf('/'));
// '/main.ts' → ''
```

Empty string is falsy, so:

1. **Relative imports fail** — the plugin's `onResolve` bails at
   `else if (args.resolveDir)` (line 52) and returns `undefined`. esbuild then
   tries normal resolution but has no resolveDir to search from.
2. **Bare imports fail** — the plugin skips bare specifiers (line 44), but
   esbuild needs a real resolveDir to walk up the filesystem looking for
   `node_modules/`. With `''`, it has no starting point.

## Reproduction

```ts
import { BunSqliteRuntime } from '@emkodev/emroute/runtime/bun/sqlite';

const runtime = new BunSqliteRuntime(':memory:', {
  routesDir: '/routes',
  widgetsDir: '/widgets',
  entryPoint: '/main.ts',
});

// Seed a main.ts that imports a non-emroute package
await runtime.command('/main.ts', {
  body: `
    import { renderMarkdown } from '@emkodev/emkoma/render';
    import { createSpaHtmlRouter } from '@emkodev/emroute/spa';
    // ...
  `,
});

// This fails: esbuild resolves @emkodev/emkoma/render to a real node_modules
// path, the runtime-loader intercepts its .js files (root is ''), and
// runtime.query() throws "Not found" because they aren't in SQLite.
await runtime.bundle();
```

Even without the bare import issue, a `/main.ts` entry point that uses relative
imports (e.g. `./renderer.ts`) fails because `resolveDir` is `''`.

## Expected behaviour

- The runtime-loader plugin should only intercept files that belong to the
  virtual filesystem, not files from `node_modules` or other real disk paths.
- Root-level virtual files should still be able to resolve relative and bare
  imports.

## Suggested fix

In `BunSqliteRuntime.bundle()`, set a meaningful `root` so the plugin can
distinguish virtual files from real disk files. Options:

1. **Use a synthetic prefix** (e.g. `root: '/__runtime__'`) and store virtual
   files under that prefix internally. The plugin would only intercept paths
   starting with `/__runtime__/` and strip the prefix before querying the
   runtime.

2. **Fall back to `process.cwd()`** for `resolveDir` in `onLoad` when the
   computed value is empty. This fixes the secondary issue and lets esbuild
   find `node_modules` for bare imports. Combined with making `@emkodev/emkoma`
   (and similar packages) external or skipping node_modules paths in
   `onResolve`, this would work.

3. **Check file existence before intercepting** — in `onResolve`, query the
   runtime for the resolved path; if 404, return `undefined` to let esbuild
   use its default filesystem resolver. This is the most robust approach but
   adds async work to every resolve call.

Option 2 is likely the smallest change:

```ts
// In BunSqliteRuntime.bundle():
const runtimeLoader = createRuntimeLoaderPlugin({
  runtime: this,
  root: '',
  resolveDir: process.cwd(),  // fallback for bare import resolution
});

// In onLoad handler:
const resolveDir = computed || options.resolveDir || '';
```

## Impact

- Blocks using any non-emroute package in client entry points with
  BunSqliteRuntime
- Blocks relative imports from root-level virtual files (`/main.ts`,
  `/renderer.ts`, etc.)
- `BunFsRuntime` is unaffected (its root is a real filesystem path)

## Workaround

Let the runtime auto-generate `main.ts` (which only uses `emroute:*` virtual
specifiers and `@emkodev/emroute/*` externals). This avoids the bare import
issue but means consumer code like `MarkdownElement.setRenderer()` cannot run
in the SPA bundle, breaking client-side markdown rendering during SPA
navigation.
