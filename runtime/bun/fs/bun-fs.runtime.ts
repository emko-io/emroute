import { stat, readdir, mkdir } from 'node:fs/promises';
import {
  CONTENT_TYPES,
  type FetchParams,
  type FetchReturn,
  Runtime,
} from '../../abstract.runtime.ts';

export class BunFsRuntime extends Runtime {
  private readonly root: string;

  constructor(root: string) {
    super();
    this.root = root.endsWith('/') ? root.slice(0, -1) : root;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static _esbuild: any = null;

  private static async esbuild() {
    if (!BunFsRuntime._esbuild) {
      BunFsRuntime._esbuild = await import('esbuild');
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

  static override async bundle(
    entryPoint: string,
    resolve: (path: string) => Promise<string | null>,
    options?: { external?: string[]; minify?: boolean; resolveDir?: string },
  ): Promise<string> {
    const esbuild = await BunFsRuntime.esbuild();
    const resolveDir = options?.resolveDir ?? process.cwd();
    const result = await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      absWorkingDir: resolveDir,
      external: options?.external,
      minify: options?.minify,
      loader: { '.ts': 'ts' },
      plugins: [{
        name: 'runtime-fs',
        setup(build: { onResolve: Function; onLoad: Function }) {
          build.onResolve(
            { filter: /.*/ },
            (args: {
              path: string;
              importer: string;
              namespace: string;
              resolveDir: string;
            }) => {
              // Let external imports pass through
              if (
                options?.external?.some((ext) =>
                  args.path === ext || args.path.startsWith(ext + '/')
                )
              ) {
                return { path: args.path, external: true };
              }
              // Resolve relative imports against importer's directory
              if (args.path.startsWith('.') && args.namespace === 'runtime') {
                const dir = args.importer.replace(/[^/]*$/, '');
                return { path: dir + args.path.replace(/^\.\//, ''), namespace: 'runtime' };
              }
              // Entry point — load via virtual runtime namespace (only for virtual paths)
              if (args.path === entryPoint && entryPoint.startsWith('/')) {
                return { path: args.path, namespace: 'runtime' };
              }
              // Bare specifiers — let esbuild resolve from node_modules
              return undefined;
            },
          );

          build.onLoad({ filter: /.*/, namespace: 'runtime' }, async (args: { path: string }) => {
            const contents = await resolve(args.path);
            if (contents === null) return undefined;
            return {
              contents,
              loader: args.path.endsWith('.ts') ? 'ts' as const : 'js' as const,
              resolveDir,
            };
          });
        },
      }],
    });
    return result.outputFiles[0].text;
  }

  /** Stop the esbuild child process. Call after bundling is complete. */
  static override async stopBundler(): Promise<void> {
    if (BunFsRuntime._esbuild) {
      await BunFsRuntime._esbuild.stop();
      BunFsRuntime._esbuild = null;
    }
  }
}
