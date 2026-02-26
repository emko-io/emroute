import { test, expect, describe } from 'bun:test';
import { BunSqliteRuntime } from '../../runtime/bun/sqlite/bun-sqlite.runtime.ts';
import { createEmrouteServer } from '../../server/emroute.server.ts';

describe('BunSqliteRuntime', () => {
  describe('basic operations', () => {
    test('write and read round-trip', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/hello.txt', { body: 'hello world' });
      const text = await runtime.query('/hello.txt', { as: 'text' });
      expect(text).toEqual('hello world');
      runtime.close();
    });

    test('data persists across multiple reads', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/data.json', { body: '{"key": "value"}' });
      const read1 = await runtime.query('/data.json', { as: 'text' });
      const read2 = await runtime.query('/data.json', { as: 'text' });
      expect(read1).toEqual(read2);
      expect(read1).toEqual('{"key": "value"}');
      runtime.close();
    });

    test('returns 404 for missing file', async () => {
      const runtime = new BunSqliteRuntime();
      const response = await runtime.query('/missing.txt');
      expect(response.status).toEqual(404);
      runtime.close();
    });

    test('overwrite replaces content', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/file.txt', { body: 'v1' });
      await runtime.command('/file.txt', { body: 'v2' });
      const text = await runtime.query('/file.txt', { as: 'text' });
      expect(text).toEqual('v2');
      runtime.close();
    });

    test('response has correct Content-Type', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/app.js', { body: 'console.log("hi")' });
      await runtime.command('/style.css', { body: 'body {}' });
      const js = await runtime.query('/app.js');
      expect(js.headers.get('Content-Type')).toEqual('application/javascript; charset=utf-8');
      const css = await runtime.query('/style.css');
      expect(css.headers.get('Content-Type')).toEqual('text/css; charset=utf-8');
      runtime.close();
    });

    test('binary data round-trip', async () => {
      const runtime = new BunSqliteRuntime();
      const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      await runtime.command('/image.png', { body: data });
      const response = await runtime.query('/image.png');
      expect(response.status).toEqual(200);
      expect(response.headers.get('Content-Type')).toEqual('image/png');
      const body = new Uint8Array(await response.arrayBuffer());
      expect(body).toEqual(data);
      runtime.close();
    });

    test('query as text rejects on missing file', async () => {
      const runtime = new BunSqliteRuntime();
      await expect(runtime.query('/nope.txt', { as: 'text' })).rejects.toThrow('Not found');
      runtime.close();
    });
  });

  describe('directory listing', () => {
    test('list returns direct children', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/index.page.md', { body: '# Home' });
      await runtime.command('/routes/about.page.md', { body: '# About' });
      await runtime.command('/routes/blog/first.page.md', { body: '# First' });
      const response = await runtime.query('/routes/');
      const entries = await response.json();
      expect(entries).toContain('index.page.md');
      expect(entries).toContain('about.page.md');
      expect(entries).toContain('blog/');
      runtime.close();
    });

    test('list returns 404 for empty prefix', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/other/file.txt', { body: 'x' });
      const response = await runtime.query('/routes/');
      expect(response.status).toEqual(404);
      runtime.close();
    });

    test('directory without trailing slash returns listing', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/index.page.md', { body: '# Home' });
      const response = await runtime.query('/routes');
      const entries = await response.json();
      expect(entries).toContain('index.page.md');
      runtime.close();
    });
  });

  describe('loadModule', () => {
    test('loads TypeScript module from storage', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/test.page.ts', {
        body: 'export default { getData() { return { title: "from sqlite" }; } }',
      });
      const loader = runtime.loadModule.bind(runtime);
      const mod = await loader('/test.page.ts') as { default: { getData(): { title: string } } };
      expect(mod.default.getData().title).toEqual('from sqlite');
      runtime.close();
    });

    test('loads JavaScript module from storage', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/test.page.js', {
        body: 'export default { getData() { return { value: 42 }; } }',
      });
      const loader = runtime.loadModule.bind(runtime);
      const mod = await loader('/test.page.js') as { default: { getData(): { value: number } } };
      expect(mod.default.getData().value).toEqual(42);
      runtime.close();
    });
  });

  describe('manifest resolution', () => {
    test('resolves routes manifest from scanned files', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/index.page.md', { body: '# Home' });
      await runtime.command('/routes/about.page.md', { body: '# About' });

      const response = await runtime.query('/routes.manifest.json');
      expect(response.status).toEqual(200);
      const tree = await response.json();
      // Root node represents '/' — index.page.md sets files on root
      expect(tree.files).toBeDefined();
      expect(tree.files.md).toContain('index.page.md');
      // about.page.md creates a child node
      expect(tree.children?.about).toBeDefined();
      expect(tree.children.about.files.md).toContain('about.page.md');
      runtime.close();
    });

    test('resolves widgets manifest from scanned files', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/widgets/counter/counter.widget.ts', {
        body: 'export default class Counter {}',
      });

      const response = await runtime.query('/widgets.manifest.json');
      expect(response.status).toEqual(200);
      const entries = await response.json();
      expect(entries.length).toEqual(1);
      expect(entries[0].name).toEqual('counter');
      expect(entries[0].tagName).toEqual('widget-counter');
      runtime.close();
    });
  });

  describe('bundle', () => {
    test('bundle writes output files through runtime', async () => {
      const runtime = new BunSqliteRuntime(':memory:', {
        entryPoint: '/main.ts',
        routesDir: '/routes',
      });
      await runtime.command('/routes/index.page.md', { body: '# Home' });

      await runtime.bundle();

      // Verify bundle output files exist in runtime storage
      const emrouteJs = await runtime.query('/emroute.js');
      expect(emrouteJs.status).toEqual(200);
      expect(emrouteJs.headers.get('Content-Type')).toEqual('application/javascript; charset=utf-8');

      const appJs = await runtime.query('/app.js');
      expect(appJs.status).toEqual(200);

      // Verify auto-generated main.ts exists
      const mainTs = await runtime.query('/main.ts');
      expect(mainTs.status).toEqual(200);

      // Verify index.html shell was generated
      const shell = await runtime.query('/index.html');
      expect(shell.status).toEqual(200);
      const html = await shell.text();
      expect(html).toContain('importmap');
      expect(html).toContain('/app.js');

      await BunSqliteRuntime.stopBundler();
      runtime.close();
    });

    test('bundle does not overwrite existing main.ts', async () => {
      const runtime = new BunSqliteRuntime(':memory:', {
        entryPoint: '/main.ts',
        routesDir: '/routes',
      });
      await runtime.command('/routes/index.page.md', { body: '# Home' });
      await runtime.command('/main.ts', { body: 'console.log("custom");' });

      await runtime.bundle();

      const mainTs = await runtime.query('/main.ts', { as: 'text' });
      expect(mainTs).toEqual('console.log("custom");');

      await BunSqliteRuntime.stopBundler();
      runtime.close();
    });

    test('bundle does not overwrite existing index.html', async () => {
      const runtime = new BunSqliteRuntime(':memory:', {
        entryPoint: '/main.ts',
        routesDir: '/routes',
      });
      await runtime.command('/routes/index.page.md', { body: '# Home' });
      await runtime.command('/index.html', { body: '<html>custom</html>' });

      await runtime.bundle();

      const html = await runtime.query('/index.html', { as: 'text' });
      expect(html).toEqual('<html>custom</html>');

      await BunSqliteRuntime.stopBundler();
      runtime.close();
    });
  });

  describe('createEmrouteServer integration', () => {
    test('SSR renders markdown route', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/index.page.md', { body: '# SQLite Works' });

      const emroute = await createEmrouteServer({
        spa: 'none',
      }, runtime);

      const req = new Request('http://localhost/html');
      const response = await emroute.handleRequest(req);
      expect(response).not.toBeNull();
      expect(response!.status).toEqual(200);
      const html = await response!.text();
      expect(html).toContain('SQLite Works');

      runtime.close();
    });

    test('SSR renders TypeScript route', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/hello.page.ts', {
        body: `export default {
  getData() { return { title: 'Hello from TS' }; },
  getTitle(ctx: any) { return ctx.data.title; },
  renderHTML(args: any) { return '<h1>' + args.data.title + '</h1>'; },
};`,
      });

      const emroute = await createEmrouteServer({
        spa: 'none',
      }, runtime);

      const req = new Request('http://localhost/html/hello');
      const response = await emroute.handleRequest(req);
      expect(response).not.toBeNull();
      expect(response!.status).toEqual(200);
      const html = await response!.text();
      expect(html).toContain('Hello from TS');
      runtime.close();
    });

    test('SSR renders nested routes', async () => {
      const runtime = new BunSqliteRuntime();
      await runtime.command('/routes/index.page.md', { body: '# Home' });
      await runtime.command('/routes/about.page.md', { body: '# About Us' });

      const emroute = await createEmrouteServer({
        spa: 'none',
      }, runtime);

      const aboutReq = new Request('http://localhost/html/about');
      const aboutRes = await emroute.handleRequest(aboutReq);
      expect(aboutRes).not.toBeNull();
      expect(aboutRes!.status).toEqual(200);
      const aboutHtml = await aboutRes!.text();
      expect(aboutHtml).toContain('About Us');
      runtime.close();
    });
  });
});
