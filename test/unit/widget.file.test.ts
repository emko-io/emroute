/**
 * Unit tests for Widget File Handling
 *
 * Tests cover:
 * - Widget file discovery from widgets directory
 * - Companion file detection (.html, .md, .css)
 * - Widget naming validation
 * - File path resolution
 * - Widget manifest generation
 * - Merging of discovered and declared files
 */

import { test, expect, describe } from 'bun:test';
import type { WidgetManifestEntry } from '../../src/type/widget.type.ts';
import { Runtime } from '../../runtime/abstract.runtime.ts';
import { discoverWidgets } from '../../server/scanner.util.ts';
import { generateWidgetsManifestCode } from '../../server/codegen.util.ts';

/**
 * Mock Runtime for testing widget discovery
 */
class MockFileSystem extends Runtime {
  private files: Set<string> = new Set();
  private dirs: Set<string> = new Set();

  addFile(path: string): void {
    this.files.add(path);
  }

  addDir(path: string): void {
    this.dirs.add(path);
  }

  handle(
    resource: Parameters<typeof fetch>[0],
    _init?: Parameters<typeof fetch>[1],
  ): ReturnType<typeof fetch> {
    const path = typeof resource === 'string'
      ? resource
      : resource instanceof URL
      ? resource.pathname
      : resource.url;

    // Directory listing: path ends with /
    if (path.endsWith('/')) {
      const dirPath = path.slice(0, -1); // strip trailing /
      const children: string[] = [];

      for (const d of this.dirs) {
        if (d.startsWith(dirPath + '/')) {
          const relative = d.slice((dirPath + '/').length);
          const parts = relative.split('/');
          if (parts.length === 1) {
            children.push(parts[0] + '/');
          }
        }
      }

      for (const f of this.files) {
        if (f.startsWith(dirPath + '/')) {
          const relative = f.slice((dirPath + '/').length);
          const parts = relative.split('/');
          if (parts.length === 1) {
            children.push(parts[0]);
          }
        }
      }

      return Promise.resolve(new Response(JSON.stringify(children), { status: 200 }));
    }

    // File/dir existence check
    if (this.files.has(path) || this.dirs.has(path)) {
      return Promise.resolve(new Response('', { status: 200 }));
    }

    return Promise.resolve(new Response('Not found', { status: 404 }));
  }

  query(
    resource: Parameters<typeof fetch>[0],
    options: Parameters<typeof fetch>[1] & { as: 'text' },
  ): Promise<string>;
  query(
    resource: Parameters<typeof fetch>[0],
    options?: Parameters<typeof fetch>[1],
  ): ReturnType<typeof fetch>;
  query(
    resource: Parameters<typeof fetch>[0],
    options?: Parameters<typeof fetch>[1] & { as?: 'text' },
  ): Promise<string> | ReturnType<typeof fetch> {
    if (options && 'as' in options && options.as === 'text') {
      return this.handle(resource, options).then((r) => r.text()) as Promise<string>;
    }
    return this.handle(resource, options) as ReturnType<typeof fetch>;
  }
}

// ============================================================================
// discoverWidgets Tests
// ============================================================================

test('discoverWidgets - single widget module with all companion files', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/greeting');
  fs.addFile('widgets/greeting/greeting.widget.ts');
  fs.addFile('widgets/greeting/greeting.widget.html');
  fs.addFile('widgets/greeting/greeting.widget.md');
  fs.addFile('widgets/greeting/greeting.widget.css');

  const entries = await discoverWidgets('widgets', fs);

  expect(entries.length).toEqual(1);
  expect(entries[0].name).toEqual('greeting');
  expect(entries[0].modulePath).toEqual('greeting/greeting.widget.ts');
  expect(entries[0].tagName).toEqual('widget-greeting');
  expect(entries[0].files).toBeDefined();
  expect(entries[0].files!.html).toEqual('greeting/greeting.widget.html');
  expect(entries[0].files!.md).toEqual('greeting/greeting.widget.md');
  expect(entries[0].files!.css).toEqual('greeting/greeting.widget.css');
});

test('discoverWidgets - widget module without companion files', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/stat-card');
  fs.addFile('widgets/stat-card/stat-card.widget.ts');

  const entries = await discoverWidgets('widgets', fs);

  expect(entries.length).toEqual(1);
  expect(entries[0].name).toEqual('stat-card');
  expect(entries[0].modulePath).toEqual('stat-card/stat-card.widget.ts');
  expect(entries[0].tagName).toEqual('widget-stat-card');
  expect(entries[0].files).toEqual(undefined);
});

test('discoverWidgets - widget module with some companion files', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/card');
  fs.addFile('widgets/card/card.widget.ts');
  fs.addFile('widgets/card/card.widget.html');
  fs.addFile('widgets/card/card.widget.css');

  const entries = await discoverWidgets('widgets', fs);

  expect(entries.length).toEqual(1);
  expect(entries[0].files).toBeDefined();
  expect(entries[0].files!.html).toEqual('card/card.widget.html');
  expect(entries[0].files!.css).toEqual('card/card.widget.css');
  expect(entries[0].files!.md).toEqual(undefined);
});

test('discoverWidgets - ignores directories without module file', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/greeting');
  fs.addFile('widgets/greeting/greeting.widget.ts');
  fs.addDir('widgets/styles');
  fs.addFile('widgets/styles/some-style.css');

  const entries = await discoverWidgets('widgets', fs);

  expect(entries.length).toEqual(1);
  expect(entries[0].name).toEqual('greeting');
});

test('discoverWidgets - multiple widgets sorted alphabetically', async () => {
  const fs = new MockFileSystem();
  const names = ['zulu', 'alpha', 'mike', 'bravo'];
  for (const name of names) {
    fs.addDir(`widgets/${name}`);
    fs.addFile(`widgets/${name}/${name}.widget.ts`);
  }

  const entries = await discoverWidgets('widgets', fs);

  expect(entries.length).toEqual(4);
  expect(entries[0].name).toEqual('alpha');
  expect(entries[1].name).toEqual('bravo');
  expect(entries[2].name).toEqual('mike');
  expect(entries[3].name).toEqual('zulu');
});

test('discoverWidgets - path prefix is applied to module and file paths', async () => {
  const fs = new MockFileSystem();
  fs.addDir('src/widgets/counter');
  fs.addFile('src/widgets/counter/counter.widget.ts');
  fs.addFile('src/widgets/counter/counter.widget.html');

  const entries = await discoverWidgets('src/widgets', fs, 'src/widgets');

  expect(entries.length).toEqual(1);
  expect(entries[0].modulePath).toEqual('src/widgets/counter/counter.widget.ts');
  expect(entries[0].files!.html).toEqual('src/widgets/counter/counter.widget.html');
});

test('discoverWidgets - empty directory returns empty array', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets');

  const entries = await discoverWidgets('widgets', fs);

  expect(entries.length).toEqual(0);
});

test('discoverWidgets - kebab-case widget names generate correct tag names', async () => {
  const fs = new MockFileSystem();
  const names = ['hero-banner', 'article-card', 'user-profile', 'search-bar'];
  for (const name of names) {
    fs.addDir(`widgets/${name}`);
    fs.addFile(`widgets/${name}/${name}.widget.ts`);
  }

  const entries = await discoverWidgets('widgets', fs);

  expect(entries[0].tagName).toEqual('widget-article-card');
  expect(entries[1].tagName).toEqual('widget-hero-banner');
  expect(entries[2].tagName).toEqual('widget-search-bar');
  expect(entries[3].tagName).toEqual('widget-user-profile');
});

// ============================================================================
// generateWidgetsManifestCode Tests
// ============================================================================

test('generateWidgetsManifestCode - empty entries array', () => {
  const entries: WidgetManifestEntry[] = [];
  const code = generateWidgetsManifestCode(entries);

  expect(code).toContain('export const widgetsManifest');
  expect(code).toContain('WidgetsManifest');
  expect(code).toContain('widgets: [');
  expect(code).toContain('moduleLoaders: {');
});

test('generateWidgetsManifestCode - single widget entry', () => {
  const entries: WidgetManifestEntry[] = [
    {
      name: 'greeting',
      modulePath: 'widgets/greeting/greeting.widget.ts',
      tagName: 'widget-greeting',
    },
  ];
  const code = generateWidgetsManifestCode(entries);

  expect(code).toContain("name: 'greeting'");
  expect(code).toContain("modulePath: 'widgets/greeting/greeting.widget.ts'");
  expect(code).toContain("tagName: 'widget-greeting'");
});

test('generateWidgetsManifestCode - widget with companion files', () => {
  const entries: WidgetManifestEntry[] = [
    {
      name: 'card',
      modulePath: 'widgets/card/card.widget.ts',
      tagName: 'widget-card',
      files: {
        html: 'widgets/card/card.widget.html',
        md: 'widgets/card/card.widget.md',
        css: 'widgets/card/card.widget.css',
      },
    },
  ];
  const code = generateWidgetsManifestCode(entries);

  expect(code).toContain("'card'");
  expect(code).toContain('files: {');
  expect(code).toContain("html: 'widgets/card/card.widget.html'");
  expect(code).toContain("md: 'widgets/card/card.widget.md'");
  expect(code).toContain("css: 'widgets/card/card.widget.css'");
});

test('generateWidgetsManifestCode - multiple widgets with various file combinations', () => {
  const entries: WidgetManifestEntry[] = [
    {
      name: 'alpha',
      modulePath: 'widgets/alpha/alpha.widget.ts',
      tagName: 'widget-alpha',
      files: { html: 'widgets/alpha/alpha.widget.html' },
    },
    {
      name: 'beta',
      modulePath: 'widgets/beta/beta.widget.ts',
      tagName: 'widget-beta',
      files: {
        html: 'widgets/beta/beta.widget.html',
        css: 'widgets/beta/beta.widget.css',
      },
    },
    {
      name: 'gamma',
      modulePath: 'widgets/gamma/gamma.widget.ts',
      tagName: 'widget-gamma',
    },
  ];
  const code = generateWidgetsManifestCode(entries);

  expect(code).toContain("'alpha'");
  expect(code).toContain("'beta'");
  expect(code).toContain("'gamma'");
  expect(code).toContain("() => import('./");
});

test('generateWidgetsManifestCode - includes module loaders for all entries', () => {
  const entries: WidgetManifestEntry[] = [
    {
      name: 'greeting',
      modulePath: 'widgets/greeting/greeting.widget.ts',
      tagName: 'widget-greeting',
    },
    {
      name: 'counter',
      modulePath: 'widgets/counter/counter.widget.ts',
      tagName: 'widget-counter',
    },
  ];
  const code = generateWidgetsManifestCode(entries);

  expect(code).toContain('moduleLoaders: {');
  expect(code).toContain("'widgets/greeting/greeting.widget.ts'");
  expect(code).toContain("'widgets/counter/counter.widget.ts'");
  expect(code).toContain("() => import('./widgets/greeting/greeting.widget.ts')");
  expect(code).toContain("() => import('./widgets/counter/counter.widget.ts')");
});

test('generateWidgetsManifestCode - custom import path', () => {
  const entries: WidgetManifestEntry[] = [
    {
      name: 'test',
      modulePath: 'widgets/test/test.widget.ts',
      tagName: 'widget-test',
    },
  ];
  const code = generateWidgetsManifestCode(entries, 'my-package/emroute');

  expect(code).toContain("import type { WidgetsManifest } from 'my-package/emroute'");
});

test('generateWidgetsManifestCode - escapes special characters in names and paths', () => {
  const entries: WidgetManifestEntry[] = [
    {
      name: "test'widget",
      modulePath: "widgets/test'widget/test'widget.widget.ts",
      tagName: "widget-test'widget",
    },
  ];
  const code = generateWidgetsManifestCode(entries);

  expect(code).toContain("test\\'widget");
});

test('generateWidgetsManifestCode - valid TypeScript output structure', () => {
  const entries: WidgetManifestEntry[] = [
    {
      name: 'demo',
      modulePath: 'widgets/demo/demo.widget.ts',
      tagName: 'widget-demo',
      files: {
        html: 'widgets/demo/demo.widget.html',
      },
    },
  ];
  const code = generateWidgetsManifestCode(entries);

  expect(typeof code).toEqual('string');
  expect(code).toContain('import type');
  expect(code).toContain('export const widgetsManifest');
  expect(code).toContain('WidgetsManifest');
});

test('generateWidgetsManifestCode - outputs all widgets from entries', () => {
  const entries: WidgetManifestEntry[] = [
    {
      name: 'zeta',
      modulePath: 'widgets/zeta/zeta.widget.ts',
      tagName: 'widget-zeta',
    },
    {
      name: 'alpha',
      modulePath: 'widgets/alpha/alpha.widget.ts',
      tagName: 'widget-alpha',
    },
  ];
  const code = generateWidgetsManifestCode(entries);

  expect(code).toContain("name: 'zeta'");
  expect(code).toContain("name: 'alpha'");
});

// ============================================================================
// Integration Tests
// ============================================================================

test('widget file discovery - end-to-end discovery and manifest generation', async () => {
  const fs = new MockFileSystem();

  // Create 3 widgets with different file combinations
  const widgets = [
    {
      name: 'greeting',
      files: ['greeting.widget.ts', 'greeting.widget.html', 'greeting.widget.css'],
    },
    { name: 'counter', files: ['counter.widget.ts', 'counter.widget.html', 'counter.widget.md'] },
    { name: 'badge', files: ['badge.widget.ts'] },
  ];

  for (const widget of widgets) {
    fs.addDir(`widgets/${widget.name}`);
    for (const file of widget.files) {
      fs.addFile(`widgets/${widget.name}/${file}`);
    }
  }

  const entries = await discoverWidgets('widgets', fs);

  expect(entries.length).toEqual(3);
  expect(entries[0].name).toEqual('badge');
  expect(entries[1].name).toEqual('counter');
  expect(entries[2].name).toEqual('greeting');

  const code = generateWidgetsManifestCode(entries);

  expect(code).toContain("'badge'");
  expect(code).toContain("'counter'");
  expect(code).toContain("'greeting'");
  expect(code).toContain('export const widgetsManifest');
});

test('widget file discovery - discovers nested widgets correctly', async () => {
  const fs = new MockFileSystem();

  // Simulate a structure where only immediate children of widgetsDir are processed
  fs.addDir('widgets/ui');
  fs.addDir('widgets/ui/button');
  fs.addFile('widgets/ui/button/button.widget.ts');

  // Only top-level directories are discovered
  const entries = await discoverWidgets('widgets', fs);

  // 'ui' directory should be checked, but it doesn't have a .widget.ts file
  expect(entries.length).toEqual(0);
});

test('widget file discovery - handles complex widget names with multiple hyphens', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/user-profile-card');
  fs.addFile('widgets/user-profile-card/user-profile-card.widget.ts');
  fs.addFile('widgets/user-profile-card/user-profile-card.widget.html');

  const entries = await discoverWidgets('widgets', fs);

  expect(entries.length).toEqual(1);
  expect(entries[0].name).toEqual('user-profile-card');
  expect(entries[0].tagName).toEqual('widget-user-profile-card');
  expect(entries[0].modulePath).toEqual('user-profile-card/user-profile-card.widget.ts');
});
