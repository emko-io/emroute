/**
 * IndexedDB Runtime
 *
 * Browser-compatible Runtime backed by IndexedDB.
 * Stores user content (pages, widgets, manifests) with full CRUD,
 * directory listing, and persistent storage.
 *
 * Schema: single object store, key = path (string), value = Uint8Array.
 * Content type inferred from file extension via CONTENT_TYPES map.
 */

import {
  CONTENT_TYPES,
  type FetchParams,
  type FetchReturn,
  Runtime,
  type RuntimeConfig,
} from './abstract.runtime.ts';

const STORE_NAME = 'files';

export class IdbRuntime extends Runtime {
  private db: IDBDatabase | null = null;
  private readonly dbName: string;

  constructor(dbName: string, config: RuntimeConfig = {}) {
    super(config);
    this.dbName = dbName;
  }

  private open(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  handle(
    resource: FetchParams[0],
    init?: FetchParams[1],
  ): FetchReturn {
    const [pathname, method, body] = this.parse(resource, init);

    switch (method) {
      case 'PUT':
        return this.write(pathname, body);
      case 'DELETE':
        return this.delete(pathname);
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
      return this.get(pathname).then((data) => {
        if (!data) throw new Error(`Not found: ${pathname}`);
        return new TextDecoder().decode(data);
      });
    }
    return this.handle(resource, options);
  }

  override async loadModule(path: string): Promise<unknown> {
    const data = await this.get(path);
    if (!data) throw new Error(`Module not found in IDB: ${path}`);
    const buf = data.buffer as ArrayBuffer;
    const blob = new Blob([buf], { type: 'application/javascript' });
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await import(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  // ── Private ─────────────────────────────────────────────────────────

  private async read(path: string): Promise<Response> {
    if (path.endsWith('/')) {
      const children = await this.listChildren(path);
      if (children.length === 0) return new Response('Not Found', { status: 404 });
      return Response.json(children);
    }

    const data = await this.get(path);
    if (!data) {
      // Directory-style fallback: check if path has children
      const children = await this.listChildren(path + '/');
      if (children.length > 0) return Response.json(children);
      return new Response('Not Found', { status: 404 });
    }

    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    return new Response(data.buffer as ArrayBuffer, {
      status: 200,
      headers: { 'Content-Type': CONTENT_TYPES.get(ext) ?? 'application/octet-stream' },
    });
  }

  private async write(path: string, body: BodyInit | null): Promise<Response> {
    const data = body
      ? new Uint8Array(await new Response(body).arrayBuffer())
      : new Uint8Array();
    await this.put(path, data);
    return new Response(null, { status: 204 });
  }

  private async delete(path: string): Promise<Response> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(path);
      tx.oncomplete = () => resolve(new Response(null, { status: 204 }));
      tx.onerror = () => reject(tx.error);
    });
  }

  private async get(path: string): Promise<Uint8Array | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(path);
      req.onsuccess = () => resolve(req.result as Uint8Array | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  private async put(path: string, data: Uint8Array): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(data, path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async listChildren(prefix: string): Promise<string[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const range = IDBKeyRange.bound(prefix, prefix + '\uffff', false, false);
      const req = store.getAllKeys(range);
      req.onsuccess = () => {
        const entries = new Set<string>();
        for (const key of req.result as string[]) {
          const rest = (key as string).slice(prefix.length);
          const slashIdx = rest.indexOf('/');
          if (slashIdx === -1) {
            entries.add(rest);
          } else {
            entries.add(rest.slice(0, slashIdx + 1));
          }
        }
        resolve([...entries]);
      };
      req.onerror = () => reject(req.error);
    });
  }

  private parsePath(resource: FetchParams[0]): string {
    if (typeof resource === 'string') return resource;
    if (resource instanceof URL) return resource.pathname;
    return new URL(resource.url).pathname;
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
