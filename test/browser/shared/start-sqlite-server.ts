/**
 * SQLite Runtime Demo Server
 *
 * Serves pages entirely from SQLite :memory: — no filesystem.
 * Includes a form at /html/new to create pages dynamically.
 *
 * Usage: bun test/browser/shared/start-sqlite-server.ts
 */

import { BunSqliteRuntime } from '../../../runtime/bun/sqlite/bun-sqlite.runtime.ts';
import { buildClientBundles } from '../../../server/build.util.ts';
import { createEmrouteServer } from '../../../server/emroute.server.ts';
import type { EmrouteServer } from '../../../server/server-api.type.ts';

const port = Number(process.env.TEST_PORT ?? 4102);
const spaMode = (process.env.SPA_MODE ?? 'root') as 'none' | 'root';

const runtime = new BunSqliteRuntime(':memory:', { routesDir: '/routes' });

// ── Seed routes ──────────────────────────────────────────────────────

await runtime.command('/routes/index.page.ts', {
  body: `export default {
  getData() {
    return {
      title: 'Home',
      items: ['SQLite', 'In-Memory', 'No Filesystem'],
    };
  },
  getTitle(ctx) { return ctx.data.title; },
  renderHTML(args) {
    const { data, context } = args;
    const nav = '<nav>'
      + '<a href="/html">Home</a> | '
      + '<a href="/html/about">About</a> | '
      + '<a href="/html/blog">Blog</a> | '
      + '<a href="/html/new">New Page</a>'
      + '</nav>';
    if (!context.isLeaf) {
      return nav + '<router-slot></router-slot>';
    }
    return nav
      + '<h1>' + data.title + '</h1>'
      + '<p>This page is served entirely from SQLite <code>:memory:</code>.</p>'
      + '<ul>' + data.items.map((i) => '<li>' + i + '</li>').join('') + '</ul>';
  },
};`,
});

await runtime.command('/routes/about.page.md', {
  body: `# About

This is a markdown page stored in SQLite.

No files on disk. The runtime reads from a database table.
`,
});

await runtime.command('/routes/blog.page.ts', {
  body: `export default {
  getData() {
    const posts = [
      { slug: 'first', title: 'First Post', date: '2026-02-23' },
      { slug: 'second', title: 'Second Post', date: '2026-02-22' },
      { slug: 'third', title: 'Virtual Storage', date: '2026-02-21' },
    ];
    return { posts };
  },
  getTitle() { return 'Blog'; },
  renderHTML(args) {
    const { data } = args;
    const cards = data.posts.map((p) =>
      '<article><h2>' + p.title + '</h2><time>' + p.date + '</time></article>'
    ).join('');
    return '<h1>Blog</h1>' + cards;
  },
};`,
});

await runtime.command('/routes/new.page.html', {
  body: `<h1>Create a Page</h1>
<form method="POST" action="/api/pages">
  <label>Slug <input name="slug" required placeholder="my-page"></label><br>
  <label>Type
    <select name="type">
      <option value="md">Markdown</option>
      <option value="html">HTML</option>
    </select>
  </label><br>
  <label>Content<br>
    <textarea name="content" rows="10" cols="60" required placeholder="# My Page"></textarea>
  </label><br>
  <button type="submit">Create</button>
</form>`,
});

// ── Build ────────────────────────────────────────────────────────────

if (spaMode !== 'none') {
  await buildClientBundles({
    runtime,
    root: import.meta.dirname!,
    spa: spaMode,
  });
}

// ── Server ───────────────────────────────────────────────────────────

let emroute: EmrouteServer;

async function rebuildServer(): Promise<void> {
  emroute = await createEmrouteServer({ spa: spaMode }, runtime);
}

await rebuildServer();

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    // POST /api/pages — create a new page in SQLite
    if (req.method === 'POST' && url.pathname === '/api/pages') {
      const form = await req.formData();
      const slug = (form.get('slug') as string)?.trim();
      const type = (form.get('type') as string) ?? 'md';
      const content = (form.get('content') as string) ?? '';

      if (!slug) {
        return new Response('Slug is required', { status: 400 });
      }

      const ext = type === 'html' ? 'page.html' : 'page.md';
      const path = `/routes/${slug}.${ext}`;
      await runtime.command(path, { body: content });

      // Rebuild server to pick up new route
      await rebuildServer();

      const base = spaMode === 'root' ? '/app' : '/html';
      return Response.redirect(new URL(`${base}/${slug}`, url.origin), 303);
    }

    return await emroute.handleRequest(req) ?? new Response('Not Found', { status: 404 });
  },
});

console.log(`\nSQLite runtime server ready on http://localhost:${port}`);
console.log(`SPA mode: ${spaMode}`);
console.log('All content served from :memory: — zero filesystem.\n');
