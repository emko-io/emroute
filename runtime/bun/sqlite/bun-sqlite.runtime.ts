import { Database } from 'bun:sqlite';
import {
  CONTENT_TYPES,
  type FetchParams,
  type FetchReturn,
  ROUTES_MANIFEST_PATH,
  Runtime,
  type RuntimeConfig,
  WIDGETS_MANIFEST_PATH,
} from '../../abstract.runtime.ts';

export class BunSqliteRuntime extends Runtime {
  private readonly db: Database;
  private readonly stmtGet: ReturnType<Database['prepare']>;
  private readonly stmtSet: ReturnType<Database['prepare']>;
  private readonly stmtList: ReturnType<Database['prepare']>;
  private readonly stmtHas: ReturnType<Database['prepare']>;

  constructor(path: string = ':memory:', config: RuntimeConfig = {}) {
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
    const blob = new Blob([source], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    try {
      return await import(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  override async transpile(source: string): Promise<string> {
    const transpiler = new Bun.Transpiler({ loader: 'ts' });
    return transpiler.transformSync(source);
  }

  close(): void {
    this.db.close();
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
