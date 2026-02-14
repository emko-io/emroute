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
import type { DirEntry, FileSystem } from '../../tool/fs.type.ts';
import {
  discoverWidgetFiles,
  discoverWidgets,
  generateWidgetFilesManifestCode,
  generateWidgetsManifestCode,
} from '../../tool/widget.generator.ts';

/**
 * Mock FileSystem for testing widget discovery
 */
class MockFileSystem implements FileSystem {
  private files: Set<string> = new Set();
  private dirs: Set<string> = new Set();

  addFile(path: string): void {
    this.files.add(path);
  }

  addDir(path: string): void {
    this.dirs.add(path);
  }

  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path) || this.dirs.has(path));
  }

  writeTextFile(path: string, _content: string): Promise<void> {
    this.files.add(path);
    return Promise.resolve();
  }

  async *readDir(path: string): AsyncIterable<DirEntry> {
    for (const dirPath of this.dirs) {
      if (dirPath.startsWith(path + '/')) {
        const relative = dirPath.slice((path + '/').length);
        const parts = relative.split('/');
        if (parts.length === 1) {
          yield {
            name: parts[0],
            isDirectory: true,
            isFile: false,
          };
        }
      }
    }

    for (const filePath of this.files) {
      if (filePath.startsWith(path + '/')) {
        const relative = filePath.slice((path + '/').length);
        const parts = relative.split('/');
        if (parts.length === 1) {
          yield {
            name: parts[0],
            isDirectory: false,
            isFile: true,
          };
        }
      }
    }
  }
}

// ============================================================================
// discoverWidgetFiles Tests (legacy API)
// ============================================================================

Deno.test('discoverWidgetFiles - single widget with all companion files', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/greeting');
  fs.addFile('widgets/greeting/greeting.widget.html');
  fs.addFile('widgets/greeting/greeting.widget.md');
  fs.addFile('widgets/greeting/greeting.widget.css');

  const widgets = [{ name: 'greeting' }];
  const result = await discoverWidgetFiles('widgets', widgets, fs);

  assertEquals(result.size, 1);
  const greeting = result.get('greeting');
  assertExists(greeting);
  assertEquals(greeting!.html, 'greeting/greeting.widget.html');
  assertEquals(greeting!.md, 'greeting/greeting.widget.md');
  assertEquals(greeting!.css, 'greeting/greeting.widget.css');
});

Deno.test('discoverWidgetFiles - widget with partial companion files', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/counter');
  fs.addFile('widgets/counter/counter.widget.html');
  fs.addFile('widgets/counter/counter.widget.css');

  const widgets = [{ name: 'counter' }];
  const result = await discoverWidgetFiles('widgets', widgets, fs);

  assertEquals(result.size, 1);
  const counter = result.get('counter');
  assertExists(counter);
  assertEquals(counter!.html, 'counter/counter.widget.html');
  assertEquals(counter!.css, 'counter/counter.widget.css');
  assertEquals(counter!.md, undefined);
});

Deno.test('discoverWidgetFiles - widget with no companion files returns undefined', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/stat-card');

  const widgets = [{ name: 'stat-card' }];
  const result = await discoverWidgetFiles('widgets', widgets, fs);

  assertEquals(result.size, 0);
});

Deno.test('discoverWidgetFiles - multiple widgets with mixed companion files', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/greeting');
  fs.addFile('widgets/greeting/greeting.widget.html');
  fs.addDir('widgets/counter');
  fs.addFile('widgets/counter/counter.widget.css');
  fs.addDir('widgets/badge');
  fs.addFile('widgets/badge/badge.widget.md');

  const widgets = [
    { name: 'greeting' },
    { name: 'counter' },
    { name: 'badge' },
  ];
  const result = await discoverWidgetFiles('widgets', widgets, fs);

  assertEquals(result.size, 3);
  assertEquals(result.get('greeting')!.html, 'greeting/greeting.widget.html');
  assertEquals(result.get('counter')!.css, 'counter/counter.widget.css');
  assertEquals(result.get('badge')!.md, 'badge/badge.widget.md');
});

Deno.test('discoverWidgetFiles - path prefix is applied', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/hero');
  fs.addFile('widgets/hero/hero.widget.html');

  const widgets = [{ name: 'hero' }];
  const result = await discoverWidgetFiles('widgets', widgets, fs, 'widgets');

  assertEquals(result.size, 1);
  const hero = result.get('hero');
  assertExists(hero);
  assertEquals(hero!.html, 'widgets/hero/hero.widget.html');
});

Deno.test('discoverWidgetFiles - declared files win over discovered files', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/card');
  fs.addFile('widgets/card/card.widget.html');
  fs.addFile('widgets/card/card.widget.css');

  const widgets = [
    {
      name: 'card',
      files: {
        html: '/custom/path.html',
        css: 'card/card.widget.css',
      },
    },
  ];
  const result = await discoverWidgetFiles('widgets', widgets, fs);

  assertEquals(result.size, 1);
  const card = result.get('card');
  assertExists(card);
  assertEquals(card!.html, '/custom/path.html');
  assertEquals(card!.css, 'card/card.widget.css');
});

Deno.test('discoverWidgetFiles - discovered fills gaps in declared files', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/button');
  fs.addFile('widgets/button/button.widget.html');
  fs.addFile('widgets/button/button.widget.md');

  const widgets = [
    {
      name: 'button',
      files: {
        css: '/styles/button.css',
      },
    },
  ];
  const result = await discoverWidgetFiles('widgets', widgets, fs);

  assertEquals(result.size, 1);
  const button = result.get('button');
  assertExists(button);
  assertEquals(button!.html, 'button/button.widget.html');
  assertEquals(button!.md, 'button/button.widget.md');
  assertEquals(button!.css, '/styles/button.css');
});

Deno.test('discoverWidgetFiles - empty array returns empty map', async () => {
  const fs = new MockFileSystem();
  const widgets: { name: string; files?: { html?: string; md?: string; css?: string } }[] = [];
  const result = await discoverWidgetFiles('widgets', widgets, fs);

  assertEquals(result.size, 0);
});

Deno.test('discoverWidgetFiles - concurrent discovery of multiple widgets', async () => {
  const fs = new MockFileSystem();
  for (let i = 1; i <= 10; i++) {
    const name = `widget-${i}`;
    fs.addDir(`widgets/${name}`);
    fs.addFile(`widgets/${name}/${name}.widget.html`);
  }

  const widgets = Array.from({ length: 10 }, (_, i) => ({
    name: `widget-${i + 1}`,
  }));
  const result = await discoverWidgetFiles('widgets', widgets, fs);

  assertEquals(result.size, 10);
});

// ============================================================================
// discoverWidgets Tests (full discovery with modules)
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
// generateWidgetFilesManifestCode Tests
// ============================================================================

Deno.test('generateWidgetFilesManifestCode - empty map produces empty manifest', () => {
  const discovered = new Map();
  const code = generateWidgetFilesManifestCode(discovered);

  assertStringIncludes(code, 'export const widgetFiles');
  assertStringIncludes(code, '= {');
  assertStringIncludes(code, '};');
  assertStringIncludes(code, 'Auto-generated');
});

Deno.test('generateWidgetFilesManifestCode - single widget with one file', () => {
  const discovered = new Map([
    ['greeting', { html: 'greeting/greeting.widget.html' }],
  ]);
  const code = generateWidgetFilesManifestCode(discovered);

  assertStringIncludes(code, "'greeting'");
  assertStringIncludes(code, "html: 'greeting/greeting.widget.html'");
});

Deno.test('generateWidgetFilesManifestCode - widget with multiple files', () => {
  const discovered = new Map([
    [
      'card',
      {
        html: 'card/card.widget.html',
        md: 'card/card.widget.md',
        css: 'card/card.widget.css',
      },
    ],
  ]);
  const code = generateWidgetFilesManifestCode(discovered);

  assertStringIncludes(code, "'card'");
  assertStringIncludes(code, "html: 'card/card.widget.html'");
  assertStringIncludes(code, "md: 'card/card.widget.md'");
  assertStringIncludes(code, "css: 'card/card.widget.css'");
});

Deno.test('generateWidgetFilesManifestCode - multiple widgets', () => {
  const discovered = new Map([
    ['greeting', { html: 'greeting/greeting.widget.html' }],
    ['counter', { css: 'counter/counter.widget.css' }],
    [
      'card',
      {
        html: 'card/card.widget.html',
        css: 'card/card.widget.css',
      },
    ],
  ]);
  const code = generateWidgetFilesManifestCode(discovered);

  assertStringIncludes(code, "'greeting'");
  assertStringIncludes(code, "'counter'");
  assertStringIncludes(code, "'card'");
});

Deno.test('generateWidgetFilesManifestCode - generates valid code for widgets with file paths', () => {
  const discovered = new Map([
    [
      'test',
      {
        html: 'path/with/file.html',
        css: 'path/styles.css',
      },
    ],
  ]);
  const code = generateWidgetFilesManifestCode(discovered);

  // Verify the output is valid TypeScript
  assertEquals(typeof code, 'string');
  assertStringIncludes(code, "'test'");
  assertStringIncludes(code, 'html:');
  assertStringIncludes(code, 'css:');
});

Deno.test('generateWidgetFilesManifestCode - includes type annotations', () => {
  const discovered = new Map();
  const code = generateWidgetFilesManifestCode(discovered);

  assertStringIncludes(code, 'Record<string, { html?: string; md?: string; css?: string }>');
});

Deno.test('generateWidgetFilesManifestCode - valid TypeScript output', () => {
  const discovered = new Map([
    [
      'hero',
      {
        html: 'hero/hero.widget.html',
      },
    ],
  ]);
  const code = generateWidgetFilesManifestCode(discovered);

  assertEquals(typeof code, 'string');
  assertEquals(code.length > 0, true);
  assertStringIncludes(code, 'export const');
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

Deno.test('widget file discovery - file discovery respects discovered vs declared precedence', async () => {
  const fs = new MockFileSystem();
  fs.addDir('widgets/card');
  fs.addFile('widgets/card/card.widget.html');
  fs.addFile('widgets/card/card.widget.css');

  const widgets = [
    {
      name: 'card',
      files: {
        html: 'custom.html',
        md: 'custom.md',
      },
    },
  ];

  const result = await discoverWidgetFiles('widgets', widgets, fs);

  const card = result.get('card');
  assertExists(card);
  assertEquals(card!.html, 'custom.html');
  assertEquals(card!.md, 'custom.md');
  assertEquals(card!.css, 'card/card.widget.css');
});
