/**
 * Emroute.create() — manifest-fetch behavior.
 *
 * Regression coverage for the SPA boot path: when the caller supplies a
 * routeTree (because it already fetched the manifest itself), Emroute.create()
 * must NOT re-query the runtime for the same manifest.
 */
import { test, expect, describe } from 'bun:test';
import { Emroute } from '../../core/server/emroute.server.ts';
import { Runtime, ROUTES_MANIFEST_PATH, type FetchParams, type FetchReturn } from '../../runtime/abstract.runtime.ts';
import type { RouteNode } from '../../core/type/route-tree.type.ts';

class CountingRuntime extends Runtime {
  queries: string[] = [];
  commands: string[] = [];
  manifest: string | null = null;

  constructor(manifest: RouteNode | null) {
    super({});
    this.manifest = manifest ? JSON.stringify(manifest) : null;
  }

  handle(resource: FetchParams[0], init?: FetchParams[1]): FetchReturn {
    const path = pathOf(resource);
    const method = init?.method ?? 'GET';
    if (method === 'PUT') {
      this.commands.push(path);
      this.manifest = init?.body ? String(init.body) : '';
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (path === ROUTES_MANIFEST_PATH) {
      this.queries.push(path);
      return Promise.resolve(
        this.manifest === null
          ? new Response('Not Found', { status: 404 })
          : new Response(this.manifest, { status: 200 }),
      );
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  }

  query(resource: FetchParams[0], options: FetchParams[1] & { as: 'text' }): Promise<string>;
  query(resource: FetchParams[0], options?: FetchParams[1]): FetchReturn;
  query(
    resource: FetchParams[0],
    options?: FetchParams[1] & { as?: 'text' },
  ): Promise<Response | string> {
    if (options?.as === 'text') {
      return this.handle(resource, options).then((r) => r.text());
    }
    return this.handle(resource, options);
  }
}

function pathOf(resource: FetchParams[0]): string {
  if (typeof resource === 'string') return resource;
  if (resource instanceof URL) return resource.pathname;
  return new URL(resource.url).pathname;
}

const TREE: RouteNode = { children: {} };

describe('Emroute.create() manifest fetch', () => {
  test('does NOT query the manifest when routeTree is provided', async () => {
    const runtime = new CountingRuntime(TREE);

    await Emroute.create({ routeTree: TREE, spa: 'root' }, runtime);

    const manifestQueries = runtime.queries.filter((p) => p === ROUTES_MANIFEST_PATH);
    expect(manifestQueries.length).toBe(0);
  });

  test('queries the manifest exactly once when routeTree is NOT provided', async () => {
    const runtime = new CountingRuntime(TREE);

    await Emroute.create({ spa: 'root' }, runtime);

    const manifestQueries = runtime.queries.filter((p) => p === ROUTES_MANIFEST_PATH);
    expect(manifestQueries.length).toBe(1);
  });

  test('throws when neither routeTree nor a stored manifest exists', async () => {
    const runtime = new CountingRuntime(null);

    await expect(Emroute.create({ spa: 'root' }, runtime)).rejects.toThrow(
      /not found in runtime/,
    );
  });
});
