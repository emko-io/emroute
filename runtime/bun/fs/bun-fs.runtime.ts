import { stat, readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  CONTENT_TYPES,
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

  override async transpile(source: string): Promise<string> {
    const transpiler = new Bun.Transpiler({ loader: 'ts' });
    return transpiler.transformSync(source);
  }
}
