# Runtime

## What is a Runtime?

A Runtime is emroute's storage abstraction. It provides a uniform interface for
reading and writing files — regardless of whether those files live on a
filesystem, in a SQLite database, in memory, or behind a REST API.

The server, the bundler, the manifest scanner, and SSR all talk to the Runtime
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

`UniversalFsRuntime` and `BunFsRuntime` use native `import()` (Bun and Deno
understand TypeScript natively; Node needs `--experimental-strip-types` or tsx).
`BunSqliteRuntime` transpiles via `Bun.Transpiler` and imports from a blob URL.
Your runtime can do whatever makes sense — compile, cache, fetch from a CDN.

### Bundling

When `config.entryPoint` is set, `bundle()` runs esbuild to produce client-side
JavaScript bundles. All output is written back through `this.command()`, so
it works for any storage backend.

```typescript
const runtime = new UniversalFsRuntime('my-app', {
  entryPoint: '/main.ts',
  // Auto-inferred: bundlePaths: { emroute: '/emroute.js', app: '/app.js' }
});

await runtime.bundle();
// /emroute.js, /app.js, /index.html now exist in the runtime
```

If the entry point file doesn't exist, `bundle()` generates a default `main.ts`
that imports route and widget manifests, registers widgets, and creates the SPA
router.

### Manifest resolution

Route and widget manifests are resolved automatically. When the server requests
`/routes.manifest.json` or `/widgets.manifest.json` and the file doesn't exist,
the runtime scans the configured directories and returns the manifest as JSON.
No manual manifest generation needed.

## Built-in runtimes

### UniversalFsRuntime

Files on disk using only `node:` APIs (`node:fs/promises`, `node:path`,
`node:module`) and esbuild for transpilation. Works on Node, Deno, and Bun.

```typescript
import { UniversalFsRuntime } from '@emkodev/emroute/runtime/universal/fs';

const runtime = new UniversalFsRuntime('path/to/app', {
  routesDir: '/routes',     // default
  widgetsDir: '/widgets',   // default
  entryPoint: '/main.ts',   // enables bundling
});
```

### BunFsRuntime

Files on disk using Bun-native APIs (`Bun.file()`, `Bun.write()`,
`Bun.Transpiler`) for better I/O performance. Same interface as
`UniversalFsRuntime`, but only runs on Bun.

```typescript
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';

const runtime = new BunFsRuntime('path/to/app', {
  routesDir: '/routes',     // default
  widgetsDir: '/widgets',   // default
  entryPoint: '/main.ts',   // enables bundling
});
```

### BunSqliteRuntime

Files in SQLite. Useful for CMS scenarios where content is managed through an
admin interface, not the filesystem.

```typescript
import { BunSqliteRuntime } from '@emkodev/emroute/runtime/bun/sqlite';

// In-memory (great for tests)
const runtime = new BunSqliteRuntime(':memory:', {
  entryPoint: '/main.ts',
});

// Persistent
const runtime = new BunSqliteRuntime('content.db', {
  entryPoint: '/main.ts',
});

// Write content programmatically
await runtime.command('/routes/index.page.md', { body: '# Welcome' });
await runtime.command('/routes/about.page.md', { body: '# About Us' });

// Bundle and serve — works exactly like the filesystem runtime
await runtime.bundle();
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

| Method | Purpose |
|--------|---------|
| `handle(resource, init?)` | Raw request passthrough. Route GET → read, PUT → write. |
| `query(resource, options?)` | Read with optional `{ as: 'text' }` shortcut. |

### What you should override

| Method | Purpose | Default |
|--------|---------|---------|
| `loadModule(path)` | Dynamic `import()` for SSR | Throws "not implemented" |
| `bundle()` | Build client JS bundles | No-op |
| `static transpile(source)` | TS → JS transformation | Throws "not implemented" |
| `static stopBundler()` | Clean up bundler resources | No-op |

### What you get for free

The base `Runtime` class provides:

- **`command(resource, options?)`** — write shortcut (delegates to `handle` with PUT)
- **`resolveRoutesManifest()`** — scans `routesDir`, builds routes manifest JSON
- **`resolveWidgetsManifest()`** — scans `widgetsDir`, builds widgets manifest JSON
- **`writeShell(paths)`** — generates `index.html` with import map and script tags
- **`walkDirectory(dir)`** — async generator that recursively lists files
- **`invalidateManifests()`** — clears cached manifests for the next scan

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
