/**
 * Fetch Runtime
 *
 * Browser-compatible Runtime that delegates all reads to a remote server
 * via `fetch()`. Used by the thin client in `root` mode — same
 * `createEmrouteServer` runs in the browser, but the Runtime fetches
 * files from the real server instead of reading from disk.
 *
 * No bundling, no transpiling, no filesystem access.
 * No directory scanning — the remote server already has manifests.
 */

import {
  type FetchParams,
  type FetchReturn,
  Runtime,
  type RuntimeConfig,
} from './abstract.runtime.ts';

export class FetchRuntime extends Runtime {
  private readonly origin: string;

  /**
   * @param origin — Server origin, e.g. `'http://localhost:4100'` or `location.origin`.
   */
  constructor(origin: string, config: RuntimeConfig = {}) {
    super(config);
    this.origin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  }

  handle(
    resource: FetchParams[0],
    init?: FetchParams[1],
  ): FetchReturn {
    const url = this.toUrl(resource);
    return fetch(url, init);
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
      return fetch(this.toUrl(resource)).then((r) => r.text());
    }
    return this.handle(resource, options);
  }

  override async loadModule(path: string): Promise<unknown> {
    const url = `${this.origin}${path}`;
    const response = await fetch(url);
    const js = await response.text();
    const blob = new Blob([js], { type: 'application/javascript' });
    return import(URL.createObjectURL(blob));
  }

  private toUrl(resource: FetchParams[0]): string {
    if (typeof resource === 'string') return `${this.origin}${resource}`;
    if (resource instanceof URL) return `${this.origin}${resource.pathname}${resource.search}`;
    return `${this.origin}${new URL(resource.url).pathname}`;
  }
}
