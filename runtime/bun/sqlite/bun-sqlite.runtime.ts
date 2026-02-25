import { createRequire } from 'node:module';
import { Database } from 'bun:sqlite';
import {
  CONTENT_TYPES,
  DEFAULT_ROUTES_DIR,
  DEFAULT_WIDGETS_DIR,
  EMROUTE_EXTERNALS,
  type FetchParams,
  type FetchReturn,
  ROUTES_MANIFEST_PATH,
  Runtime,
  type RuntimeConfig,
  WIDGETS_MANIFEST_PATH,
} from '../../abstract.runtime.ts';
import { createManifestPlugin } from '../../../server/esbuild-manifest.plugin.ts';
import { createRuntimeLoaderPlugin, VIRTUAL_ROOT } from '../esbuild-runtime-loader.plugin.ts';
import { generateMainTs } from '../../../server/codegen.util.ts';

export class BunSqliteRuntime extends Runtime {
  private readonly db: Database;
  private readonly stmtGet: ReturnType<Database['prepare']>;
  private readonly stmtSet: ReturnType<Database['prepare']>;
  private readonly stmtList: ReturnType<Database['prepare']>;
  private readonly stmtHas: ReturnType<Database['prepare']>;

  constructor(path: string = ':memory:', config: RuntimeConfig = {}) {
    if (config.entryPoint && !config.bundlePaths) {
      config.bundlePaths = { emroute: '/emroute.js', app: '/app.js' };
    }
    super(config);
    this.db = new Database(path);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        data BLOB NOT NULL,
        mtime TEXT NOT NULL
      )
    `);
    this.stmtGet = this.db.prepare('SELECT data, mtime FROM files WHERE path = ?');
    this.stmtSet = this.db.prepare('INSERT OR REPLACE INTO files (path, data, mtime) VALUES (?, ?, ?)');
    this.stmtList = this.db.prepare("SELECT DISTINCT path FROM files WHERE path LIKE ? || '%'");
    this.stmtHas = this.db.prepare("SELECT 1 FROM files WHERE path LIKE ? || '%' LIMIT 1");
  }

  handle(
    resource: FetchParams[0],
    init?: FetchParams[1],
  ): FetchReturn {
    const [pathname, method, body] = this.parse(resource, init);

    switch (method) {
      case 'PUT':
        return this.write(pathname, body);
      default:
        return this.read(pathname);
    }
  }

  query(
    resource: FetchParams[0],
    options: FetchParams[1] & { as: 'text' },
  ): Promise<string>;
  query(
    resource: FetchParams[0],
    options?: FetchParams[1],
  ): FetchReturn;
  query(
    resource: FetchParams[0],
    options?: FetchParams[1] & { as?: 'text' },
  ): Promise<Response | string> {
    if (options?.as === 'text') {
      const pathname = this.parsePath(resource);
      const row = this.stmtGet.get(pathname) as { data: Uint8Array } | null;
      if (!row) {
        return Promise.reject(new Error(`Not found: ${pathname}`));
      }
      return Promise.resolve(new TextDecoder().decode(row.data));
    }
    return this.handle(resource, options);
  }

  override async loadModule(path: string): Promise<unknown> {
    const source = await this.query(path, { as: 'text' });
    const code = path.endsWith('.ts')
      ? await BunSqliteRuntime.transpile(source)
      : source;

    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    try {
      return await import(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  close(): void {
    this.db.close();
  }

  // ── Bundling ─────────────────────────────────────────────────────────

  override async bundle(): Promise<void> {
    if (this.config.spa === 'none') return;
    const paths = this.config.bundlePaths;
    if (!paths) return;

    const esbuild = await BunSqliteRuntime.esbuild();
    const builds: Promise<{ outputFiles: { path: string; contents: Uint8Array }[] }>[] = [];
    const shared = { bundle: true, write: false, format: 'esm' as const, platform: 'browser' as const };
    const runtimeLoader = createRuntimeLoaderPlugin({ runtime: this, root: VIRTUAL_ROOT });

    // Emroute SPA bundle — resolve from consumer's node_modules (no runtime loader needed)
    const consumerRequire = createRequire(process.cwd() + '/');
    const spaEntry = consumerRequire.resolve('@emkodev/emroute/spa');
    builds.push(esbuild.build({
      ...shared,
      entryPoints: [spaEntry],
      outfile: paths.emroute,
    }));

    // App bundle — generate main.ts if absent, virtual plugin resolves manifests
    if (this.config.entryPoint) {
      if ((await this.query(this.config.entryPoint)).status === 404) {
        const hasRoutes = (await this.query((this.config.routesDir ?? DEFAULT_ROUTES_DIR) + '/')).status !== 404;
        const hasWidgets = (await this.query((this.config.widgetsDir ?? DEFAULT_WIDGETS_DIR) + '/')).status !== 404;
        const code = generateMainTs('root', hasRoutes, hasWidgets, '@emkodev/emroute');
        await this.command(this.config.entryPoint, { body: code });
      }
      const manifestPlugin = createManifestPlugin({
        runtime: this,
        resolveDir: process.cwd(),
      });
      builds.push(esbuild.build({
        ...shared,
        entryPoints: [VIRTUAL_ROOT + this.config.entryPoint],
        outfile: paths.app,
        external: [...EMROUTE_EXTERNALS],
        plugins: [manifestPlugin, runtimeLoader],
      }));
    }

    // Widgets bundle
    if (paths.widgets) {
      const widgetsTsPath = paths.widgets.replace('.js', '.ts');
      if ((await this.query(widgetsTsPath)).status !== 404) {
        builds.push(esbuild.build({
          ...shared,
          entryPoints: [VIRTUAL_ROOT + widgetsTsPath],
          outfile: paths.widgets,
          external: [...EMROUTE_EXTERNALS],
          plugins: [runtimeLoader],
        }));
      }
    }

    const results = await Promise.all(builds);

    // Write all output files through the runtime
    for (const result of results) {
      for (const file of result.outputFiles) {
        // outfile paths are relative — ensure leading /
        const runtimePath = file.path.startsWith('/') ? file.path : '/' + file.path;
        await this.command(runtimePath, { body: file.contents as unknown as BodyInit });
      }
    }

    await this.writeShell(paths);

    await esbuild.stop();
    BunSqliteRuntime._esbuild = null;
  }

  // ── Private ─────────────────────────────────────────────────────────

  private async read(path: string): Promise<Response> {
    if (path.endsWith('/')) {
      const children = this.listChildren(path);
      if (children.length === 0) {
        return new Response('Not Found', { status: 404 });
      }
      return Response.json(children);
    }

    if (!this.stmtGet.get(path) && this.hasChildren(path + '/')) {
      return Response.json(this.listChildren(path + '/'));
    }

    const row = this.stmtGet.get(path) as { data: Uint8Array; mtime: string } | null;
    if (!row) {
      if (path === ROUTES_MANIFEST_PATH) return this.resolveRoutesManifest();
      if (path === WIDGETS_MANIFEST_PATH) return this.resolveWidgetsManifest();
      return new Response('Not Found', { status: 404 });
    }

    const data = new Uint8Array(row.data);
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    const headers: HeadersInit = {
      'Content-Type': CONTENT_TYPES.get(ext) ?? 'application/octet-stream',
      'Content-Length': data.byteLength.toString(),
      'Last-Modified': new Date(row.mtime).toUTCString(),
    };

    return new Response(data, { status: 200, headers });
  }

  private async write(path: string, body: BodyInit | null): Promise<Response> {
    const data = body
      ? new Uint8Array(await new Response(body).arrayBuffer())
      : new Uint8Array();
    this.stmtSet.run(path, data, new Date().toISOString());
    return new Response(null, { status: 204 });
  }

  private listChildren(prefix: string): string[] {
    const rows = this.stmtList.all(prefix) as { path: string }[];
    const entries = new Set<string>();
    for (const row of rows) {
      const rest = row.path.slice(prefix.length);
      const slashIdx = rest.indexOf('/');
      if (slashIdx === -1) {
        entries.add(rest);
      } else {
        entries.add(rest.slice(0, slashIdx + 1));
      }
    }
    return [...entries];
  }

  private hasChildren(prefix: string): boolean {
    return this.stmtHas.get(prefix) !== null;
  }

  // ── Transpile / esbuild ───────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static _esbuild: any = null;

  private static async esbuild() {
    if (!BunSqliteRuntime._esbuild) {
      BunSqliteRuntime._esbuild = await import('esbuild');
    }
    return BunSqliteRuntime._esbuild;
  }

  static override transpile(source: string): Promise<string> {
    const transpiler = new Bun.Transpiler({ loader: 'ts' });
    return Promise.resolve(transpiler.transformSync(source));
  }

  static override async stopBundler(): Promise<void> {
    if (BunSqliteRuntime._esbuild) {
      await BunSqliteRuntime._esbuild.stop();
      BunSqliteRuntime._esbuild = null;
    }
  }

  private parsePath(resource: FetchParams[0]): string {
    if (typeof resource === 'string') return decodeURIComponent(resource);
    if (resource instanceof URL) return decodeURIComponent(resource.pathname);
    return decodeURIComponent(new URL(resource.url).pathname);
  }

  private parse(
    resource: FetchParams[0],
    init?: RequestInit,
  ): [string, string, BodyInit | null] {
    const pathname = this.parsePath(resource);
    if (typeof resource === 'string' || resource instanceof URL) {
      return [pathname, init?.method ?? 'GET', init?.body ?? null];
    }
    return [
      pathname,
      init?.method ?? resource.method,
      init?.body ?? resource.body,
    ];
  }
}
