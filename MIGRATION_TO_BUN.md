# emroute: Deno to Bun Migration Plan

## 1. Overview

emroute is a file-based router with triple rendering (SPA, SSR HTML, SSR Markdown). The package
architecture has three layers:

- **Core (`src/`)** -- Framework-agnostic routing, rendering, components, and utilities. Zero Deno
  API usage. This layer requires no changes.
- **Runtime (`runtime/`)** -- Abstraction layer with a `Runtime` base class (`abstract.runtime.ts`)
  and a Deno filesystem implementation (`deno/fs/deno-fs.runtime.ts`). This is the primary migration
  target.
- **Server/CLI (`server/`)** -- Dev server, build tool, manifest generators, and CLI entry point.
  The CLI (`cli.deno.ts`) is heavily Deno-specific. The server (`emroute.server.ts`) and generators
  (`route.generator.ts`, `widget.generator.ts`, `sitemap.generator.ts`) are runtime-agnostic -- they
  operate through the `Runtime` abstraction.

Current version: 1.5.3-beta.13. Published to JSR as `@emkodev/emroute`.

## 2. Prerequisites

- Bun >= 1.1 installed
- All `@emkodev/*` packages available on npm (currently on JSR)
- `esbuild` available as an npm package (currently imported as `npm:esbuild`)
- `playwright` available as an npm package (currently imported as `npm:playwright`)
- `@emkodev/emko-md` available on npm (currently on JSR)

## 3. Architecture Note

The runtime abstraction layer (`runtime/`) is the key migration target. The `Runtime` abstract class
defines a `fetch()`-style interface (Request/Response) for filesystem operations. The Deno
implementation (`DenoFsRuntime`) is the only concrete implementation.

The core `src/` directory has **zero** Deno API references -- it uses only standard web APIs
(Request, Response, URL, URLPattern, etc.). The server layer (`emroute.server.ts`,
`route.generator.ts`, `widget.generator.ts`, `sitemap.generator.ts`) works entirely through the
`Runtime` abstraction and needs no Deno-specific changes.

Only two files contain the bulk of Deno API usage:
1. `runtime/deno/fs/deno-fs.runtime.ts` -- filesystem operations
2. `server/cli.deno.ts` -- CLI, dev server, file watcher

## 4. Step-by-step Migration Tasks

### A. Package Configuration

#### Create `package.json`

```json
{
  "name": "@emkodev/emroute",
  "version": "1.5.3-beta.13",
  "type": "module",
  "description": "File-based router with triple rendering (SPA, SSR HTML, SSR Markdown).",
  "license": "BSD-3-Clause",
  "author": "emko.dev",
  "repository": {
    "type": "git",
    "url": "https://github.com/vedokme/emroute.git"
  },
  "exports": {
    ".": "./src/index.ts",
    "./spa": "./src/renderer/spa/mod.ts",
    "./overlay": "./src/overlay/mod.ts",
    "./server": "./server/emroute.server.ts",
    "./server/cli": "./server/cli.ts",
    "./runtime": "./runtime/abstract.runtime.ts",
    "./runtime/bun/fs": "./runtime/bun/fs/bun-fs.runtime.ts"
  },
  "scripts": {
    "test": "bun test test/unit/*.test.ts",
    "test:unit": "bun test test/unit/*.test.ts",
    "test:unit:watch": "bun test test/unit/*.test.ts --watch",
    "test:integration": "bun test test/integration/*.test.ts",
    "test:browser": "bun run test:bundle && bun test test/browser/**/*.test.ts",
    "check": "bun run tsc --noEmit",
    "dev": "bun run server/cli.ts"
  },
  "dependencies": {
    "esbuild": "^0.27.3"
  },
  "devDependencies": {
    "@emkodev/emko-md": "*",
    "playwright": "^1.58.2",
    "typescript": "^5.7.0",
    "@types/bun": "latest"
  }
}
```

#### Create `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "types": ["bun-types"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitThis": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts", "server/**/*.ts", "runtime/**/*.ts"],
  "exclude": ["test/**/*.ts", ".build/**/*", "node_modules"]
}
```

Key difference from `deno.json`: remove `"deno.ns"` from `lib`, add `"bun-types"` to `types`.

### B. Runtime Layer (highest priority)

This is the most critical migration. Create `runtime/bun/fs/bun-fs.runtime.ts` to replace
`runtime/deno/fs/deno-fs.runtime.ts`.

**File: `runtime/bun/fs/bun-fs.runtime.ts`**

Every Deno API call in `DenoFsRuntime` must be replaced:

#### `read()` method (lines 71-97 of `deno-fs.runtime.ts`)

Current Deno APIs:
- `Deno.stat(path)` -- get file info (isDirectory, mtime)
- `Deno.readFile(path)` -- read binary content
- `Deno.errors.NotFound` -- error type for missing files

Bun replacements:
```typescript
import { statSync, readdirSync, mkdirSync } from 'node:fs';

private async read(path: string): Promise<Response> {
  try {
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return this.list(path);
    }

    const file = Bun.file(path);
    const content = new Uint8Array(await file.arrayBuffer());
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    const headers: HeadersInit = {
      'Content-Type': CONTENT_TYPES.get(ext) ?? 'application/octet-stream',
      'Content-Length': content.byteLength.toString(),
    };

    if (stat.mtime) {
      headers['Last-Modified'] = stat.mtime.toUTCString();
    }

    return new Response(content, { status: 200, headers });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return new Response('Not Found', { status: 404 });
    }
    return new Response(`Internal Error: ${error}`, { status: 500 });
  }
}
```

#### `query()` method with `as: 'text'` (line 45)

Current: `Deno.readTextFile(path)`

Bun replacement:
```typescript
if (options?.as === 'text') {
  const pathname = this.parsePath(resource);
  return Bun.file(`${this.root}${pathname}`).text();
}
```

#### `list()` method (lines 99-105)

Current: `Deno.readDir(path)` -- async iterable of `{ name, isDirectory }`

Bun replacement:
```typescript
import { readdirSync } from 'node:fs';

private async list(path: string): Promise<Response> {
  const entries: string[] = [];
  const dirents = readdirSync(path, { withFileTypes: true });
  for (const dirent of dirents) {
    entries.push(dirent.name + (dirent.isDirectory() ? '/' : ''));
  }
  return Response.json(entries);
}
```

#### `write()` method (lines 107-119)

Current:
- `Deno.mkdir(dir, { recursive: true })`
- `Deno.writeFile(path, content)`

Bun replacement:
```typescript
import { mkdirSync } from 'node:fs';

private async write(path: string, body: BodyInit | null): Promise<Response> {
  try {
    const content = body
      ? new Uint8Array(await new Response(body).arrayBuffer())
      : new Uint8Array();
    const dir = path.slice(0, path.lastIndexOf('/'));
    if (dir) mkdirSync(dir, { recursive: true });
    await Bun.write(path, content);
    return new Response(null, { status: 204 });
  } catch (error) {
    return new Response(`Write failed: ${error}`, { status: 500 });
  }
}
```

#### `esbuild` dynamic import (line 126)

Current: `await import('npm:esbuild@^0.27.3')`

Bun replacement:
```typescript
import * as esbuild from 'esbuild';
```

Since esbuild is a regular npm dependency in Bun, use a static import at the top of the file.
If lazy loading is preferred:
```typescript
private static async esbuild() {
  if (!BunFsRuntime._esbuild) {
    BunFsRuntime._esbuild = await import('esbuild');
  }
  return BunFsRuntime._esbuild;
}
```

#### `bundle()` method -- `Deno.cwd()` (line 147)

Current: `const resolveDir = options?.resolveDir ?? Deno.cwd();`

Bun replacement:
```typescript
const resolveDir = options?.resolveDir ?? process.cwd();
```

#### `compress()` static method

If this needs implementation, use Bun's native compression:
```typescript
static override async compress(data: Uint8Array, encoding: 'br' | 'gzip'): Promise<Uint8Array> {
  const blob = new Blob([data]);
  // Bun supports CompressionStream
  const cs = new CompressionStream(encoding === 'br' ? 'deflate' : 'gzip');
  const stream = blob.stream().pipeThrough(cs);
  const compressed = await new Response(stream).arrayBuffer();
  return new Uint8Array(compressed);
}
```

Note: Bun's `CompressionStream` does not support Brotli (`'br'`). For Brotli, use Node's
`zlib.brotliCompressSync`:
```typescript
import { brotliCompressSync, gzipSync } from 'node:zlib';

static override async compress(data: Uint8Array, encoding: 'br' | 'gzip'): Promise<Uint8Array> {
  if (encoding === 'br') {
    return new Uint8Array(brotliCompressSync(data));
  }
  return new Uint8Array(gzipSync(data));
}
```

### C. Server/CLI (`server/cli.deno.ts` -> `server/cli.ts`)

Rename and rewrite. This file has the heaviest Deno API usage.

#### Top-level changes

```typescript
#!/usr/bin/env bun
```

Replace the shebang line.

#### `Deno.cwd()` (line 43)

Current: `const runtime = new DenoFsRuntime(Deno.cwd());`

Bun replacement:
```typescript
import { BunFsRuntime } from '../runtime/bun/fs/bun-fs.runtime.ts';
const runtime = new BunFsRuntime(process.cwd());
```

#### `Deno.exit(code)` (lines 78, 89, 97, 119, 139, 331)

Replace all occurrences with `process.exit(code)`.

#### `Deno.args` (line 380)

Current: `const flags = parseArgs(Deno.args);`

Bun replacement:
```typescript
const flags = parseArgs(process.argv.slice(2));
```

#### `import.meta.main` check (line 379)

Current:
```typescript
if (import.meta.main) {
```

Bun replacement -- Bun supports `import.meta.main`:
```typescript
if (import.meta.main) {
```

No change needed. Bun supports `import.meta.main` natively.

#### `Deno.serve()` (line 239)

Current:
```typescript
Deno.serve({ port: flags.port, onListen() {} }, async (req) => {
  // ...
});
```

Bun replacement:
```typescript
Bun.serve({
  port: flags.port,
  async fetch(req: Request): Promise<Response> {
    const response = await emroute.handleRequest(req);
    if (response) return response;

    const url = new URL(req.url);
    const pathname = url.pathname;

    const buildResponse = await runtime.query(`/${BUNDLE_DIR}${pathname}`);
    if (buildResponse.status === 200) return buildResponse;

    return await runtime.handle(pathname);
  },
});
```

Key difference: Deno.serve takes `(options, handler)`. Bun.serve takes a single object with
`fetch` as the handler property. The Bun handler must always return a Response (not
`Response | null`).

#### `Deno.HttpServer` type (used in `test/browser/shared/setup.ts` line 28)

Current: `server: Deno.HttpServer`

Bun replacement: `server: ReturnType<typeof Bun.serve>` or import `Server` from `bun`.

#### `Deno.mkdir()` (line 225)

Current: `await Deno.mkdir(BUNDLE_DIR, { recursive: true });`

Bun replacement:
```typescript
import { mkdirSync } from 'node:fs';
mkdirSync(BUNDLE_DIR, { recursive: true });
```

#### `Deno.Command` for subprocess (lines 228-233)

Current:
```typescript
new Deno.Command('deno', {
  args: ['bundle', '--platform', 'browser', '--watch', entryPoint, '-o', bundleOutput],
  stdout: 'inherit',
  stderr: 'inherit',
}).spawn();
```

Bun replacement:
```typescript
Bun.spawn(['bun', 'build', '--target', 'browser', '--watch', entryPoint, '--outfile', bundleOutput], {
  stdout: 'inherit',
  stderr: 'inherit',
});
```

Note: The `deno bundle` command is replaced with `bun build`. Verify flag equivalence.
Alternatively, keep using esbuild for bundling since the server already uses it.

#### `Deno.watchFs()` (line 262)

Current:
```typescript
const watcher = Deno.watchFs(watchPath);
(async () => {
  for await (const event of watcher) {
    const isRelevant = event.paths.some((p) =>
      p.endsWith('.page.ts') || ...
    );
    if (!isRelevant) continue;
    // debounced rebuild
  }
})();
```

Bun replacement using Node's `fs.watch` (supported by Bun):
```typescript
import { watch } from 'node:fs';

for (const watchPath of watchPaths) {
  watch(watchPath, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    const isRelevant =
      filename.endsWith('.page.ts') || filename.endsWith('.page.html') ||
      filename.endsWith('.page.md') || filename.endsWith('.page.css') ||
      filename.endsWith('.error.ts') || filename.endsWith('.redirect.ts') ||
      filename.endsWith('.widget.ts') || filename.endsWith('.widget.css');

    if (!isRelevant) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        await emroute.rebuild();
        console.log('[emroute] Rebuilt routes and widgets');
      } catch (e) {
        console.error('[emroute] Failed to rebuild:', e);
      }
    }, WATCH_DEBOUNCE_MS);
  });
}
```

Key differences:
- `Deno.watchFs` returns an `AsyncIterable<FsEvent>` with `event.paths` (array of absolute paths).
- Node's `fs.watch` uses a callback with `(eventType, filename)` where `filename` is relative to
  the watched directory.
- Node's `fs.watch` with `{ recursive: true }` works on macOS and Windows. On Linux, Bun polyfills
  recursive watching.
- The `filename` parameter is the relative path, not absolute. The relevance check uses
  `filename.endsWith(...)` which works the same way since we only check suffixes.

#### `Deno.stat()` helper functions (lines 362-375)

Current:
```typescript
async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isDirectory;
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isFile;
  } catch {
    return false;
  }
}
```

Bun replacement:
```typescript
import { statSync } from 'node:fs';

async function isDirectory(path: string): Promise<boolean> {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
```

Note: Deno's `stat.isDirectory` is a property. Node/Bun's `stat.isDirectory()` is a method call.

#### `Deno.readDir()` in `scanForPageTs()` (lines 161-177)

Current:
```typescript
async function scanForPageTs(dir: string): Promise<boolean> {
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile && entry.name.endsWith('.page.ts')) return true;
      if (entry.isDirectory) {
        if (await scanForPageTs(`${dir}/${entry.name}`)) return true;
      }
    }
  } catch { }
  return false;
}
```

Bun replacement:
```typescript
import { readdirSync } from 'node:fs';

async function scanForPageTs(dir: string): Promise<boolean> {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.page.ts')) return true;
      if (entry.isDirectory()) {
        if (await scanForPageTs(`${dir}/${entry.name}`)) return true;
      }
    }
  } catch { }
  return false;
}
```

#### `Deno.env.get()` (used in test setup)

Replace with `process.env.VAR_NAME ?? defaultValue`.

#### `Deno.makeTempDir()` (used in CLI integration tests)

Replace with:
```typescript
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'emroute-cli-test-'));
```

#### `Deno.writeTextFile()` / `Deno.readTextFile()` (used in integration tests)

Replace with `Bun.write(path, content)` and `Bun.file(path).text()`.

#### `Deno.remove(dir, { recursive: true })` (used in integration tests)

Replace with:
```typescript
import { rmSync } from 'node:fs';
rmSync(dir, { recursive: true, force: true });
```

### D. Core Source (`src/`) -- Minimal Changes

The `src/` directory has **zero** Deno API references and **zero** `jsr:` or `npm:` import
prefixes. No changes needed to any file in `src/`.

Files confirmed clean:
- All type files (`type/*.type.ts`)
- All component files (`component/*.component.ts`)
- All renderer files (`renderer/**/*.ts`)
- All route files (`route/*.ts`)
- All utility files (`util/*.ts`)
- All widget files (`widget/*.ts`)
- All overlay files (`overlay/*.ts`)
- All element files (`element/*.ts`)
- `index.ts`

### E. Test Files

#### Unit tests (`test/unit/*.test.ts`)

All 13 unit test files use:
- `Deno.test('name', fn)` or `Deno.test({ name, fn })`
- `import { assertEquals, assertExists, assertStringIncludes, assert } from '@std/assert';`

Replace with Bun's test framework:

**Before (Deno):**
```typescript
import { assertEquals, assertExists } from '@std/assert';

Deno.test('toUrl - parses string URLs', () => {
  const url = toUrl('http://example.com/about');
  assertExists(url);
  assertEquals(url.pathname, '/about');
});
```

**After (Bun):**
```typescript
import { describe, test, expect } from 'bun:test';

test('toUrl - parses string URLs', () => {
  const url = toUrl('http://example.com/about');
  expect(url).toBeDefined();
  expect(url.pathname).toBe('/about');
});
```

Assertion mapping:
| Deno (`@std/assert`)          | Bun (`bun:test`)                    |
|-------------------------------|-------------------------------------|
| `assertEquals(a, b)`         | `expect(a).toBe(b)` or `.toEqual(b)` |
| `assertExists(x)`            | `expect(x).toBeDefined()`          |
| `assertStringIncludes(s, sub)` | `expect(s).toContain(sub)`        |
| `assert(condition)`          | `expect(condition).toBe(true)`      |
| `assertThrows(fn)`           | `expect(fn).toThrow()`             |

For `assertEquals` with objects/arrays, use `expect(a).toEqual(b)`. For primitives, use
`expect(a).toBe(b)`.

#### Integration tests (`test/integration/*.test.ts`)

Two files:
- `test/integration/cli.test.ts` -- spawns Deno subprocesses with `Deno.Command`
- `test/integration/prod.server.test.ts` -- uses `DenoFsRuntime` and `Deno.readTextFile`

For `cli.test.ts`:
- Replace `Deno.Command('deno', ...)` with `Bun.spawn(['bun', ...])`
- Replace `Deno.makeTempDir` with `mkdtempSync`
- Replace `Deno.writeTextFile` with `Bun.write`
- Replace `Deno.readTextFile` with `Bun.file().text()`
- Replace `Deno.remove` with `rmSync`
- Replace `Deno.stat` with `statSync`
- Remove `permissions` from test definitions (Bun has no permission model)

For `prod.server.test.ts`:
- Replace `DenoFsRuntime` with `BunFsRuntime`
- Replace `Deno.cwd()` with `process.cwd()`
- Replace `Deno.readTextFile` with `Bun.file().text()`
- Remove `permissions` from test definitions

#### Browser tests (`test/browser/**/*.test.ts`)

Four test suites plus shared setup:
- `test/browser/shared/setup.ts` -- primary change target
- `test/browser/none/ssr.test.ts`
- `test/browser/leaf/leaf.test.ts`, `hash.test.ts`
- `test/browser/root/hydration.test.ts`
- `test/browser/only/spa.test.ts`

In `setup.ts`:
- Replace `DenoFsRuntime` with `BunFsRuntime`
- Replace `Deno.cwd()` with `process.cwd()`
- Replace `Deno.serve` with `Bun.serve`
- Replace `Deno.HttpServer` type with Bun's `Server` type
- Replace `server.shutdown()` with `server.stop()`
- Replace `jsr:@emkodev/emko-md@0.1.0-beta.4/parser` with `@emkodev/emko-md/parser` (npm)
- Replace `npm:playwright@1.58.2` with `playwright` (npm dependency)
- Replace `Deno.env.get('SPA_MODE')` with `process.env.SPA_MODE`
- Replace `Deno.env.get('TEST_PORT')` with `process.env.TEST_PORT`

All browser test files use `Deno.test(...)` which must become `test(...)` from `bun:test`.

Deno test permissions (`--allow-net`, `--allow-read`, etc.) are not needed in Bun -- remove all
`permissions` properties from test definitions.

### F. Import Updates

All files in the codebase that use prefixed imports must be updated:

| Current Import                                  | Bun Import                          | Files Affected |
|-------------------------------------------------|-------------------------------------|----------------|
| `'@std/assert'` (via import map in deno.json)   | `'bun:test'`                        | All test files |
| `jsr:@emkodev/emko-md@0.1.0-beta.4/parser`     | `@emkodev/emko-md/parser`           | `test/browser/shared/setup.ts` |
| `npm:esbuild@^0.27.3`                           | `esbuild`                           | `runtime/deno/fs/deno-fs.runtime.ts` |
| `npm:playwright@1.58.2`                         | `playwright`                        | `test/browser/shared/setup.ts` |

Additionally, all internal `.ts` extension imports are fine -- Bun supports `.ts` extensions
natively.

### G. Bundling Tasks

The `deno.json` `tasks` section uses `deno bundle` for test fixture bundling. Replace with esbuild
or `bun build`:

| Current Task                        | Bun Equivalent                                |
|-------------------------------------|-----------------------------------------------|
| `deno test test/unit/*.test.ts`     | `bun test test/unit/*.test.ts`                |
| `deno check src/index.ts`           | `bun run tsc --noEmit`                        |
| `deno fmt`                          | Use Biome or Prettier                         |
| `deno lint`                         | Use Biome or ESLint                           |
| `deno bundle -o out src/mod.ts`     | `bun build src/mod.ts --outfile out`          |
| `deno run -A server/cli.deno.ts`    | `bun run server/cli.ts`                       |

For the test bundle tasks (`test:bundle:emroute`, `test:bundle:widgets`, `test:bundle:app`), convert
to `bun build` commands in `package.json`:

```json
{
  "scripts": {
    "test:bundle:emroute": "bun build src/renderer/spa/mod.ts --outfile test/browser/fixtures/emroute.js",
    "test:bundle:widgets": "bun build test/browser/fixtures/widgets.manifest.g.ts --outfile test/browser/fixtures/widgets.js --external '@emkodev/emroute/spa' --external '@emkodev/emroute/overlay' --external '@emkodev/emroute'",
    "test:bundle:app": "bun build test/browser/fixtures/main.ts --outfile test/browser/fixtures/app.js --external '@emkodev/emroute/spa' --external '@emkodev/emroute/overlay' --external '@emkodev/emroute' --external './widgets.manifest.g.ts'",
    "test:bundle": "bun run test:bundle:emroute && bun run test:bundle:widgets && bun run test:bundle:app"
  }
}
```

## 5. `Deno.watchFs` Migration Detail

This is the trickiest migration point because the APIs have fundamentally different shapes.

### Deno Pattern (current)

`Deno.watchFs(path)` returns an `AsyncIterable<Deno.FsEvent>` where each event has:
- `kind`: `'create' | 'modify' | 'remove' | 'access' | 'other'`
- `paths`: `string[]` -- absolute paths of affected files

```typescript
const watcher = Deno.watchFs(watchPath);
for await (const event of watcher) {
  const isRelevant = event.paths.some((p) => p.endsWith('.page.ts'));
  if (!isRelevant) continue;
  // handle
}
```

### Bun/Node Pattern (target)

Node's `fs.watch` uses a callback pattern:
```typescript
fs.watch(path, { recursive: true }, (eventType, filename) => { ... });
```

Where:
- `eventType`: `'rename' | 'change'`
- `filename`: `string | null` -- relative path from watched directory

### Migration Strategy: Use callback directly

Since the current code only uses the watcher for debounced rebuilds, the simplest approach is
to use the callback directly without wrapping in an async generator:

```typescript
import { watch } from 'node:fs';

for (const watchPath of watchPaths) {
  watch(watchPath, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    const isRelevant =
      filename.endsWith('.page.ts') || filename.endsWith('.page.html') ||
      filename.endsWith('.page.md') || filename.endsWith('.page.css') ||
      filename.endsWith('.error.ts') || filename.endsWith('.redirect.ts') ||
      filename.endsWith('.widget.ts') || filename.endsWith('.widget.css');

    if (!isRelevant) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        await emroute.rebuild();
        console.log('[emroute] Rebuilt routes and widgets');
      } catch (e) {
        console.error('[emroute] Failed to rebuild:', e);
      }
    }, WATCH_DEBOUNCE_MS);
  });
}
```

### Alternative: Async generator wrapper

If other parts of the codebase need async iteration over FS events in the future:

```typescript
import { watch, type FSWatcher } from 'node:fs';

function watchFs(path: string): { events: AsyncIterable<{ paths: string[] }>; close: () => void } {
  let watcher: FSWatcher;
  let resolve: ((value: { paths: string[] }) => void) | null = null;
  const queue: { paths: string[] }[] = [];
  let closed = false;

  watcher = watch(path, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    const fullPath = `${path}/${filename}`;
    const event = { paths: [fullPath] };
    if (resolve) {
      const r = resolve;
      resolve = null;
      r(event);
    } else {
      queue.push(event);
    }
  });

  const events: AsyncIterable<{ paths: string[] }> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<{ paths: string[] }>> {
          if (closed) return Promise.resolve({ done: true, value: undefined });
          if (queue.length > 0) {
            return Promise.resolve({ done: false, value: queue.shift()! });
          }
          return new Promise((r) => {
            resolve = (value) => r({ done: false, value });
          });
        },
      };
    },
  };

  return {
    events,
    close() {
      closed = true;
      watcher.close();
      if (resolve) resolve({ paths: [] });
    },
  };
}
```

The direct callback approach (first option) is recommended for simplicity.

## 6. Deno API to Bun Mapping Table

| Deno API                    | Bun/Node Equivalent                        | File(s)                              |
|-----------------------------|-------------------------------------------|--------------------------------------|
| `Deno.readFile(path)`       | `Bun.file(path).arrayBuffer()` -> `new Uint8Array(...)` | `runtime/deno/fs/deno-fs.runtime.ts` |
| `Deno.readTextFile(path)`   | `Bun.file(path).text()`                   | `runtime/deno/fs/deno-fs.runtime.ts`, integration tests |
| `Deno.writeFile(path, data)`| `Bun.write(path, data)`                   | `runtime/deno/fs/deno-fs.runtime.ts` |
| `Deno.writeTextFile(path, text)` | `Bun.write(path, text)`              | Integration tests                    |
| `Deno.stat(path)`           | `statSync(path)` from `node:fs`           | `runtime/deno/fs/deno-fs.runtime.ts`, `server/cli.deno.ts` |
| `Deno.readDir(path)`        | `readdirSync(path, { withFileTypes: true })` from `node:fs` | `runtime/deno/fs/deno-fs.runtime.ts`, `server/cli.deno.ts` |
| `Deno.mkdir(path, opts)`    | `mkdirSync(path, opts)` from `node:fs`    | `runtime/deno/fs/deno-fs.runtime.ts`, `server/cli.deno.ts` |
| `Deno.errors.NotFound`      | `error.code === 'ENOENT'`                 | `runtime/deno/fs/deno-fs.runtime.ts` |
| `Deno.cwd()`                | `process.cwd()`                            | `runtime/deno/fs/deno-fs.runtime.ts`, `server/cli.deno.ts`, `server/generator/cli.ts` |
| `Deno.serve(opts, handler)`  | `Bun.serve({ port, fetch })`              | `server/cli.deno.ts`, `test/browser/shared/setup.ts` |
| `Deno.watchFs(path)`        | `watch(path, { recursive: true }, cb)` from `node:fs` | `server/cli.deno.ts`         |
| `Deno.Command(cmd, opts).spawn()` | `Bun.spawn([cmd, ...args], opts)`    | `server/cli.deno.ts`, `test/integration/cli.test.ts` |
| `Deno.args`                 | `process.argv.slice(2)`                    | `server/cli.deno.ts`, `server/generator/cli.ts` |
| `Deno.exit(code)`           | `process.exit(code)`                       | `server/cli.deno.ts`, `server/generator/cli.ts` |
| `Deno.env.get(key)`         | `process.env[key]`                         | `test/browser/shared/start-server.ts`, `test/browser/shared/setup.ts` |
| `import.meta.main`          | `import.meta.main` (Bun supports this)     | `server/cli.deno.ts`, `server/generator/cli.ts` |
| `Deno.HttpServer`           | `Server` from Bun types                    | `test/browser/shared/setup.ts` |
| `server.shutdown()`         | `server.stop()`                             | `test/browser/shared/setup.ts` |
| `Deno.makeTempDir(opts)`    | `mkdtempSync(join(tmpdir(), prefix))` from `node:fs` + `node:os` | `test/integration/cli.test.ts` |
| `Deno.remove(path, opts)`   | `rmSync(path, opts)` from `node:fs`        | `test/integration/cli.test.ts` |
| `Deno.test(name, fn)`       | `test(name, fn)` from `bun:test`           | All test files                       |
| `Deno.test({ name, fn, permissions })` | `test(name, fn)` from `bun:test` (no permissions) | Integration/browser tests |
| `import 'npm:esbuild@^0.27.3'` | `import 'esbuild'`                      | `runtime/deno/fs/deno-fs.runtime.ts` |
| `import 'npm:playwright@1.58.2'` | `import 'playwright'`                  | `test/browser/shared/setup.ts` |
| `import 'jsr:@emkodev/emko-md@...'` | `import '@emkodev/emko-md/...'`       | `test/browser/shared/setup.ts` |
| `/// <reference lib="deno.ns" />`   | Remove (use `@types/bun` instead)    | `server/generator/cli.ts` |

## 7. Files to Modify

Complete list of files requiring changes:

### Runtime layer
1. `/Users/eldarko/emkodev-foundation/emroute/runtime/abstract.runtime.ts` -- no changes needed (framework-agnostic)

### Server layer
2. `/Users/eldarko/emkodev-foundation/emroute/server/emroute.server.ts` -- no changes needed (uses Runtime abstraction only)
3. `/Users/eldarko/emkodev-foundation/emroute/server/generator/route.generator.ts` -- no changes needed
4. `/Users/eldarko/emkodev-foundation/emroute/server/generator/widget.generator.ts` -- no changes needed
5. `/Users/eldarko/emkodev-foundation/emroute/server/generator/sitemap.generator.ts` -- no changes needed
6. `/Users/eldarko/emkodev-foundation/emroute/server/server-api.type.ts` -- no changes needed
7. `/Users/eldarko/emkodev-foundation/emroute/server/generator/cli.ts` -- replace `DenoFsRuntime` import, `Deno.cwd()`, `Deno.args`, `import.meta.main`, remove `/// <reference lib="deno.ns" />`

### CLI (rename + rewrite)
8. `/Users/eldarko/emkodev-foundation/emroute/server/cli.deno.ts` -- full rewrite (rename to `cli.ts`)

### Unit tests (22 files -- test runner + assertion changes)
9. `/Users/eldarko/emkodev-foundation/emroute/test/unit/route.matcher.test.ts`
10. `/Users/eldarko/emkodev-foundation/emroute/test/unit/route.generator.test.ts`
11. `/Users/eldarko/emkodev-foundation/emroute/test/unit/route.combinations.test.ts`
12. `/Users/eldarko/emkodev-foundation/emroute/test/unit/route.core.test.ts`
13. `/Users/eldarko/emkodev-foundation/emroute/test/unit/ssr.html.renderer.test.ts`
14. `/Users/eldarko/emkodev-foundation/emroute/test/unit/ssr.md.renderer.test.ts`
15. `/Users/eldarko/emkodev-foundation/emroute/test/unit/html.util.test.ts`
16. `/Users/eldarko/emkodev-foundation/emroute/test/unit/hash.renderer.test.ts`
17. `/Users/eldarko/emkodev-foundation/emroute/test/unit/page.component.test.ts`
18. `/Users/eldarko/emkodev-foundation/emroute/test/unit/abstract.component.test.ts`
19. `/Users/eldarko/emkodev-foundation/emroute/test/unit/widget.parser.test.ts`
20. `/Users/eldarko/emkodev-foundation/emroute/test/unit/widget.file.test.ts`
21. `/Users/eldarko/emkodev-foundation/emroute/test/unit/widget-resolve.util.test.ts`
22. `/Users/eldarko/emkodev-foundation/emroute/test/unit/overlay.service.test.ts`
23. `/Users/eldarko/emkodev-foundation/emroute/test/unit/sitemap.generator.test.ts`
24. `/Users/eldarko/emkodev-foundation/emroute/test/unit/context-provider.test.ts`

### Integration tests
25. `/Users/eldarko/emkodev-foundation/emroute/test/integration/cli.test.ts` -- Deno.Command, Deno.makeTempDir, Deno.writeTextFile, etc.
26. `/Users/eldarko/emkodev-foundation/emroute/test/integration/prod.server.test.ts` -- DenoFsRuntime, Deno.cwd, Deno.readTextFile

### Browser tests
27. `/Users/eldarko/emkodev-foundation/emroute/test/browser/shared/setup.ts` -- DenoFsRuntime, Deno.serve, jsr/npm imports, Playwright
28. `/Users/eldarko/emkodev-foundation/emroute/test/browser/shared/start-server.ts` -- Deno.env.get
29. `/Users/eldarko/emkodev-foundation/emroute/test/browser/none/ssr.test.ts`
30. `/Users/eldarko/emkodev-foundation/emroute/test/browser/leaf/leaf.test.ts`
31. `/Users/eldarko/emkodev-foundation/emroute/test/browser/leaf/hash.test.ts`
32. `/Users/eldarko/emkodev-foundation/emroute/test/browser/root/hydration.test.ts`
33. `/Users/eldarko/emkodev-foundation/emroute/test/browser/only/spa.test.ts`

## 8. Files to Create

1. `/Users/eldarko/emkodev-foundation/emroute/package.json` -- npm package configuration
2. `/Users/eldarko/emkodev-foundation/emroute/tsconfig.json` -- TypeScript config without `deno.ns`
3. `/Users/eldarko/emkodev-foundation/emroute/runtime/bun/fs/bun-fs.runtime.ts` -- Bun filesystem runtime implementation

## 9. Files to Delete

1. `/Users/eldarko/emkodev-foundation/emroute/deno.json` -- replaced by `package.json` + `tsconfig.json`

## 10. Files to Rename

1. `server/cli.deno.ts` -> `server/cli.ts` -- remove Deno suffix, rewrite contents
2. `runtime/deno/fs/deno-fs.runtime.ts` -> kept as-is for reference, replaced by `runtime/bun/fs/bun-fs.runtime.ts`

After migration is verified, the old Deno runtime directory can be removed:
- Delete `runtime/deno/` directory entirely

## 11. Verification

### Step 1: Type checking

```bash
cd emroute
bun run tsc --noEmit
```

All files must pass TypeScript type checking without `deno.ns` in `lib`.

### Step 2: Unit tests

```bash
bun test test/unit/*.test.ts
```

All 13+ unit test files must pass. These are the most straightforward to verify since they test
pure logic with no I/O.

### Step 3: Integration tests

```bash
bun test test/integration/*.test.ts
```

The CLI integration tests spawn subprocesses and create temp directories. Verify:
- `cli.test.ts` spawns `bun run server/cli.ts` instead of `deno run -A server/cli.deno.ts`
- Temp directory creation and cleanup works
- Generated manifest files are valid

### Step 4: Dev server startup

```bash
bun run server/cli.ts start
```

With a test project containing `routes/` directory:
- Server starts on default port 1420
- SSR HTML rendering works at `/html/`
- SSR Markdown rendering works at `/md/`
- Static file serving works
- File watcher detects changes and triggers rebuild

### Step 5: Build command

```bash
bun run server/cli.ts build --out .build
```

Verify:
- Manifest files generated
- JS bundles produced (when spa != 'none')
- HTML shell written with correct import map

### Step 6: Generate command

```bash
bun run server/cli.ts generate
```

Verify:
- `routes.manifest.g.ts` generated with correct routes
- `widgets.manifest.g.ts` generated if `widgets/` exists

### Step 7: Browser tests (last priority)

```bash
bun run test:bundle
bun test test/browser/**/*.test.ts
```

These require Playwright and a running server. Verify all four SPA modes work correctly.

### Smoke test checklist

- [ ] `bun run tsc --noEmit` passes
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] `bun run server/cli.ts start` starts dev server
- [ ] GET `/html/` returns SSR HTML
- [ ] GET `/md/` returns SSR Markdown
- [ ] File watcher triggers rebuild on `.page.ts` changes
- [ ] `bun run server/cli.ts build` produces bundles
- [ ] `bun run server/cli.ts generate` produces manifests
- [ ] Browser tests pass for all SPA modes
