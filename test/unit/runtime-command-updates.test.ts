/**
 * Runtime command() incremental updates
 *
 * Tests that writing, updating, and deleting files under routes/, widgets/,
 * and elements/ directories correctly updates manifests and built artifacts.
 * Uses BunSqliteRuntime (in-memory) for full isolation.
 */

import { test, expect, describe } from 'bun:test';
import { BunSqliteRuntime } from '../../runtime/bun/sqlite/bun-sqlite.runtime.ts';
import type { RouteNode } from '../../core/type/route-tree.type.ts';
import type { WidgetManifestEntry } from '../../core/type/widget.type.ts';
import type { ElementManifestEntry } from '../../core/type/element.type.ts';

/** Helper: query manifest as typed JSON. */
async function routeTree(runtime: BunSqliteRuntime): Promise<RouteNode> {
  const res = await runtime.query('/routes.manifest.json');
  return res.status === 404 ? {} : await res.json();
}

async function widgetEntries(runtime: BunSqliteRuntime): Promise<WidgetManifestEntry[]> {
  const res = await runtime.query('/widgets.manifest.json');
  return res.status === 404 ? [] : await res.json();
}

async function elementEntries(runtime: BunSqliteRuntime): Promise<ElementManifestEntry[]> {
  const res = await runtime.query('/elements.manifest.json');
  return res.status === 404 ? [] : await res.json();
}

describe('runtime command() incremental updates', () => {
  // ── Routes ──────────────────────────────────────────────────────────

  describe('routes', () => {
    test('write page.ts adds entry to manifest', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/about.page.ts', { body: 'export default {}' });

      const tree = await routeTree(runtime);
      expect(tree.children?.about).toBeDefined();
      expect(tree.children!.about!.files?.ts).toEqual('/routes/about.page.ts');
      runtime.close();
    });

    test('write page.md adds entry to manifest', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/index.page.md', { body: '# Home' });

      const tree = await routeTree(runtime);
      expect(tree.files?.md).toEqual('/routes/index.page.md');
      runtime.close();
    });

    test('write dynamic route adds entry to manifest', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/projects/[id]/index.page.ts', { body: 'export default {}' });

      const tree = await routeTree(runtime);
      expect(tree.children?.projects).toBeDefined();
      expect(tree.children!.projects!.dynamic).toBeDefined();
      expect(tree.children!.projects!.dynamic!.param).toEqual('id');
      runtime.close();
    });

    test('write error boundary adds to manifest', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/index.error.ts', { body: 'export default {}' });

      const tree = await routeTree(runtime);
      expect(tree.errorBoundary).toEqual('/routes/index.error.ts');
      runtime.close();
    });

    test('second write updates existing manifest without rescan', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/index.page.md', { body: '# Home' });
      await runtime.command('/routes/about.page.md', { body: '# About' });

      const tree = await routeTree(runtime);
      expect(tree.files?.md).toEqual('/routes/index.page.md');
      expect(tree.children?.about?.files?.md).toEqual('/routes/about.page.md');
      runtime.close();
    });

    test('non-matching filename does not affect manifest', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/readme.txt', { body: 'ignore me' });

      const tree = await routeTree(runtime);
      expect(tree.children).toBeUndefined();
      expect(tree.files).toBeUndefined();
      runtime.close();
    });
  });

  // ── Widgets ─────────────────────────────────────────────────────────

  describe('widgets', () => {
    test('write widget.ts adds entry to manifest', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/widgets/counter/counter.widget.ts', {
        body: 'export default class Counter {}',
      });

      const entries = await widgetEntries(runtime);
      expect(entries.length).toEqual(1);
      expect(entries[0]!.name).toEqual('counter');
      expect(entries[0]!.tagName).toEqual('widget-counter');
      expect(entries[0]!.modulePath).toContain('counter.widget.ts');
      runtime.close();
    });

    test('command() merges widget into stored manifest', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/widgets/counter/counter.widget.ts', {
        body: 'export default class Counter {}',
      });

      // Second widget should be merged, not trigger a rescan
      await runtime.command('/widgets/timer/timer.widget.ts', {
        body: 'export default class Timer {}',
      });

      const entries = await widgetEntries(runtime);
      expect(entries.length).toEqual(2);
      expect(entries[0]!.name).toEqual('counter');
      expect(entries[1]!.name).toEqual('timer');
      runtime.close();
    });

    test('write companion file appears in widget files', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/widgets/counter/counter.widget.ts', {
        body: 'export default class Counter {}',
      });
      await runtime.command('/widgets/counter/counter.widget.css', {
        body: '.counter { color: red; }',
      });

      const entries = await widgetEntries(runtime);
      expect(entries.length).toEqual(1);
      expect(entries[0]!.files?.css).toContain('counter.widget.css');
      runtime.close();
    });

    test('companion file without module is ignored', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/widgets/broken/broken.widget.css', { body: '.x {}' });

      const entries = await widgetEntries(runtime);
      expect(entries.length).toEqual(0);
      runtime.close();
    });

    test('multiple widgets are sorted by name', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/widgets/zebra/zebra.widget.ts', { body: 'export default {}' });
      await runtime.command('/widgets/alpha/alpha.widget.ts', { body: 'export default {}' });

      const entries = await widgetEntries(runtime);
      expect(entries.length).toEqual(2);
      expect(entries[0]!.name).toEqual('alpha');
      expect(entries[1]!.name).toEqual('zebra');
      runtime.close();
    });
  });

  // ── Elements ────────────────────────────────────────────────────────

  describe('elements', () => {
    test('write element.ts adds entry to manifest', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/elements/code-editor/code-editor.element.ts', {
        body: 'export default class CodeEditor extends HTMLElement {}',
      });

      const entries = await elementEntries(runtime);
      expect(entries.length).toEqual(1);
      expect(entries[0]!.name).toEqual('code-editor');
      expect(entries[0]!.tagName).toEqual('code-editor');
      expect(entries[0]!.modulePath).toContain('code-editor.element.ts');
      runtime.close();
    });

    test('element without hyphen in name is skipped', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/elements/button/button.element.ts', {
        body: 'export default class Button extends HTMLElement {}',
      });

      const entries = await elementEntries(runtime);
      expect(entries.length).toEqual(0);
      runtime.close();
    });

    test('command() merges element into stored manifest', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/elements/code-editor/code-editor.element.ts', {
        body: 'export default class CodeEditor extends HTMLElement {}',
      });
      await runtime.command('/elements/my-tabs/my-tabs.element.ts', {
        body: 'export default class MyTabs extends HTMLElement {}',
      });

      const entries = await elementEntries(runtime);
      expect(entries.length).toEqual(2);
      expect(entries[0]!.name).toEqual('code-editor');
      expect(entries[1]!.name).toEqual('my-tabs');
      runtime.close();
    });

    test('element.js fallback works', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/elements/my-tabs/my-tabs.element.js', {
        body: 'export default class MyTabs extends HTMLElement {}',
      });

      const entries = await elementEntries(runtime);
      expect(entries.length).toEqual(1);
      expect(entries[0]!.modulePath).toContain('my-tabs.element.js');
      runtime.close();
    });

    test('multiple elements are sorted by name', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/elements/z-widget/z-widget.element.ts', { body: 'export default {}' });
      await runtime.command('/elements/a-thing/a-thing.element.ts', { body: 'export default {}' });

      const entries = await elementEntries(runtime);
      expect(entries.length).toEqual(2);
      expect(entries[0]!.name).toEqual('a-thing');
      expect(entries[1]!.name).toEqual('z-widget');
      runtime.close();
    });
  });

  // ── Deletion ───────────────────────────────────────────────────────

  describe('route deletion', () => {
    test('delete page removes entry from manifest', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/about.page.ts', { body: 'export default {}' });
      await runtime.command('/routes/about.page.ts', { method: 'DELETE' });

      const tree = await routeTree(runtime);
      expect(tree.children?.about).toBeUndefined();
      runtime.close();
    });

    test('delete one file extension preserves others', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/about.page.ts', { body: 'export default {}' });
      await runtime.command('/routes/about.page.md', { body: '# About' });
      await runtime.command('/routes/about.page.ts', { method: 'DELETE' });

      const tree = await routeTree(runtime);
      expect(tree.children?.about).toBeDefined();
      expect(tree.children!.about!.files?.ts).toBeUndefined();
      expect(tree.children!.about!.files?.md).toEqual('/routes/about.page.md');
      runtime.close();
    });

    test('delete error boundary clears errorBoundary field', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/index.error.ts', { body: 'export default {}' });
      await runtime.command('/routes/index.error.ts', { method: 'DELETE' });

      const tree = await routeTree(runtime);
      expect(tree.errorBoundary).toBeUndefined();
      runtime.close();
    });

    test('delete redirect clears redirect field', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/old.redirect.ts', { body: 'export default { to: "/new" }' });
      await runtime.command('/routes/old.redirect.ts', { method: 'DELETE' });

      const tree = await routeTree(runtime);
      expect(tree.children?.old).toBeUndefined();
      runtime.close();
    });

    test('delete nested route prunes empty ancestors', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/projects/[id]/index.page.ts', { body: 'export default {}' });
      await runtime.command('/routes/projects/[id]/index.page.ts', { method: 'DELETE' });

      const tree = await routeTree(runtime);
      expect(tree.children?.projects).toBeUndefined();
      runtime.close();
    });

    test('delete nested route preserves sibling', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/about.page.ts', { body: 'export default {}' });
      await runtime.command('/routes/blog.page.ts', { body: 'export default {}' });
      await runtime.command('/routes/about.page.ts', { method: 'DELETE' });

      const tree = await routeTree(runtime);
      expect(tree.children?.about).toBeUndefined();
      expect(tree.children?.blog).toBeDefined();
      runtime.close();
    });
  });

  describe('widget deletion', () => {
    test('delete widget module removes entry from manifest', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/widgets/counter/counter.widget.ts', { body: 'export default class Counter {}' });
      await runtime.command('/widgets/counter/counter.widget.ts', { method: 'DELETE' });

      const entries = await widgetEntries(runtime);
      expect(entries.length).toEqual(0);
      runtime.close();
    });

    test('delete widget companion removes file but keeps entry', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/widgets/counter/counter.widget.ts', { body: 'export default class Counter {}' });
      await runtime.command('/widgets/counter/counter.widget.css', { body: '.c {}' });
      await runtime.command('/widgets/counter/counter.widget.css', { method: 'DELETE' });

      const entries = await widgetEntries(runtime);
      expect(entries.length).toEqual(1);
      expect(entries[0]!.files).toBeUndefined();
      runtime.close();
    });

    test('delete one widget preserves others', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/widgets/counter/counter.widget.ts', { body: 'export default class Counter {}' });
      await runtime.command('/widgets/timer/timer.widget.ts', { body: 'export default class Timer {}' });
      await runtime.command('/widgets/counter/counter.widget.ts', { method: 'DELETE' });

      const entries = await widgetEntries(runtime);
      expect(entries.length).toEqual(1);
      expect(entries[0]!.name).toEqual('timer');
      runtime.close();
    });
  });

  describe('element deletion', () => {
    test('delete element removes entry from manifest', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/elements/code-editor/code-editor.element.ts', { body: 'export default class CE extends HTMLElement {}' });
      await runtime.command('/elements/code-editor/code-editor.element.ts', { method: 'DELETE' });

      const entries = await elementEntries(runtime);
      expect(entries.length).toEqual(0);
      runtime.close();
    });

    test('delete one element preserves others', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/elements/code-editor/code-editor.element.ts', { body: 'export default class CE extends HTMLElement {}' });
      await runtime.command('/elements/my-tabs/my-tabs.element.ts', { body: 'export default class MT extends HTMLElement {}' });
      await runtime.command('/elements/code-editor/code-editor.element.ts', { method: 'DELETE' });

      const entries = await elementEntries(runtime);
      expect(entries.length).toEqual(1);
      expect(entries[0]!.name).toEqual('my-tabs');
      runtime.close();
    });
  });

  // ── Re-transpilation ──────────────────────────────────────────────

  describe('retranspilation', () => {
    test('updating .ts source retranspiles existing .js artifact', async () => {
      const runtime = new BunSqliteRuntime();
      // Write initial .ts and .js (simulating a prior build)
      await runtime.command('/widgets/counter/counter.widget.ts', { body: 'export const x: number = 1;' });
      await runtime.command('/widgets/counter/counter.widget.js', { body: 'export const x = 0;' });

      // Now update .ts via command — should retranspile and update .js
      await runtime.command('/widgets/counter/counter.widget.ts', { body: 'export const x: number = 42;' });

      const js = await runtime.query('/widgets/counter/counter.widget.js', { as: 'text' });
      expect(js).toContain('42');
      expect(js).not.toContain(': number'); // types stripped
      runtime.close();
    });

    test('updating companion inlines it into existing .js', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/widgets/counter/counter.widget.ts', { body: 'export default class Counter {}' });
      await runtime.command('/widgets/counter/counter.widget.js', { body: 'export default class Counter {}' });
      await runtime.command('/widgets/counter/counter.widget.css', { body: '.counter { color: red; }' });

      // Update CSS companion — should retranspile and inline
      await runtime.command('/widgets/counter/counter.widget.css', { body: '.counter { color: blue; }' });

      const js = await runtime.query('/widgets/counter/counter.widget.js', { as: 'text' });
      expect(js).toContain('__files');
      expect(js).toContain('color: blue');
      runtime.close();
    });

    test('no .js artifact means no retranspilation', async () => {
      const runtime = new BunSqliteRuntime();
      // Write .ts only — no .js exists
      await runtime.command('/widgets/counter/counter.widget.ts', { body: 'export const x: number = 1;' });

      // .js should still not exist
      const res = await runtime.handle('/widgets/counter/counter.widget.js');
      expect(res.status).toEqual(404);
      runtime.close();
    });

    test('route .ts retranspiles route .js', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/about.page.ts', { body: 'export const title: string = "old";' });
      await runtime.command('/routes/about.page.js', { body: 'export const title = "old";' });

      await runtime.command('/routes/about.page.ts', { body: 'export const title: string = "new";' });

      const js = await runtime.query('/routes/about.page.js', { as: 'text' });
      expect(js).toContain('"new"');
      expect(js).not.toContain(': string');
      runtime.close();
    });
  });

  // ── Manifest caching ───────────────────────────────────────────────

  describe('manifest caching', () => {
    test('cached routes manifest is returned on second query', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/index.page.md', { body: '# Home' });

      const res1 = await runtime.query('/routes.manifest.json');
      const res2 = await runtime.query('/routes.manifest.json');
      expect(res1.status).toEqual(200);
      expect(res2.status).toEqual(200);
      // Both should return the same tree
      const tree1 = await res1.json();
      const tree2 = await res2.json();
      expect(tree1).toEqual(tree2);
      runtime.close();
    });

    test('second command() under routesDir updates stored manifest', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/index.page.md', { body: '# Home' });

      // Stored manifest now exists — second write should update it, not be shadowed
      await runtime.command('/routes/about.page.md', { body: '# About' });

      const tree = await routeTree(runtime);
      expect(tree.files?.md).toEqual('/routes/index.page.md');
      expect(tree.children?.about).toBeDefined();
      runtime.close();
    });

    test('command under routesDir clears routes cache', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/index.page.md', { body: '# Home' });

      // Prime cache
      await runtime.query('/routes.manifest.json');

      // Write via command — should clear cache and update manifest
      await runtime.command('/routes/about.page.md', { body: '# About' });

      const tree = await routeTree(runtime);
      expect(tree.children?.about).toBeDefined();
      runtime.close();
    });
  });

  // ── Cross-directory isolation ──────────────────────────────────────

  describe('isolation', () => {
    test('writing to routes does not affect widgets manifest', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/index.page.md', { body: '# Home' });

      const entries = await widgetEntries(runtime);
      expect(entries.length).toEqual(0);
      runtime.close();
    });

    test('writing to widgets does not affect elements manifest', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/widgets/counter/counter.widget.ts', {
        body: 'export default class Counter {}',
      });

      const entries = await elementEntries(runtime);
      expect(entries.length).toEqual(0);
      runtime.close();
    });

    test('writing outside convention dirs has no manifest side effects', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/assets/logo.png', { body: 'fake png' });

      const tree = await routeTree(runtime);
      const widgets = await widgetEntries(runtime);
      const elements = await elementEntries(runtime);
      expect(tree).toEqual({});
      expect(widgets).toEqual([]);
      expect(elements).toEqual([]);
      runtime.close();
    });
  });
});
