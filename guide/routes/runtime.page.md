# Runtime

## What is a Runtime?

A Runtime is emroute's storage abstraction. It provides a uniform interface for
reading and writing files — regardless of whether those files live on a
filesystem, in a SQLite database, in memory, or behind a REST API.

The server, the build step, the manifest scanner, and SSR all talk to the Runtime
through the same `fetch()`-shaped API: `Request` in, `Response` out. No code
outside the Runtime knows or cares where the bytes actually come from.

## Why abstract it?

Without the abstraction, every part of the system would need filesystem access.
That works for a traditional Node/Bun server, but breaks for:

- **CMS backends** — pages stored in a database, not on disk
- **Edge deployments** — no persistent filesystem
- **In-memory testing** — fast tests without touching disk
- **Virtual filesystems** — files generated on the fly

By making storage pluggable, emroute supports all of these with zero changes to
the core framework. The same server code that renders pages from a `routes/`
directory on disk can render pages from a SQLite table or a remote API.

## The interface

A Runtime has three access patterns:

```typescript
// Read — returns a full Response with headers, status, body
const response = await runtime.query('/routes/index.page.md');
const html = await response.text();

// Read shortcut — skip metadata, get contents directly
const text = await runtime.query('/routes/index.page.md', { as: 'text' });

// Write — defaults to PUT
await runtime.command('/routes/new-page.page.md', { body: '# New Page' });
```

Directory listings return JSON arrays of entry names (files without suffix,
directories with trailing `/`):

```typescript
const response = await runtime.query('/routes/');
const entries = await response.json();
// ["index.page.md", "about.page.md", "blog/"]
```

### Module loading

The server needs to `import()` TypeScript page and widget modules for SSR.
Each runtime implements this:

```typescript
const mod = await runtime.loadModule('/routes/about.page.ts');
// mod.default is the page component
```

`BunFsRuntime` reads the file, transpiles if `.ts`, and imports via a unique
URL (with cache-busting query string). Every call returns the current file
contents — no stale module cache. CMS writes via `command()` are reflected on
the next request without restarting the server.

`UniversalFsRuntime` uses native `import()` (Deno understands TypeScript
natively; Node needs `--experimental-strip-types` or tsx).
`BunSqliteRuntime` transpiles via `Bun.Transpiler` and imports from a blob URL.
Your runtime can do whatever makes sense — compile, cache, fetch from a CDN.

### Transpilation

The runtime provides a `transpile()` method for TypeScript → JavaScript
conversion, used by `buildClientBundles()` to produce browser-loadable
`app.js`:

```typescript
const js = await runtime.transpile(tsSource);
```

```table
{
  "head": [
    "Runtime",
    "`transpile()` implementation"
  ],
  "body": [
    [
      "`BunFsRuntime`",
      "`Bun.Transpiler`"
    ],
    [
      "`BunSqliteRuntime`",
      "`Bun.Transpiler`"
    ],
    [
      "`UniversalFsRuntime`",
      "**not implemented** — throws"
    ],
    [
      "`FetchRuntime`",
      "**not implemented** — throws"
    ]
  ]
}
```

If your runtime needs to support `buildClientBundles()` (SPA modes), override
`transpile()`. On Node/Deno, that typically means wrapping esbuild, swc, or a
similar tool. On Bun, the built-in `Bun.Transpiler` is available.

### On-the-fly transpilation

`BunFsRuntime` serves `.ts` files as transpiled JavaScript automatically. When
a `.ts` file is requested (by the browser or any HTTP client), the runtime:

1. Reads the TypeScript source
2. Transpiles to JavaScript via `Bun.Transpiler`
3. Discovers companion files (`.html`, `.md`, `.css`) with the same base name
4. Inlines them as `export const __files = { html: \`...\`, md: \`...\` }`
5. Returns the result as `application/javascript`

This means browsers can load `.ts` modules directly — manifests reference `.ts`
paths and the runtime handles the rest. No build step is required for
development or for CMS-like apps where content changes at runtime.

Steps 2–4 are implemented as `transpileModule(path, source)` on the abstract
`Runtime` class. Custom runtimes can call it from their read path to add
on-the-fly transpilation — override `transpile()` for the type-stripping
engine, and `transpileModule()` handles companion discovery and inlining.

### Building client bundles (optional)

For SPA modes, `buildClientBundles()` produces the static client assets that
the browser needs:

```typescript
import { buildClientBundles } from '@emkodev/emroute/server/build';

await buildClientBundles({
  runtime,
  root: import.meta.dirname!,
  spa: 'root',
  entryPoint: '/main.ts',  // optional, defaults to '/main.ts'
});
```

The build step:

1. Copies the pre-built `emroute.js` framework bundle into the runtime
2. Transpiles the consumer's `main.ts` (or generates one) into `app.js` via
   `runtime.transpile()`
3. Copies `main.css` from disk if present
4. Writes a merged `importmap.json`

Per-module compilation of pages and widgets (merging `.ts` source with `.html`,
`.md`, `.css` companions into a single `.js` artifact) happens at request time
by the runtime's `transpileModule()`, not as part of this build step.

### Manifest resolution

Route and widget manifests are resolved automatically. When the server requests
`/routes.manifest.json` or `/widgets.manifest.json` and the file doesn't exist,
the runtime scans the configured directories and returns the manifest as JSON.
No manual manifest generation needed.

## Built-in runtimes

### UniversalFsRuntime

Files on disk using only `node:` APIs (`node:fs/promises`, `node:path`). Works
on Node, Deno, and Bun. No `transpile()` implementation — suitable for
`spa: 'none'` setups, or pair with a custom transpile override for SPA modes.

```typescript
import { UniversalFsRuntime } from '@emkodev/emroute/runtime/universal/fs';

const runtime = new UniversalFsRuntime('path/to/app', {
  routesDir: '/routes',     // default
  widgetsDir: '/widgets',   // default
});
```

### BunFsRuntime

Files on disk using Bun-native APIs (`Bun.file()`, `Bun.write()`,
`Bun.Transpiler`) for better I/O performance. Same interface as
`UniversalFsRuntime`, plus on-the-fly `.ts` serving and a working
`transpile()`. Bun-only.

```typescript
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';

const runtime = new BunFsRuntime('path/to/app');
```

### BunSqliteRuntime

Files in SQLite. Useful for CMS scenarios where content is managed through an
admin interface, not the filesystem.

```typescript
import { BunSqliteRuntime } from '@emkodev/emroute/runtime/bun/sqlite';

// In-memory (great for tests)
const runtime = new BunSqliteRuntime(':memory:');

// Persistent
const runtime = new BunSqliteRuntime('content.db');

// Write content programmatically
await runtime.command('/routes/index.page.md', { body: '# Welcome' });
await runtime.command('/routes/about.page.md', { body: '# About Us' });
```

### FetchRuntime

Browser-compatible runtime that fetches files from the server over HTTP. Used
by `bootEmrouteApp()` to load manifests and modules in the browser.

```typescript
import { FetchRuntime } from '@emkodev/emroute/runtime/fetch';

const runtime = new FetchRuntime(location.origin);
```

## Creating your own Runtime

Extend the `Runtime` base class and implement `handle()` and `query()`:

```typescript
import { Runtime, type FetchParams, type FetchReturn } from '@emkodev/emroute/runtime';

class MyRuntime extends Runtime {
  handle(resource: FetchParams[0], init?: FetchParams[1]): FetchReturn {
    const url = typeof resource === 'string' ? resource : new URL(resource.url).pathname;
    const method = init?.method ?? 'GET';

    if (method === 'PUT') {
      // Store the file
      return this.store(url, init?.body ?? null);
    }
    // Read the file
    return this.load(url);
  }

  query(resource: FetchParams[0], options: FetchParams[1] & { as: 'text' }): Promise<string>;
  query(resource: FetchParams[0], options?: FetchParams[1]): FetchReturn;
  query(resource: FetchParams[0], options?: FetchParams[1] & { as?: 'text' }): Promise<Response | string> {
    if (options?.as === 'text') {
      // Fast path — return string directly, skip Response overhead
      return this.loadText(url);
    }
    return this.handle(resource, options);
  }

  override loadModule(path: string): Promise<unknown> {
    // Load and execute a module from your storage
  }

  private async load(path: string): Promise<Response> {
    // Return file content as Response, or 404
  }

  private async store(path: string, body: BodyInit | null): Promise<Response> {
    // Store content, return 204
  }

  private async loadText(path: string): Promise<string> {
    // Return file content as string
  }
}
```

### What you must implement

```table
{
  "head": [
    "Method",
    "Purpose"
  ],
  "body": [
    [
      "`handle(resource, init?)`",
      "Raw request passthrough. Route GET → read, PUT → write."
    ],
    [
      "`query(resource, options?)`",
      "Read with optional `{ as: 'text' }` shortcut."
    ]
  ]
}
```

### What you should override

```table
{
  "head": [
    "Method",
    "Purpose",
    "Default"
  ],
  "body": [
    [
      "`loadModule(path)`",
      "Dynamic `import()` for SSR",
      "Throws \"not implemented\""
    ],
    [
      "`transpile(source)`",
      "TS → JS transformation",
      "Throws \"not implemented\""
    ]
  ]
}
```

### What you get for free

The base `Runtime` class provides:

- **`command(resource, options?)`** — write shortcut (delegates to `handle` with PUT)
- **`resolveRoutesManifest()`** — scans `routesDir`, builds routes manifest JSON
- **`resolveWidgetsManifest()`** — scans `widgetsDir`, builds widgets manifest JSON
- **`walkDirectory(dir)`** — async generator that recursively lists files
- **`invalidateManifests()`** — clears cached manifests for the next scan
- **`transpileModule(path, source)`** — protected helper that calls
  `transpile()` and inlines companion files as `__files`

### Directory listing contract

Your runtime must return directory listings as JSON arrays when a path ends with
`/`. Each entry is a filename (for files) or `name/` (for subdirectories):

```json
["index.page.md", "about.page.md", "blog/"]
```

Return 404 if the directory doesn't exist. The manifest scanner and `walkDirectory`
depend on this convention.

### Example: REST API Runtime

```typescript
class ApiRuntime extends Runtime {
  constructor(private baseUrl: string, config?: RuntimeConfig) {
    super(config);
  }

  handle(resource: FetchParams[0], init?: FetchParams[1]): FetchReturn {
    const path = typeof resource === 'string' ? resource : new URL(resource.url).pathname;
    return fetch(`${this.baseUrl}${path}`, init);
  }

  query(resource: FetchParams[0], options: FetchParams[1] & { as: 'text' }): Promise<string>;
  query(resource: FetchParams[0], options?: FetchParams[1]): FetchReturn;
  query(resource: FetchParams[0], options?: FetchParams[1] & { as?: 'text' }): Promise<Response | string> {
    if (options?.as === 'text') {
      const path = typeof resource === 'string' ? resource : new URL(resource.url).pathname;
      return fetch(`${this.baseUrl}${path}`).then(r => r.text());
    }
    return this.handle(resource, options);
  }
}
```

### Example: Existing CMS Schema

```typescript
class CmsRuntime extends Runtime {
  constructor(private db: Database, config?: RuntimeConfig) {
    super(config);
  }

  // ... handle() and query() map paths to your existing schema:
  // query('/routes/about.page.html') → SELECT html FROM pages WHERE slug = 'about'
  // query('/routes/')                → SELECT slug FROM pages (as JSON array)
}
```

The Runtime doesn't prescribe your storage schema. It prescribes the interface.
Your existing `pages` table with `html_content`, `markdown_content`, and
`script` columns works perfectly — just map the paths to your columns.

Next: [SPA Mode](spa-mode)
