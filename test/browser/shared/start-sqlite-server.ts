/**
 * SQLite Runtime Demo Server
 *
 * Serves pages entirely from SQLite :memory: — no filesystem.
 *
 * Usage: bun test/browser/shared/start-sqlite-server.ts
 */

import { BunSqliteRuntime } from '../../../runtime/bun/sqlite/bun-sqlite.runtime.ts';
import { createEmrouteServer } from '../../../server/emroute.server.ts';

const port = Number(process.env.TEST_PORT ?? 4102);

const runtime = new BunSqliteRuntime(':memory:', { routesDir: '/routes' });

// Seed routes
await runtime.command('/routes/index.page.ts', {
  body: `export default {
  getData() {
    return {
      title: 'Home',
      items: ['SQLite', 'In-Memory', 'No Filesystem'],
    };
  },
  getTitle(ctx: any) { return ctx.data.title; },
  renderHTML(args: any) {
    const { data, context } = args;
    if (!context.isLeaf) {
      return '<nav><a href="/html">Home</a> | <a href="/html/about">About</a> | <a href="/html/blog">Blog</a></nav>'
        + '<router-slot></router-slot>';
    }
    return '<h1>' + data.title + '</h1>'
      + '<p>This page is served entirely from SQLite <code>:memory:</code>.</p>'
      + '<ul>' + data.items.map((i: string) => '<li>' + i + '</li>').join('') + '</ul>';
  },
};`,
});

await runtime.command('/routes/about.page.md', {
  body: `# About

This is a markdown page stored in SQLite.

No files on disk. The runtime reads from a database table.

[Back to home](/html)
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
  getTitle(ctx: any) { return 'Blog'; },
  renderHTML(args: any) {
    const { data } = args;
    const cards = data.posts.map((p: any) =>
      '<article><h2>' + p.title + '</h2><time>' + p.date + '</time></article>'
    ).join('');
    return '<h1>Blog</h1>' + cards + '<p><a href="/html">Back to home</a></p>';
  },
};`,
});

const emroute = await createEmrouteServer({
  spa: 'none',
  moduleLoader: runtime.createModuleLoader(),
}, runtime);

Bun.serve({
  port,
  async fetch(req) {
    return await emroute.handleRequest(req) ?? new Response('Not Found', { status: 404 });
  },
});

console.log(`\nSQLite runtime server ready on http://localhost:${port}/html`);
console.log('All content served from :memory: — zero filesystem.\n');
