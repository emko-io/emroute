import { assertEquals } from '@std/assert';
import { generateRoutesManifest } from '../../tool/route.generator.ts';
import type { DirEntry, FileSystem } from '../../tool/fs.type.ts';

/** In-memory filesystem for testing the route generator. */
function createMockFs(files: string[]): FileSystem {
  // Build directory tree from flat file list
  const dirs = new Map<string, DirEntry[]>();

  for (const filePath of files) {
    // Ensure all parent directories exist
    const parts = filePath.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!dirs.has(dir)) dirs.set(dir, []);
    }

    // Add file entry to its parent directory
    const parentDir = parts.slice(0, -1).join('/');
    const name = parts[parts.length - 1];
    const entries = dirs.get(parentDir) ?? [];
    entries.push({ name, isFile: true, isDirectory: false });
    dirs.set(parentDir, entries);

    // Add subdirectory entries to their parents
    for (let i = 1; i < parts.length - 1; i++) {
      const ancestor = parts.slice(0, i).join('/');
      const childName = parts[i];
      const ancestorEntries = dirs.get(ancestor) ?? [];
      if (!ancestorEntries.some((e) => e.name === childName)) {
        ancestorEntries.push({
          name: childName,
          isFile: false,
          isDirectory: true,
        });
        dirs.set(ancestor, ancestorEntries);
      }
    }
  }

  return {
    async *readDir(path: string) {
      const entries = dirs.get(path) ?? [];
      for (const entry of entries) yield entry;
    },
    writeTextFile: () => Promise.resolve(),
    exists: () => Promise.resolve(true),
  };
}

// ============================================================================
// Flat File Routes
// ============================================================================

Deno.test('generator - flat file produces exact route', async () => {
  const fs = createMockFs(['routes/about.page.md']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/about');
  assertEquals(result.routes[0].files?.md, 'routes/about.page.md');
});

// ============================================================================
// Directory Index Routes (Wildcard)
// ============================================================================

Deno.test('generator - directory index produces wildcard route', async () => {
  const fs = createMockFs(['routes/about/index.page.md']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/about/:rest*');
  assertEquals(result.routes[0].files?.md, 'routes/about/index.page.md');
});

Deno.test('generator - root index stays exact (no wildcard)', async () => {
  const fs = createMockFs(['routes/index.page.ts']);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/');
});

// ============================================================================
// Flat + Directory Coexistence
// ============================================================================

Deno.test('generator - flat and directory index are separate routes', async () => {
  const fs = createMockFs([
    'routes/crypto.page.html',
    'routes/crypto/index.page.md',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  const exact = result.routes.find((r) => r.pattern === '/crypto');
  assertEquals(exact?.files?.html, 'routes/crypto.page.html');

  const wildcard = result.routes.find((r) => r.pattern === '/crypto/:rest*');
  assertEquals(wildcard?.files?.md, 'routes/crypto/index.page.md');
});

Deno.test('generator - same file type: flat and directory produce separate routes', async () => {
  const fs = createMockFs([
    'routes/crypto.page.md',
    'routes/crypto/index.page.md',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  const exact = result.routes.find((r) => r.pattern === '/crypto');
  assertEquals(exact?.files?.md, 'routes/crypto.page.md');

  const wildcard = result.routes.find((r) => r.pattern === '/crypto/:rest*');
  assertEquals(wildcard?.files?.md, 'routes/crypto/index.page.md');
});

Deno.test('generator - children coexist with wildcard parent and flat layout', async () => {
  const fs = createMockFs([
    'routes/crypto.page.html',
    'routes/crypto/index.page.md',
    'routes/crypto/eth.page.md',
    'routes/crypto/sol.page.md',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  const exact = result.routes.find((r) => r.pattern === '/crypto');
  assertEquals(exact?.files?.html, 'routes/crypto.page.html');

  const wildcard = result.routes.find((r) => r.pattern === '/crypto/:rest*');
  assertEquals(wildcard?.files?.md, 'routes/crypto/index.page.md');

  const eth = result.routes.find((r) => r.pattern === '/crypto/eth');
  assertEquals(eth?.files?.md, 'routes/crypto/eth.page.md');

  const sol = result.routes.find((r) => r.pattern === '/crypto/sol');
  assertEquals(sol?.files?.md, 'routes/crypto/sol.page.md');
});

// ============================================================================
// Sort Order (wildcards last)
// ============================================================================

Deno.test('generator - wildcard routes sort after specific routes', async () => {
  const fs = createMockFs([
    'routes/crypto/index.page.md',
    'routes/crypto/eth.page.md',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes[0].pattern, '/crypto/eth');
  assertEquals(result.routes[1].pattern, '/crypto/:rest*');
});

// ============================================================================
// CSS Companion Files
// ============================================================================

Deno.test('generator - css companion file is grouped with page route', async () => {
  const fs = createMockFs([
    'routes/about.page.html',
    'routes/about.page.css',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/about');
  assertEquals(result.routes[0].files?.html, 'routes/about.page.html');
  assertEquals(result.routes[0].files?.css, 'routes/about.page.css');
});

Deno.test('generator - css companion with ts and md files', async () => {
  const fs = createMockFs([
    'routes/dashboard.page.ts',
    'routes/dashboard.page.md',
    'routes/dashboard.page.css',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].files?.ts, 'routes/dashboard.page.ts');
  assertEquals(result.routes[0].files?.md, 'routes/dashboard.page.md');
  assertEquals(result.routes[0].files?.css, 'routes/dashboard.page.css');
  assertEquals(result.routes[0].modulePath, 'routes/dashboard.page.ts');
});

Deno.test('generator - css file alone does not create a route', async () => {
  const fs = createMockFs([
    'routes/orphan.page.css',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  // CSS alone creates a group but getPrimaryModulePath returns '' so it's skipped
  assertEquals(result.routes.length, 0);
});

Deno.test('generator - nested css companion file', async () => {
  const fs = createMockFs([
    'routes/projects/[id].page.ts',
    'routes/projects/[id].page.css',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.routes.length, 1);
  assertEquals(result.routes[0].pattern, '/projects/:id');
  assertEquals(result.routes[0].files?.ts, 'routes/projects/[id].page.ts');
  assertEquals(result.routes[0].files?.css, 'routes/projects/[id].page.css');
});

// ============================================================================
// Error Handling
// ============================================================================

Deno.test('generator - index.error.ts at root becomes errorHandler', async () => {
  const fs = createMockFs([
    'routes/index.page.md',
    'routes/index.error.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.errorHandler?.pattern, '/');
  assertEquals(result.errorHandler?.type, 'error');
  assertEquals(result.errorHandler?.modulePath, 'routes/index.error.ts');
  assertEquals(result.errorBoundaries.length, 0);
});

Deno.test('generator - scoped .error.ts becomes error boundary', async () => {
  const fs = createMockFs([
    'routes/projects/[id].page.ts',
    'routes/projects/[id].error.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.errorBoundaries.length, 1);
  assertEquals(result.errorBoundaries[0].pattern, '/projects');
  assertEquals(result.errorBoundaries[0].modulePath, 'routes/projects/[id].error.ts');
  assertEquals(result.errorHandler, undefined);
});

Deno.test('generator - root error handler and scoped boundary coexist', async () => {
  const fs = createMockFs([
    'routes/index.error.ts',
    'routes/projects/[id].error.ts',
    'routes/projects/[id].page.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.errorHandler?.modulePath, 'routes/index.error.ts');
  assertEquals(result.errorBoundaries.length, 1);
  assertEquals(result.errorBoundaries[0].pattern, '/projects');
});

Deno.test('generator - bare error.ts at root is ignored (not a route)', async () => {
  const fs = createMockFs([
    'routes/index.page.md',
    'routes/error.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.errorHandler, undefined);
  assertEquals(result.errorBoundaries.length, 0);
  assertEquals(result.routes.length, 1);
});

Deno.test('generator - status pages are registered by code', async () => {
  const fs = createMockFs([
    'routes/index.page.md',
    'routes/404.page.html',
    'routes/401.page.ts',
  ]);
  const result = await generateRoutesManifest('routes', fs);

  assertEquals(result.statusPages.size, 2);
  assertEquals(result.statusPages.get(404)?.statusCode, 404);
  assertEquals(result.statusPages.get(404)?.files?.html, 'routes/404.page.html');
  assertEquals(result.statusPages.get(401)?.statusCode, 401);
  assertEquals(result.statusPages.get(401)?.files?.ts, 'routes/401.page.ts');
});
