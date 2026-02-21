import { assertEquals, assertExists, assertStringIncludes } from 'jsr:@std/assert';
import { DenoFsRuntime } from '../../server/runtime/deno/fs/deno-fs.runtime.ts';

const FIXTURE = 'test/browser/fixtures/routes/blog.page.ts';
const FIXTURE_ABS = `${Deno.cwd()}/${FIXTURE}`;

const context = {
  files: { md: '# Hello' },
  isLeaf: true,
  basePath: '/html',
};

type Page = { name: string; getTitle(): string; renderHTML(args: unknown): string };

function assertPage(page: Page) {
  assertEquals(page.name, 'blog');
  assertEquals(page.getTitle(), 'Blog');
  assertEquals(
    page.renderHTML({ data: null, params: {}, context }),
    '<mark-down># Hello</mark-down>\n<p class="blog-footer">Posts: 0</p>',
  );
}

// --- Transpilers ---

/** deno bundle: transpile + resolve imports. Experimental. */
async function transpileWithDenoBundler(path: string): Promise<string> {
  const proc = new Deno.Command('deno', {
    args: ['bundle', path, '--platform', 'browser'],
    stdout: 'piped',
    stderr: 'piped',
  }).spawn();
  const { stdout } = await proc.output();
  return new TextDecoder().decode(stdout);
}

/** typescript: transpile only, imports preserved. */
async function transpileWithTypescript(source: string): Promise<string> {
  const ts = await import('npm:typescript');
  const result = ts.default.transpileModule(source, {
    compilerOptions: {
      target: ts.default.ScriptTarget.ESNext,
      module: ts.default.ModuleKind.ESNext,
      verbatimModuleSyntax: false,
    },
  });
  return result.outputText;
}

/** esbuild: transpile only (transform mode), imports preserved. */
async function transpileWithEsbuild(source: string): Promise<string> {
  const esbuild = await import('npm:esbuild');
  const result = await esbuild.transform(source, {
    loader: 'ts',
    format: 'esm',
    target: 'esnext',
  });
  await esbuild.stop();
  return result.code;
}

/** tsgo: transpile only via native Go binary (CLI). Imports preserved. */
async function transpileWithTsgo(path: string): Promise<string> {
  const outDir = await Deno.makeTempDir();
  const proc = new Deno.Command('tsgo', {
    args: [
      '--target',
      'esnext',
      '--module',
      'esnext',
      '--isolatedModules',
      '--noCheck',
      '--outDir',
      outDir,
      path,
    ],
    stdout: 'piped',
    stderr: 'piped',
  }).spawn();
  await proc.output();
  const filename = path.split('/').pop()!.replace(/\.ts$/, '.js');
  const js = await Deno.readTextFile(`${outDir}/${filename}`);
  await Deno.remove(outDir, { recursive: true });
  return js;
}

/** swc: transpile only, imports preserved. */
async function transpileWithSwc(source: string): Promise<string> {
  const swc = await import('npm:@swc/core');
  const result = swc.default.transformSync(source, {
    jsc: {
      parser: { syntax: 'typescript', decorators: true },
      target: 'esnext',
    },
    module: { type: 'es6' },
  });
  return result.code;
}

// --- Loaders ---

async function loadViaBlobUrl(js: string): Promise<Record<string, unknown>> {
  const blob = new Blob([js], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    return await import(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadViaDataUrl(js: string): Promise<Record<string, unknown>> {
  const url = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(js);
  return await import(url);
}

function loadViaFunction(js: string, exportName: string): unknown {
  // new Function() has no module system — strip exports, return the binding directly
  const stripped = js
    .replace(/^export\s*\{[^}]*\};\s*$/m, '')
    .replace(/export\s+\{/g, '// removed export {');
  const factory = new Function(stripped + `\nreturn ${exportName};`);
  return factory();
}

async function loadViaDynamicImport(path: string): Promise<Record<string, unknown>> {
  return await import(`../../${path}`);
}

// --- Transpiler tests ---

Deno.test('Transpiler: deno bundle (experimental)', async () => {
  const js = await transpileWithDenoBundler(FIXTURE);
  assertEquals(js.includes('BlogPage'), true);
  assertEquals(js.includes(': ComponentContext'), false); // types stripped
  assertEquals(js.includes('@emkodev/emroute'), false); // imports resolved
});

Deno.test('Transpiler: typescript', async () => {
  const source = await Deno.readTextFile(FIXTURE);
  const js = await transpileWithTypescript(source);
  assertEquals(js.includes('class BlogPage'), true);
  assertEquals(js.includes(': ComponentContext'), false);
  assertEquals(js.includes('@emkodev/emroute'), true); // imports preserved
});

Deno.test({
  name: 'Transpiler: esbuild',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const source = await Deno.readTextFile(FIXTURE);
    const js = await transpileWithEsbuild(source);
    assertEquals(js.includes('class BlogPage'), true);
    assertEquals(js.includes(': ComponentContext'), false);
    assertEquals(js.includes('@emkodev/emroute'), true); // imports preserved
  },
});

Deno.test('Transpiler: tsgo', async () => {
  const js = await transpileWithTsgo(FIXTURE);
  assertEquals(js.includes('BlogPage'), true);
  assertEquals(js.includes(': ComponentContext'), false);
  assertEquals(js.includes('@emkodev/emroute'), true); // imports preserved
});

Deno.test('Transpiler: swc', async () => {
  const source = await Deno.readTextFile(FIXTURE);
  const js = await transpileWithSwc(source);
  assertEquals(js.includes('class BlogPage'), true);
  assertEquals(js.includes(': ComponentContext'), false);
  assertEquals(js.includes('@emkodev/emroute'), true); // imports preserved
});

// --- Loader tests (all use deno bundle since it resolves imports) ---

Deno.test('Loader: blob URL', async () => {
  const js = await transpileWithDenoBundler(FIXTURE);
  const mod = await loadViaBlobUrl(js);
  assertPage(mod.default as Page);
});

Deno.test('Loader: data: URL', async () => {
  const js = await transpileWithDenoBundler(FIXTURE);
  const mod = await loadViaDataUrl(js);
  assertPage(mod.default as Page);
});

Deno.test('Loader: new Function()', async () => {
  const js = await transpileWithDenoBundler(FIXTURE);
  const page = loadViaFunction(js, 'blog_page_default');
  assertPage(page as Page);
});

Deno.test('Loader: direct dynamic import (Deno only, no transpile needed)', async () => {
  const mod = await loadViaDynamicImport(FIXTURE);
  assertPage(mod.default as Page);
});

// --- Full cycle: runtime → transpile → load → getData → renderHTML ---

Deno.test('Full cycle: articles page via runtime', async () => {
  const runtime = new DenoFsRuntime('test/browser/fixtures');

  // Step 1: read .page.ts source via runtime
  const source = await runtime.query('/routes/articles.page.ts', { as: 'text' });
  assertExists(source);

  // Step 2: transpile TS → JS
  const js = await transpileWithTypescript(source);
  assertExists(js);

  // Step 3: load module via blob URL
  const mod = await loadViaBlobUrl(js);
  const page = mod.default as {
    getData(): Promise<{ articles: { title: string }[] }>;
    renderHTML(args: unknown): string;
  };
  assertExists(page);

  // Step 4: read companion HTML via runtime
  const html = await runtime.query('/routes/articles.page.html', { as: 'text' });
  assertExists(html);
  assertStringIncludes(html, '{{articleCards}}');

  // Step 5: getData
  const data = await page.getData();
  assertExists(data.articles);
  assertEquals(data.articles.length > 0, true);

  // Step 6: renderHTML with real data and companions
  const rendered = page.renderHTML({
    data,
    params: {},
    context: { files: { html }, isLeaf: true, basePath: '/html' },
  });
  assertExists(rendered);
  assertStringIncludes(rendered, 'articles published');
  assertStringIncludes(rendered, 'Getting Started');
});
