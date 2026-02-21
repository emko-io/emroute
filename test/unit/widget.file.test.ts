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

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import type { WidgetManifestEntry } from '../../src/type/widget.type.ts';
import { Runtime } from '../../runtime/abstract.runtime.ts';
import {
  discoverWidgets,
  generateWidgetsManifestCode,
} from '../../server/generator/widget.generator.ts';

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

Deno.test('discoverWidgets - single widget module with all companion files', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/greeting');
  fs.addFile('widgets/greeting/greeting.widget.ts');
  fs.addFile('widgets/greeting/greeting.widget.html');
  fs.addFile('widgets/greeting/greeting.widget.md');
  fs.addFile('widgets/greeting/greeting.widget.css');

  const entries = await discoverWidgets('widgets', fs);

  assertEquals(entries.length, 1);
  assertEquals(entries[0].name, 'greeting');
  assertEquals(entries[0].modulePath, 'greeting/greeting.widget.ts');
  assertEquals(entries[0].tagName, 'widget-greeting');
  assertExists(entries[0].files);
  assertEquals(entries[0].files!.html, 'greeting/greeting.widget.html');
  assertEquals(entries[0].files!.md, 'greeting/greeting.widget.md');
  assertEquals(entries[0].files!.css, 'greeting/greeting.widget.css');
});

Deno.test('discoverWidgets - widget module without companion files', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/stat-card');
  fs.addFile('widgets/stat-card/stat-card.widget.ts');

  const entries = await discoverWidgets('widgets', fs);

  assertEquals(entries.length, 1);
  assertEquals(entries[0].name, 'stat-card');
  assertEquals(entries[0].modulePath, 'stat-card/stat-card.widget.ts');
  assertEquals(entries[0].tagName, 'widget-stat-card');
  assertEquals(entries[0].files, undefined);
});

Deno.test('discoverWidgets - widget module with some companion files', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/card');
  fs.addFile('widgets/card/card.widget.ts');
  fs.addFile('widgets/card/card.widget.html');
  fs.addFile('widgets/card/card.widget.css');

  const entries = await discoverWidgets('widgets', fs);

  assertEquals(entries.length, 1);
  assertExists(entries[0].files);
  assertEquals(entries[0].files!.html, 'card/card.widget.html');
  assertEquals(entries[0].files!.css, 'card/card.widget.css');
  assertEquals(entries[0].files!.md, undefined);
});

Deno.test('discoverWidgets - ignores directories without module file', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/greeting');
  fs.addFile('widgets/greeting/greeting.widget.ts');
  fs.addDir('widgets/styles');
  fs.addFile('widgets/styles/some-style.css');

  const entries = await discoverWidgets('widgets', fs);

  assertEquals(entries.length, 1);
  assertEquals(entries[0].name, 'greeting');
});

Deno.test('discoverWidgets - multiple widgets sorted alphabetically', async () => {
  const fs = new MockFileSystem();
  const names = ['zulu', 'alpha', 'mike', 'bravo'];
  for (const name of names) {
    fs.addDir(`widgets/${name}`);
    fs.addFile(`widgets/${name}/${name}.widget.ts`);
  }

  const entries = await discoverWidgets('widgets', fs);

  assertEquals(entries.length, 4);
  assertEquals(entries[0].name, 'alpha');
  assertEquals(entries[1].name, 'bravo');
  assertEquals(entries[2].name, 'mike');
  assertEquals(entries[3].name, 'zulu');
});

Deno.test('discoverWidgets - path prefix is applied to module and file paths', async () => {
  const fs = new MockFileSystem();
  fs.addDir('src/widgets/counter');
  fs.addFile('src/widgets/counter/counter.widget.ts');
  fs.addFile('src/widgets/counter/counter.widget.html');

  const entries = await discoverWidgets('src/widgets', fs, 'src/widgets');

  assertEquals(entries.length, 1);
  assertEquals(entries[0].modulePath, 'src/widgets/counter/counter.widget.ts');
  assertEquals(entries[0].files!.html, 'src/widgets/counter/counter.widget.html');
});

Deno.test('discoverWidgets - empty directory returns empty array', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets');

  const entries = await discoverWidgets('widgets', fs);

  assertEquals(entries.length, 0);
});

Deno.test('discoverWidgets - kebab-case widget names generate correct tag names', async () => {
  const fs = new MockFileSystem();
  const names = ['hero-banner', 'article-card', 'user-profile', 'search-bar'];
  for (const name of names) {
    fs.addDir(`widgets/${name}`);
    fs.addFile(`widgets/${name}/${name}.widget.ts`);
  }

  const entries = await discoverWidgets('widgets', fs);

  assertEquals(entries[0].tagName, 'widget-article-card');
  assertEquals(entries[1].tagName, 'widget-hero-banner');
  assertEquals(entries[2].tagName, 'widget-search-bar');
  assertEquals(entries[3].tagName, 'widget-user-profile');
});

// ============================================================================
// generateWidgetsManifestCode Tests
// ============================================================================

Deno.test('generateWidgetsManifestCode - empty entries array', () => {
  const entries: WidgetManifestEntry[] = [];
  const code = generateWidgetsManifestCode(entries);

  assertStringIncludes(code, 'export const widgetsManifest');
  assertStringIncludes(code, 'WidgetsManifest');
  assertStringIncludes(code, 'widgets: [');
  assertStringIncludes(code, 'moduleLoaders: {');
});

Deno.test('generateWidgetsManifestCode - single widget entry', () => {
  const entries: WidgetManifestEntry[] = [
    {
      name: 'greeting',
      modulePath: 'widgets/greeting/greeting.widget.ts',
      tagName: 'widget-greeting',
    },
  ];
  const code = generateWidgetsManifestCode(entries);

  assertStringIncludes(code, "name: 'greeting'");
  assertStringIncludes(code, "modulePath: 'widgets/greeting/greeting.widget.ts'");
  assertStringIncludes(code, "tagName: 'widget-greeting'");
});

Deno.test('generateWidgetsManifestCode - widget with companion files', () => {
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

  assertStringIncludes(code, "'card'");
  assertStringIncludes(code, 'files: {');
  assertStringIncludes(code, "html: 'widgets/card/card.widget.html'");
  assertStringIncludes(code, "md: 'widgets/card/card.widget.md'");
  assertStringIncludes(code, "css: 'widgets/card/card.widget.css'");
});

Deno.test('generateWidgetsManifestCode - multiple widgets with various file combinations', () => {
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

  assertStringIncludes(code, "'alpha'");
  assertStringIncludes(code, "'beta'");
  assertStringIncludes(code, "'gamma'");
  assertStringIncludes(code, "() => import('./");
});

Deno.test('generateWidgetsManifestCode - includes module loaders for all entries', () => {
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

  assertStringIncludes(code, 'moduleLoaders: {');
  assertStringIncludes(code, "'widgets/greeting/greeting.widget.ts'");
  assertStringIncludes(code, "'widgets/counter/counter.widget.ts'");
  assertStringIncludes(code, "() => import('./widgets/greeting/greeting.widget.ts')");
  assertStringIncludes(code, "() => import('./widgets/counter/counter.widget.ts')");
});

Deno.test('generateWidgetsManifestCode - custom import path', () => {
  const entries: WidgetManifestEntry[] = [
    {
      name: 'test',
      modulePath: 'widgets/test/test.widget.ts',
      tagName: 'widget-test',
    },
  ];
  const code = generateWidgetsManifestCode(entries, 'my-package/emroute');

  assertStringIncludes(code, "import type { WidgetsManifest } from 'my-package/emroute'");
});

Deno.test('generateWidgetsManifestCode - escapes special characters in names and paths', () => {
  const entries: WidgetManifestEntry[] = [
    {
      name: "test'widget",
      modulePath: "widgets/test'widget/test'widget.widget.ts",
      tagName: "widget-test'widget",
    },
  ];
  const code = generateWidgetsManifestCode(entries);

  assertStringIncludes(code, "test\\'widget");
});

Deno.test('generateWidgetsManifestCode - valid TypeScript output structure', () => {
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

  assertEquals(typeof code, 'string');
  assertStringIncludes(code, 'import type');
  assertStringIncludes(code, 'export const widgetsManifest');
  assertStringIncludes(code, 'WidgetsManifest');
});

Deno.test('generateWidgetsManifestCode - outputs all widgets from entries', () => {
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

  assertStringIncludes(code, "name: 'zeta'");
  assertStringIncludes(code, "name: 'alpha'");
});

// ============================================================================
// Integration Tests
// ============================================================================

Deno.test('widget file discovery - end-to-end discovery and manifest generation', async () => {
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

  assertEquals(entries.length, 3);
  assertEquals(entries[0].name, 'badge');
  assertEquals(entries[1].name, 'counter');
  assertEquals(entries[2].name, 'greeting');

  const code = generateWidgetsManifestCode(entries);

  assertStringIncludes(code, "'badge'");
  assertStringIncludes(code, "'counter'");
  assertStringIncludes(code, "'greeting'");
  assertStringIncludes(code, 'export const widgetsManifest');
});

Deno.test('widget file discovery - discovers nested widgets correctly', async () => {
  const fs = new MockFileSystem();

  // Simulate a structure where only immediate children of widgetsDir are processed
  fs.addDir('widgets/ui');
  fs.addDir('widgets/ui/button');
  fs.addFile('widgets/ui/button/button.widget.ts');

  // Only top-level directories are discovered
  const entries = await discoverWidgets('widgets', fs);

  // 'ui' directory should be checked, but it doesn't have a .widget.ts file
  assertEquals(entries.length, 0);
});

Deno.test('widget file discovery - handles complex widget names with multiple hyphens', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/user-profile-card');
  fs.addFile('widgets/user-profile-card/user-profile-card.widget.ts');
  fs.addFile('widgets/user-profile-card/user-profile-card.widget.html');

  const entries = await discoverWidgets('widgets', fs);

  assertEquals(entries.length, 1);
  assertEquals(entries[0].name, 'user-profile-card');
  assertEquals(entries[0].tagName, 'widget-user-profile-card');
  assertEquals(entries[0].modulePath, 'user-profile-card/user-profile-card.widget.ts');
});

