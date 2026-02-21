import {
  CONTENT_TYPES,
  type FetchParams,
  type FetchReturn,
  Runtime,
} from '../../abstract.runtime.ts';

export class DenoFsRuntime extends Runtime {
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
      return Deno.readTextFile(`${this.root}${pathname}`);
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
      const info = await Deno.stat(path);

      if (info.isDirectory) {
        return this.list(path);
      }

      const content = await Deno.readFile(path);
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
      if (error instanceof Deno.errors.NotFound) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response(`Internal Error: ${error}`, { status: 500 });
    }
  }

  private async list(path: string): Promise<Response> {
    const entries: string[] = [];
    for await (const entry of Deno.readDir(path)) {
      entries.push(entry.name + (entry.isDirectory ? '/' : ''));
    }
    return Response.json(entries);
  }

  private async write(path: string, body: BodyInit | null): Promise<Response> {
    try {
      const content = body
        ? new Uint8Array(await new Response(body).arrayBuffer())
        : new Uint8Array();
      const dir = path.slice(0, path.lastIndexOf('/'));
      if (dir) await Deno.mkdir(dir, { recursive: true });
      await Deno.writeFile(path, content);
      return new Response(null, { status: 204 });
    } catch (error) {
      return new Response(`Write failed: ${error}`, { status: 500 });
    }
  }

  // deno-lint-ignore no-explicit-any
  private static _esbuild: any = null;

  private static async esbuild() {
    if (!DenoFsRuntime._esbuild) {
      DenoFsRuntime._esbuild = await import('npm:esbuild@^0.27.3');
    }
    return DenoFsRuntime._esbuild;
  }

  static override async transpile(source: string): Promise<string> {
    const esbuild = await DenoFsRuntime.esbuild();
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
    const esbuild = await DenoFsRuntime.esbuild();
    const result = await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'neutral',
      external: options?.external,
      minify: options?.minify,
      plugins: [{
        name: 'runtime-fs',
        setup(build: { onResolve: Function; onLoad: Function }) {
          build.onResolve(
            { filter: /.*/ },
            (args: { path: string; importer: string; namespace: string }) => {
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
              // Entry point
              if (args.path === entryPoint) {
                return { path: args.path, namespace: 'runtime' };
              }
              // Bare specifiers — let esbuild resolve natively (needs resolveDir)
              return undefined;
            },
          );

          build.onLoad({ filter: /.*/, namespace: 'runtime' }, async (args: { path: string }) => {
            const contents = await resolve(args.path);
            if (contents === null) return undefined;
            return {
              contents,
              loader: args.path.endsWith('.ts') ? 'ts' as const : 'js' as const,
            };
          });
        },
      }],
    });
    return result.outputFiles[0].text;
  }
}
