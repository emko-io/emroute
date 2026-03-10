/**
 * Cache Runtime
 *
 * Browser-compatible Runtime backed by the Cache API.
 * Used inside ServiceWorkers to serve files offline.
 *
 * No bundling, no transpiling, no filesystem access.
 * No directory scanning — manifests are pre-cached during SW install.
 */

import {
  CONTENT_TYPES,
  type FetchParams,
  type FetchReturn,
  Runtime,
  type RuntimeConfig,
} from './abstract.runtime.ts';

export class CacheRuntime extends Runtime {
  private cache: Cache | null = null;
  private readonly cacheName: string;

  constructor(cacheName: string, config: RuntimeConfig = {}) {
    super(config);
    this.cacheName = cacheName;
  }

  private async getCache(): Promise<Cache> {
    this.cache ??= await caches.open(this.cacheName);
    return this.cache;
  }

  handle(
    resource: FetchParams[0],
    init?: FetchParams[1],
  ): FetchReturn {
    const path = this.parsePath(resource);
    const method = init?.method ?? 'GET';

    switch (method) {
      case 'PUT':
        return this.write(path, init?.body ?? null);
      case 'DELETE':
        return this.delete(path);
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
      return this.read(this.parsePath(resource)).then(async (r) => {
        if (r.status === 404) throw new Error(`Not found: ${this.parsePath(resource)}`);
        return r.text();
      });
    }
    return this.handle(resource, options);
  }

  override async loadModule(path: string): Promise<unknown> {
    const response = await this.read(path);
    if (response.status === 404) {
      throw new Error(`Module not found in cache: ${path}`);
    }
    const js = await response.text();
    const blob = new Blob([js], { type: 'application/javascript' });
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await import(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  // ── Private ─────────────────────────────────────────────────────────

  private async read(path: string): Promise<Response> {
    const cache = await this.getCache();
    const key = new Request(this.toFakeUrl(path));
    const cached = await cache.match(key);
    if (!cached) return new Response('Not Found', { status: 404 });
    return cached;
  }

  private async write(path: string, body: BodyInit | null): Promise<Response> {
    const cache = await this.getCache();
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    const contentType = CONTENT_TYPES.get(ext) ?? 'application/octet-stream';
    const response = new Response(body, {
      status: 200,
      headers: { 'Content-Type': contentType },
    });
    await cache.put(new Request(this.toFakeUrl(path)), response);
    return new Response(null, { status: 204 });
  }

  private async delete(path: string): Promise<Response> {
    const cache = await this.getCache();
    await cache.delete(new Request(this.toFakeUrl(path)));
    return new Response(null, { status: 204 });
  }

  private parsePath(resource: FetchParams[0]): string {
    if (typeof resource === 'string') return resource;
    if (resource instanceof URL) return resource.pathname;
    return new URL(resource.url).pathname;
  }

  /**
   * Cache API requires full URLs as keys.
   * Use a synthetic origin so paths are consistent regardless of SW scope.
   */
  private toFakeUrl(path: string): string {
    return `https://emroute-cache${path}`;
  }
}
