export const CONTENT_TYPES: Map<string, string> = new Map<string, string>([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.mjs', 'application/javascript; charset=utf-8'],
  ['.ts', 'text/typescript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/plain; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
]);

export type FetchParams = Parameters<typeof fetch>;
export type FetchReturn = ReturnType<typeof fetch>;

/**
 * Abstract resource provider. Speaks Request/Response (ADR-1).
 *
 * Three access patterns:
 * - `handle()` — raw passthrough, server forwards browser requests as-is.
 * - `query()` — read. Returns Response, or string when `{ as: "text" }`.
 * - `command()` — write (PUT by default, override with `{ method }` in options).
 */
export abstract class Runtime {
  /** Concrete runtimes implement this. Accepts the same args as `fetch()`. */
  abstract handle(resource: FetchParams[0], init?: FetchParams[1]): FetchReturn;

  /**
   * Read with `{ as: "text" }` — skip metadata, return contents only.
   * Semantically equivalent to `Accept: text/plain`; `as` exists for type safety.
   * TODO: revert to default implementation of calling this.handler().text(). Consumers can override.
   */
  abstract query(
    resource: FetchParams[0],
    options: FetchParams[1] & { as: 'text' },
  ): Promise<string>;
  /** Read — returns full Response with headers, status, body. */
  abstract query(
    resource: FetchParams[0],
    options?: FetchParams[1],
  ): FetchReturn;

  /** Write. Defaults to PUT; pass `{ method: "DELETE" }` etc. to override. */
  command(resource: FetchParams[0], options?: FetchParams[1]): FetchReturn {
    return this.handle(resource, { method: 'PUT', ...options });
  }

  static transpile(_ts: string): Promise<string> {
    throw new Error('Not implemented');
  }

  /**
   * Bundle a module and its dependencies into a self-contained JS string.
   *
   * Uses esbuild with a virtual filesystem plugin — no disk access needed.
   * The `resolve` callback reads file contents from the Runtime instance.
   * Framework imports (`@emkodev/emroute/*`) are marked external by default.
   */
  static bundle(
    _entryPoint: string,
    _resolve: (path: string) => Promise<string | null>,
    _options?: { external?: string[] },
  ): Promise<string> {
    throw new Error('Not implemented');
  }

  static compress(_data: Uint8Array, _encoding: 'br' | 'gzip'): Promise<Uint8Array> {
    throw new Error('Not implemented');
  }
}
