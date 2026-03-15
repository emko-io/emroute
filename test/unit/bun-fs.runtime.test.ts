/**
 * BunFsRuntime — on-the-fly transpilation and module caching.
 *
 * Tests the three core behaviors:
 * 1. loadModule() — blob-URL import with .ts transpilation and command()-driven cache
 * 2. serveTranspiled() — .ts files served as JS with companion files inlined
 * 3. escapeTemplateLiteral() — shared codegen util
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BunFsRuntime } from '../../runtime/bun/fs/bun-fs.runtime.ts';
import { escapeTemplateLiteral } from '../../core/util/js.util.ts';

// ── Helpers ──────────────────────────────────────────────────────────

let root: string;
let runtime: BunFsRuntime;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'emroute-test-'));
  runtime = new BunFsRuntime(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Write a file into the temp root. */
async function writeFixture(path: string, content: string): Promise<void> {
  const abs = join(root, path);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, content);
}

// ── escapeTemplateLiteral ────────────────────────────────────────────

describe('escapeTemplateLiteral', () => {
  test('escapes backticks', () => {
    expect(escapeTemplateLiteral('hello `world`')).toEqual('hello \\`world\\`');
  });

  test('escapes template expressions', () => {
    expect(escapeTemplateLiteral('${value}')).toEqual('\\${value}');
  });

  test('escapes backslashes', () => {
    expect(escapeTemplateLiteral('a\\b')).toEqual('a\\\\b');
  });

  test('handles all three together', () => {
    const input = '`${a}\\n`';
    const escaped = escapeTemplateLiteral(input);
    // Should be safe inside a JS template literal
    expect(escaped).not.toContain('`${');
    expect(escaped).toContain('\\`');
    expect(escaped).toContain('\\${');
  });

  test('empty string returns empty', () => {
    expect(escapeTemplateLiteral('')).toEqual('');
  });
});

// ── loadModule ───────────────────────────────────────────────────────

describe('BunFsRuntime.loadModule', () => {
  test('loads a .ts module with types stripped', async () => {
    await writeFixture('test.page.ts', `
      const title: string = 'hello';
      export default { getData() { return { title }; } };
    `);

    const mod = await runtime.loadModule('/test.page.ts') as {
      default: { getData(): { title: string } };
    };
    expect(mod.default.getData().title).toEqual('hello');
  });

  test('loads a .js module', async () => {
    await writeFixture('test.page.js', `
      export default { getData() { return { value: 42 }; } };
    `);

    const mod = await runtime.loadModule('/test.page.js') as {
      default: { getData(): { value: number } };
    };
    expect(mod.default.getData().value).toEqual(42);
  });

  test('returns fresh module after file changes on disk', async () => {
    await writeFixture('counter.ts', 'export const count: number = 1;');

    const v1 = await runtime.loadModule('/counter.ts') as { count: number };
    expect(v1.count).toEqual(1);

    // Ensure cache-busting timestamp differs (Date.now() granularity).
    await Bun.sleep(1);
    await writeFixture('counter.ts', 'export const count: number = 2;');

    const v2 = await runtime.loadModule('/counter.ts') as { count: number };
    expect(v2.count).toEqual(2);
  });

  test('reflects file changes via command() without restart', async () => {
    await runtime.command('/routes/index.page.ts', {
      body: 'export const version: number = 1;',
    });

    const v1 = await runtime.loadModule('/routes/index.page.ts') as { version: number };
    expect(v1.version).toEqual(1);

    await runtime.command('/routes/index.page.ts', {
      body: 'export const version: number = 2;',
    });

    const v2 = await runtime.loadModule('/routes/index.page.ts') as { version: number };
    expect(v2.version).toEqual(2);
  });

  test('throws on missing file', async () => {
    await expect(runtime.loadModule('/does-not-exist.ts')).rejects.toThrow();
  });
});

// ── serveTranspiled (via query/handle) ───────────────────────────────

describe('BunFsRuntime on-the-fly transpilation', () => {
  test('.ts file is served as application/javascript', async () => {
    await writeFixture('widget.ts', 'export const x: number = 1;');

    const response = await runtime.query('/widget.ts');
    expect(response.status).toEqual(200);
    expect(response.headers.get('Content-Type')).toEqual(
      'application/javascript; charset=utf-8',
    );
  });

  test('.ts response has types stripped', async () => {
    await writeFixture('widget.ts', 'export const x: number = 1;');

    const response = await runtime.query('/widget.ts');
    const js = await response.text();
    expect(js).toContain('export const x');
    expect(js).not.toContain(': number');
  });

  test('companion .html is inlined as __files', async () => {
    await writeFixture('nav.widget.ts', 'export default class Nav {}');
    await writeFixture('nav.widget.html', '<nav>hello</nav>');

    const response = await runtime.query('/nav.widget.ts');
    const js = await response.text();
    expect(js).toContain('__files');
    expect(js).toContain('<nav>hello</nav>');
  });

  test('companion .css is inlined as __files', async () => {
    await writeFixture('nav.widget.ts', 'export default class Nav {}');
    await writeFixture('nav.widget.css', '.nav { color: red; }');

    const response = await runtime.query('/nav.widget.ts');
    const js = await response.text();
    expect(js).toContain('__files');
    expect(js).toContain('.nav { color: red; }');
  });

  test('companion .md is inlined as __files', async () => {
    await writeFixture('about.page.ts', 'export default class About {}');
    await writeFixture('about.page.md', '# About');

    const response = await runtime.query('/about.page.ts');
    const js = await response.text();
    expect(js).toContain('__files');
    expect(js).toContain('# About');
  });

  test('multiple companions are inlined together', async () => {
    await writeFixture('card.widget.ts', 'export default class Card {}');
    await writeFixture('card.widget.html', '<div class="card"></div>');
    await writeFixture('card.widget.css', '.card { padding: 1rem; }');
    await writeFixture('card.widget.md', '## Card');

    const response = await runtime.query('/card.widget.ts');
    const js = await response.text();
    expect(js).toContain('html:');
    expect(js).toContain('css:');
    expect(js).toContain('md:');
  });

  test('no companions means no __files export', async () => {
    await writeFixture('bare.ts', 'export const x = 1;');

    const response = await runtime.query('/bare.ts');
    const js = await response.text();
    expect(js).not.toContain('__files');
  });

  test('companion with backticks and template expressions is escaped', async () => {
    await writeFixture('tpl.widget.ts', 'export default class Tpl {}');
    await writeFixture('tpl.widget.html', '<code>`${value}`</code>');

    const response = await runtime.query('/tpl.widget.ts');
    const js = await response.text();

    // The output should be valid JS — importing it should work
    const blob = new Blob([js], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    try {
      const mod = await import(url) as { __files: { html: string } };
      expect(mod.__files.html).toEqual('<code>`${value}`</code>');
    } finally {
      URL.revokeObjectURL(url);
    }
  });

  test('query with as:text returns raw TypeScript, not transpiled', async () => {
    await writeFixture('raw.ts', 'export const x: number = 1;');

    const text = await runtime.query('/raw.ts', { as: 'text' });
    expect(text).toContain(': number');
  });

  test('.js files are served normally, not transpiled', async () => {
    await writeFixture('bundle.js', 'export const x = 1;');

    const response = await runtime.query('/bundle.js');
    expect(response.status).toEqual(200);
    expect(response.headers.get('Content-Type')).toEqual(
      'application/javascript; charset=utf-8',
    );
    const text = await response.text();
    expect(text).toEqual('export const x = 1;');
  });
});
