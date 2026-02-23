# Deno Runtime: Implementation Plan

## Prerequisite

The **consumer's** `deno.json` must set `"nodeModulesDir": "auto"`. This makes `deno install` create a real `node_modules/` directory in the consumer's project, which esbuild resolves bare specifiers from.

emroute itself does NOT need `nodeModulesDir`. Deno resolves `jsr:` imports natively for runtime code. The `node_modules/` requirement is strictly for esbuild, which runs in the consumer's project context (`absWorkingDir` = consumer's working directory).

## Files to create

### `runtime/deno/fs/deno-fs.runtime.ts`

Copy of `runtime/bun/fs/bun-fs.runtime.ts` with these replacements:

| Bun API | Deno API |
|---------|----------|
| `import { stat, readdir, mkdir } from 'node:fs/promises'` | `Deno.stat`, `Deno.readDir`, `Deno.mkdir` |
| `Bun.file(path).text()` | `Deno.readTextFile(path)` |
| `Bun.file(path).arrayBuffer()` | `Deno.readFile(path)` (returns `Uint8Array` directly) |
| `Bun.write(path, content)` | `Deno.writeFile(path, content)` |
| `(error as NodeJS.ErrnoException).code === 'ENOENT'` | `error instanceof Deno.errors.NotFound` |
| `process.cwd()` | `Deno.cwd()` |
| `await import('esbuild')` | `await import('npm:esbuild')` |

### `bundle()` method — identical esbuild config

The esbuild plugin (`runtime-fs`) is **unchanged**. Critical settings learned from Bun:

```ts
{
  platform: 'browser',        // resolves package.json "exports" correctly
  absWorkingDir: resolveDir,  // tells esbuild where node_modules/ lives
  loader: { '.ts': 'ts' },   // handles .ts in package exports
}
```

Only difference in onLoad disk fallback:
```ts
// Bun:
const diskContents = await Bun.file(resolveDir + args.path).text();
// Deno:
const diskContents = await Deno.readTextFile(resolveDir + args.path);
```

### `server/cli.deno.ts` (if needed later)

| Bun API | Deno API |
|---------|----------|
| `Bun.serve()` | `Deno.serve()` |
| `Bun.spawn()` | `new Deno.Command()` |
| `process.env` | `Deno.env.get()` |
| `process.argv.slice(2)` | `Deno.args` |
| `process.exit()` | `Deno.exit()` |

## Files unchanged

- `runtime/abstract.runtime.ts` — no changes
- `server/emroute.server.ts` — runtime-agnostic, works as-is
- `server/generator/*.ts` — runtime-agnostic
- `src/` — zero runtime dependencies

## `deno.json` (emroute's own — for development/testing)

No `nodeModulesDir` needed. Deno resolves `jsr:` natively.

```json
{
  "imports": {
    "@emkodev/emroute": "./src/index.ts",
    "@emkodev/emroute/spa": "./src/renderer/spa/mod.ts",
    "@emkodev/emroute/overlay": "./src/overlay/mod.ts",
    "@emkodev/emroute/server": "./server/emroute.server.ts",
    "@emkodev/emroute/runtime": "./runtime/abstract.runtime.ts",
    "@emkodev/emroute/runtime/deno/fs": "./runtime/deno/fs/deno-fs.runtime.ts"
  },
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "deno.ns", "esnext"]
  }
}
```

## Package exports for dual runtime

`package.json` gains a Deno export:

```json
{
  "exports": {
    "./runtime/deno/fs": "./runtime/deno/fs/deno-fs.runtime.ts"
  }
}
```

## What `nodeModulesDir: "auto"` solves (consumer-side only)

Deno natively resolves `jsr:` specifiers for its own runtime — emroute code runs fine without `node_modules/`. The problem is esbuild: it can't resolve `jsr:` specifiers or Deno's content-addressed cache.

The consumer sets `"nodeModulesDir": "auto"` in their `deno.json`. Then:

1. `deno install` fetches JSR packages and symlinks them into `node_modules/@scope/name`
2. esbuild's native resolver finds them via `absWorkingDir` (consumer's project root) + `node_modules/`
3. No custom resolution logic needed for bare specifiers — same as Bun
4. Deno still resolves its own runtime imports from JSR cache as usual

## Consumer setup (Deno)

```ts
// Consumer's deno.json must have: "nodeModulesDir": "auto"
// Consumer runs: deno add jsr:@emkodev/emroute (lands in both JSR cache and node_modules/)

import { createEmrouteServer } from '@emkodev/emroute/server';
import { DenoFsRuntime } from '@emkodev/emroute/runtime/deno/fs';

const runtime = new DenoFsRuntime('.');
const emroute = await createEmrouteServer({
  spa: 'root',
  moduleLoader: (path) => import(new URL('.' + path, import.meta.url).href),
}, runtime);

Deno.serve({ port: 4100 }, async (req) => {
  return await emroute.handleRequest(req) ?? new Response('Not Found', { status: 404 });
});
```

## Potential issue: esbuild binary

esbuild ships a platform-specific binary. With `npm:esbuild`, Deno downloads it on first import. Verify this works with `nodeModulesDir: "auto"` — the binary should land in `node_modules/esbuild/bin/`.

## Summary

The Deno runtime is a thin API translation layer over the same architecture. The bundler (esbuild) config is identical. The key enabler is `nodeModulesDir: "auto"` — without it, esbuild cannot resolve bare specifiers.
