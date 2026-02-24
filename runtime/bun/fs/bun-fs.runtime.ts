import { stat, readdir, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  CONTENT_TYPES,
  EMROUTE_EXTERNALS,
  type FetchParams,
  type FetchReturn,
  ROUTES_MANIFEST_PATH,
  Runtime,
  type RuntimeConfig,
  WIDGETS_MANIFEST_PATH,
} from '../../abstract.runtime.ts';

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

  // ── Bundling ─────────────────────────────────────────────────────────

  override async bundle(): Promise<void> {
    const paths = this.config.bundlePaths;
    if (!paths) return;

    const esbuild = await BunFsRuntime.esbuild();

    // Emroute SPA bundle — resolve from consumer's node_modules
    const consumerRequire = createRequire(this.root + '/');
    const spaEntry = consumerRequire.resolve('@emkodev/emroute/spa');
    await esbuild.build({
      entryPoints: [spaEntry],
      bundle: true,
      write: true,
      outfile: `${this.root}${paths.emroute}`,
      format: 'esm',
      platform: 'browser',
    });

    // App bundle
    if (this.config.entryPoint) {
      await esbuild.build({
        entryPoints: [`${this.root}${this.config.entryPoint}`],
        bundle: true,
        write: true,
        outfile: `${this.root}${paths.app}`,
        format: 'esm',
        platform: 'browser',
        external: EMROUTE_EXTERNALS,
        loader: { '.ts': 'ts' },
      });
    }

    // Widgets bundle
    if (paths.widgets) {
      const widgetsEntry = `${this.root}${paths.widgets.replace('.js', '.ts')}`;
      try {
        await stat(widgetsEntry);
        await esbuild.build({
          entryPoints: [widgetsEntry],
          bundle: true,
          write: true,
          outfile: `${this.root}${paths.widgets}`,
          format: 'esm',
          platform: 'browser',
          external: EMROUTE_EXTERNALS,
          loader: { '.ts': 'ts' },
        });
      } catch { /* no widgets entry, skip */ }
    }

    await this.writeShell(paths);

    await esbuild.stop();
    BunFsRuntime._esbuild = null;
  }

  private async writeShell(
    paths: { emroute: string; app: string; widgets?: string },
  ): Promise<void> {
    const shellPath = `${this.root}/index.html`;
    try {
      await stat(shellPath);
      return; // Don't overwrite existing
    } catch { /* not found, generate */ }

    const imports: Record<string, string> = {
      '@emkodev/emroute/spa': paths.emroute,
      '@emkodev/emroute/overlay': paths.emroute,
      '@emkodev/emroute': paths.emroute,
    };
    const importMap = JSON.stringify({ imports }, null, 2);

    const scripts = [
      `<script type="importmap">\n${importMap}\n  </script>`,
    ];
    if (this.config.entryPoint) {
      scripts.push(`<script type="module" src="${paths.app}"></script>`);
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>emroute</title>
  <style>@view-transition { navigation: auto; } router-slot { display: contents; }</style>
</head>
<body>
  <router-slot></router-slot>
  ${scripts.join('\n  ')}
</body>
</html>`;

    await Bun.write(shellPath, html);
  }

  // ── Transpile / esbuild ───────────────────────────────────────────────

  private static _esbuild: any = null;

  private static async esbuild() {
    if (!BunFsRuntime._esbuild) {
      // Resolve esbuild from the consumer's node_modules, not the package's
      const consumerRequire = createRequire(process.cwd() + '/');
      BunFsRuntime._esbuild = consumerRequire('esbuild');
    }
    return BunFsRuntime._esbuild;
  }

  static override async transpile(source: string): Promise<string> {
    const esbuild = await BunFsRuntime.esbuild();
    const result = await esbuild.transform(source, {
      loader: 'ts',
      format: 'esm',
      target: 'esnext',
    });
    return result.code;
  }

  static override async stopBundler(): Promise<void> {
    if (BunFsRuntime._esbuild) {
      await BunFsRuntime._esbuild.stop();
      BunFsRuntime._esbuild = null;
    }
  }
}
