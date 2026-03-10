/**
 * Emroute Service Worker
 *
 * Runs Emroute inside a ServiceWorker. Intercepts fetch events and
 * serves pages from split storage — framework assets in Cache API,
 * user content (pages, widgets, manifests) in IndexedDB.
 *
 * Consumer creates their own sw.ts, calls `createEmrouteSW()` with
 * options, and the returned handler wires install/activate/fetch.
 */

/// <reference lib="webworker" />

import { Emroute } from '../../core/server/emroute.server.ts';
import { CacheRuntime } from '../../runtime/cache.runtime.ts';
import { IdbRuntime } from '../../runtime/idb.runtime.ts';
import {
  type FetchParams,
  type FetchReturn,
  Runtime,
} from '../../runtime/abstract.runtime.ts';
import type { ContextProvider } from '../../core/type/component.type.ts';
import type { MarkdownRenderer } from '../../core/type/markdown.type.ts';
import type { SpaMode } from '../../core/type/widget.type.ts';
import type { BasePath } from '../../core/server/emroute.server.ts';

declare const self: ServiceWorkerGlobalScope;

/** Options for the emroute ServiceWorker. */
export interface EmrouteSWOptions {
  /** Cache name — version this to bust stale caches. */
  cacheName: string;
  /** Framework asset paths to precache into Cache API (e.g. emroute.js, app.js). */
  precache: string[];
  /** User content paths to precache into IndexedDB (e.g. pages, widgets, manifests). */
  content?: string[];
  /** IndexedDB database name for user content. Defaults to 'emroute-content'. */
  dbName?: string;
  /** SPA mode (defaults to 'only'). */
  spa?: SpaMode;
  /** Base paths. */
  basePath?: BasePath;
  /** Title for the HTML shell. */
  title?: string;
  /** Markdown renderer (if pages use .md). */
  markdownRenderer?: MarkdownRenderer;
  /** Context provider for pages and widgets. */
  extendContext?: ContextProvider;
  /**
   * Origin to fetch precache files from during install.
   * Defaults to self.location.origin.
   */
  origin?: string;
}

/**
 * Composite Runtime: reads from Cache API first, falls back to IDB.
 * Writes go to IDB (user content is mutable).
 */
class SwRuntime extends Runtime {
  constructor(
    private readonly cache: CacheRuntime,
    private readonly idb: IdbRuntime,
  ) {
    super();
  }

  handle(
    resource: FetchParams[0],
    init?: FetchParams[1],
  ): FetchReturn {
    const method = init?.method ?? 'GET';

    // Writes go to IDB (user content)
    if (method === 'PUT' || method === 'DELETE') {
      return this.idb.handle(resource, init);
    }

    // Reads: Cache first, IDB fallback
    return this.cache.handle(resource, init).then(async (r) => {
      if (r.status !== 404) return r;
      return this.idb.handle(resource, init);
    });
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
      return this.handle(resource, options).then(async (r) => {
        if (r.status === 404) {
          const path = typeof resource === 'string' ? resource
            : resource instanceof URL ? resource.pathname
            : new URL(resource.url).pathname;
          throw new Error(`Not found: ${path}`);
        }
        return r.text();
      });
    }
    return this.handle(resource, options);
  }

  override async loadModule(path: string): Promise<unknown> {
    // Try cache first, then IDB
    try {
      return await this.cache.loadModule(path);
    } catch {
      return await this.idb.loadModule(path);
    }
  }
}

/**
 * Wire emroute into the ServiceWorker lifecycle.
 *
 * Call this from your sw.ts:
 * ```ts
 * import { createEmrouteSW } from '@emkodev/emroute/sw';
 * createEmrouteSW({
 *   cacheName: 'my-app-v1',
 *   precache: ['/emroute.js', '/app.js', '/importmap.json', '/main.css'],
 *   content: ['/routes.manifest.json', '/routes/index.page.js'],
 * });
 * ```
 */
export function createEmrouteSW(options: EmrouteSWOptions): void {
  const {
    cacheName,
    precache,
    content = [],
    dbName = 'emroute-content',
    origin = self.location.origin,
  } = options;

  const cacheRuntime = new CacheRuntime(cacheName);
  const idbRuntime = new IdbRuntime(dbName);
  const swRuntime = new SwRuntime(cacheRuntime, idbRuntime);

  let emroute: Emroute | null = null;

  async function getEmroute(): Promise<Emroute> {
    if (emroute) return emroute;
    emroute = await Emroute.create({
      spa: options.spa ?? 'only',
      ...(options.basePath ? { basePath: options.basePath } : {}),
      ...(options.title ? { title: options.title } : {}),
      ...(options.markdownRenderer ? { markdownRenderer: options.markdownRenderer } : {}),
      ...(options.extendContext ? { extendContext: options.extendContext } : {}),
    }, swRuntime);
    return emroute;
  }

  // ── Install: precache from network ──────────────────────────────────

  self.addEventListener('install', (event) => {
    event.waitUntil(
      (async () => {
        // Framework assets → Cache API
        if (precache.length > 0) {
          const cache = await caches.open(cacheName);
          await Promise.all(
            precache.map(async (path) => {
              try {
                const response = await fetch(`${origin}${path}`);
                if (response.ok) {
                  await cache.put(
                    new Request(`https://emroute-cache${path}`),
                    response,
                  );
                }
              } catch {
                console.error(`[emroute-sw] Failed to precache asset: ${path}`);
              }
            }),
          );
        }

        // User content → IDB
        if (content.length > 0) {
          await Promise.all(
            content.map(async (path) => {
              try {
                const response = await fetch(`${origin}${path}`);
                if (response.ok) {
                  const data = new Uint8Array(await response.arrayBuffer());
                  await idbRuntime.handle(path, {
                    method: 'PUT',
                    body: data,
                  });
                }
              } catch {
                console.error(`[emroute-sw] Failed to precache content: ${path}`);
              }
            }),
          );
        }

        await self.skipWaiting();
      })(),
    );
  });

  // ── Activate: claim clients, clean old caches ───────────────────────

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        // Delete old emroute caches
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key !== cacheName && key.startsWith('emroute'))
            .map((key) => caches.delete(key)),
        );
        await self.clients.claim();
      })(),
    );
  });

  // ── Fetch: serve from emroute or storage ────────────────────────────

  self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only handle same-origin requests
    if (url.origin !== self.location.origin) return;

    event.respondWith(handleFetch(event.request, url));
  });

  async function handleFetch(request: Request, url: URL): Promise<Response> {
    // Navigation requests → emroute server
    if (request.mode === 'navigate') {
      try {
        const server = await getEmroute();
        const response = await server.handleRequest(request);
        if (response) return response;
      } catch (e) {
        console.error('[emroute-sw] Navigation error:', e);
      }
      // Fall through to storage/network
    }

    // Static files → composite runtime (cache first, then IDB)
    const cached = await swRuntime.handle(url.pathname);
    if (cached.status !== 404) return cached;

    // Network fallback
    try {
      return await fetch(request);
    } catch {
      return new Response('Offline', { status: 503 });
    }
  }
}
