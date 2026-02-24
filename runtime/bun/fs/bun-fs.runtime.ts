import { stat, readdir, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
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
import { createRuntimeLoaderPlugin } from '../esbuild-runtime-loader.plugin.ts';
import { generateMainTs } from '../../../server/codegen.util.ts';

export class BunFsRuntime extends Runtime {
  private readonly root: string;

  constructor(root: string, config: RuntimeConfig = {}) {
    if (config.entryPoint && !config.bundlePaths) {
      config.bundlePaths = { emroute: '/emroute.js', app: '/app.js' };
    }
    super(config);
    const abs = resolve(root);
    this.root = abs.endsWith('/') ? abs.slice(0, -1) : abs;
  }

  handle(
    resource: FetchParams[0],
    init?: FetchParams[1],
  ): FetchReturn {
    const [pathname, method, body] = this.parse(resource, init);
    const path = `${this.root}${pathname}`;

    switch (method) {
      case 'PUT':
        return this.write(path, body);
      default:
        return this.read(path);
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
      return Bun.file(`${this.root}${pathname}`).text();
    }
    return this.handle(resource, options);
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

  private async read(path: string): Promise<Response> {
    try {
      const info = await stat(path);

      if (info.isDirectory()) {
        return this.list(path);
      }

      const content = new Uint8Array(await Bun.file(path).arrayBuffer());
      const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
      const headers: HeadersInit = {
        'Content-Type': CONTENT_TYPES.get(ext) ?? 'application/octet-stream',
        'Content-Length': content.byteLength.toString(),
      };

      if (info.mtime) {
        headers['Last-Modified'] = info.mtime.toUTCString();
      }

      return new Response(content, { status: 200, headers });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const pathname = path.slice(this.root.length);
        if (pathname === ROUTES_MANIFEST_PATH) return this.resolveRoutesManifest();
        if (pathname === WIDGETS_MANIFEST_PATH) return this.resolveWidgetsManifest();
        return new Response('Not Found', { status: 404 });
      }
      return new Response(`Internal Error: ${error}`, { status: 500 });
    }
  }

  private async list(path: string): Promise<Response> {
    const entries: string[] = [];
    const dirents = await readdir(path, { withFileTypes: true });
    for (const entry of dirents) {
      entries.push(entry.name + (entry.isDirectory() ? '/' : ''));
    }
    return Response.json(entries);
  }

  private async write(path: string, body: BodyInit | null): Promise<Response> {
    try {
      const content = body
        ? new Uint8Array(await new Response(body).arrayBuffer())
        : new Uint8Array();
      const dir = path.slice(0, path.lastIndexOf('/'));
      if (dir) await mkdir(dir, { recursive: true });
      await Bun.write(path, content);
      return new Response(null, { status: 204 });
    } catch (error) {
      return new Response(`Write failed: ${error}`, { status: 500 });
    }
  }

  override loadModule(path: string): Promise<unknown> {
    return import(this.root + path);
  }

  // ── Bundling ─────────────────────────────────────────────────────────

  override async bundle(): Promise<void> {
    if (this.config.spa === 'none') return;
    const paths = this.config.bundlePaths;
    if (!paths) return;

    const esbuild = await BunFsRuntime.esbuild();
    const builds: Promise<{ outputFiles: { path: string; contents: Uint8Array }[] }>[] = [];
    const shared = { bundle: true, write: false, format: 'esm' as const, platform: 'browser' as const };
    const runtimeLoader = createRuntimeLoaderPlugin({ runtime: this, root: this.root });

    // Emroute SPA bundle — resolve from consumer's node_modules (no runtime loader needed)
    const consumerRequire = createRequire(this.root + '/');
    const spaEntry = consumerRequire.resolve('@emkodev/emroute/spa');
    builds.push(esbuild.build({
      ...shared,
      entryPoints: [spaEntry],
      outfile: `${this.root}${paths.emroute}`,
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
        basePath: '/html',
        resolveDir: this.root,
      });
      builds.push(esbuild.build({
        ...shared,
        entryPoints: [`${this.root}${this.config.entryPoint}`],
        outfile: `${this.root}${paths.app}`,
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
          entryPoints: [`${this.root}${widgetsTsPath}`],
          outfile: `${this.root}${paths.widgets}`,
          external: [...EMROUTE_EXTERNALS],
          plugins: [runtimeLoader],
        }));
      }
    }

    const results = await Promise.all(builds);

    // Write all output files through the runtime
    for (const result of results) {
      for (const file of result.outputFiles) {
        const runtimePath = file.path.startsWith(this.root)
          ? file.path.slice(this.root.length)
          : '/' + file.path;
        await this.command(runtimePath, { body: file.contents as unknown as BodyInit });
      }
    }

    await this.writeShell(paths);

    await esbuild.stop();
    BunFsRuntime._esbuild = null;
  }

  // ── Transpile / esbuild ───────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static _esbuild: any = null;

  private static async esbuild() {
    if (!BunFsRuntime._esbuild) {
      // Resolve esbuild from the consumer's node_modules, not the package's
      const consumerRequire = createRequire(process.cwd() + '/');
      BunFsRuntime._esbuild = consumerRequire('esbuild');
    }
    return BunFsRuntime._esbuild;
  }

  static override transpile(source: string): Promise<string> {
    const transpiler = new Bun.Transpiler({ loader: 'ts' });
    return Promise.resolve(transpiler.transformSync(source));
  }

  static override async stopBundler(): Promise<void> {
    if (BunFsRuntime._esbuild) {
      await BunFsRuntime._esbuild.stop();
      BunFsRuntime._esbuild = null;
    }
  }
}
