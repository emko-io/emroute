import { test, expect, describe } from 'bun:test';
import { FetchRuntime } from '../../runtime/fetch.runtime.ts';

/**
 * Create a mock fetch that responds based on a map of path → body.
 * Tracks all calls for assertion.
 */
function mockFetch(
  responses: Record<string, { status?: number; body?: string; headers?: Record<string, string> }> = {},
) {
  const calls: { url: string; init?: RequestInit }[] = [];

  const fn = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    calls.push({ url, ...(init ? { init } : {}) });

    const match = responses[url];
    if (match) {
      return Promise.resolve(
        new Response(match.body ?? '', {
          status: match.status ?? 200,
          ...(match.headers ? { headers: match.headers } : {}),
        }),
      );
    }

    return Promise.resolve(new Response('Not Found', { status: 404 }));
  };

  (fn as unknown as Record<string, unknown>).preconnect = () => {};
  return { fn: fn as unknown as typeof globalThis.fetch, calls };
}

const ORIGIN = 'http://localhost:4100';

describe('FetchRuntime', () => {
  describe('constructor', () => {
    test('stores origin without trailing slash', () => {
      const runtime = new FetchRuntime('http://localhost:4100/');
      // Verify by making a query and checking the URL
      const original = globalThis.fetch;
      const mock = mockFetch({
        'http://localhost:4100/test.txt': { body: 'ok' },
      });
      globalThis.fetch = mock.fn;
      try {
        runtime.query('/test.txt', { as: 'text' });
        expect(mock.calls[0].url).toBe('http://localhost:4100/test.txt');
      } finally {
        globalThis.fetch = original;
      }
    });

    test('stores origin as-is when no trailing slash', () => {
      const runtime = new FetchRuntime('http://localhost:4100');
      const original = globalThis.fetch;
      const mock = mockFetch({
        'http://localhost:4100/file.js': { body: '' },
      });
      globalThis.fetch = mock.fn;
      try {
        runtime.query('/file.js', { as: 'text' });
        expect(mock.calls[0].url).toBe('http://localhost:4100/file.js');
      } finally {
        globalThis.fetch = original;
      }
    });

    test('accepts custom RuntimeConfig', () => {
      const runtime = new FetchRuntime(ORIGIN, { routesDir: '/pages' });
      expect(runtime.config.routesDir).toBe('/pages');
    });

    test('defaults config to empty object', () => {
      const runtime = new FetchRuntime(ORIGIN);
      expect(runtime.config).toEqual({});
    });
  });

  describe('handle()', () => {
    test('fetches string resource at origin + path', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/routes/index.page.ts`]: { body: 'export default {}' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        const response = await runtime.handle('/routes/index.page.ts');
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('export default {}');
        expect(mock.calls[0].url).toBe(`${ORIGIN}/routes/index.page.ts`);
      } finally {
        globalThis.fetch = original;
      }
    });

    test('passes init options through to fetch', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/data`]: { body: 'ok' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        await runtime.handle('/data', { method: 'PUT', body: 'content' });
        expect(mock.calls[0].init).toEqual({ method: 'PUT', body: 'content' });
      } finally {
        globalThis.fetch = original;
      }
    });

    test('handles URL resource', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/some/path`]: { body: 'found' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        const response = await runtime.handle(new URL('http://any-host/some/path'));
        expect(await response.text()).toBe('found');
        expect(mock.calls[0].url).toBe(`${ORIGIN}/some/path`);
      } finally {
        globalThis.fetch = original;
      }
    });

    test('handles URL with query string', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/api?q=test`]: { body: '{"results":[]}' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        const response = await runtime.handle(new URL('http://any/api?q=test'));
        expect(await response.text()).toBe('{"results":[]}');
        expect(mock.calls[0].url).toBe(`${ORIGIN}/api?q=test`);
      } finally {
        globalThis.fetch = original;
      }
    });

    test('handles Request resource', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/resource`]: { body: 'data' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        const request = new Request('http://example.com/resource');
        const response = await runtime.handle(request);
        expect(await response.text()).toBe('data');
        expect(mock.calls[0].url).toBe(`${ORIGIN}/resource`);
      } finally {
        globalThis.fetch = original;
      }
    });

    test('returns 404 for missing resource', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({});
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        const response = await runtime.handle('/nonexistent');
        expect(response.status).toBe(404);
      } finally {
        globalThis.fetch = original;
      }
    });
  });

  describe('query()', () => {
    test('returns Response by default', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/file.html`]: { body: '<h1>hi</h1>', headers: { 'Content-Type': 'text/html' } },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        const response = await runtime.query('/file.html');
        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('<h1>hi</h1>');
      } finally {
        globalThis.fetch = original;
      }
    });

    test('returns string when as: "text"', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/readme.md`]: { body: '# Hello' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        const text = await runtime.query('/readme.md', { as: 'text' });
        expect(typeof text).toBe('string');
        expect(text).toBe('# Hello');
      } finally {
        globalThis.fetch = original;
      }
    });

    test('query with as: "text" ignores init options (only fetches URL)', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/data.json`]: { body: '{"a":1}' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        const text = await runtime.query('/data.json', {
          as: 'text',
          method: 'POST',
          headers: { 'X-Custom': 'val' },
        });
        expect(text).toBe('{"a":1}');
        // as: "text" path only passes URL, no init
        expect(mock.calls[0].init).toBeUndefined();
      } finally {
        globalThis.fetch = original;
      }
    });

    test('query without as delegates to handle', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/style.css`]: { body: 'body {}' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        const response = await runtime.query('/style.css', { headers: { Accept: 'text/css' } });
        expect(response.status).toBe(200);
        // handle passes init through to fetch
        expect(mock.calls[0].init).toEqual({ headers: { Accept: 'text/css' } });
      } finally {
        globalThis.fetch = original;
      }
    });
  });

  describe('command()', () => {
    test('defaults to PUT method', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/file.txt`]: { body: 'ok' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        await runtime.command('/file.txt', { body: 'content' });
        expect(mock.calls[0].init?.method).toBe('PUT');
      } finally {
        globalThis.fetch = original;
      }
    });

    test('respects explicit method override', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/file.txt`]: { body: '' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        await runtime.command('/file.txt', { method: 'DELETE' });
        expect(mock.calls[0].init?.method).toBe('DELETE');
      } finally {
        globalThis.fetch = original;
      }
    });

    test('sends body to server', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/data.json`]: { body: 'written' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        const response = await runtime.command('/data.json', { body: '{"key":"value"}' });
        expect(response.status).toBe(200);
        expect(mock.calls[0].init?.body).toBe('{"key":"value"}');
      } finally {
        globalThis.fetch = original;
      }
    });

    test('non-routes/widgets/elements path returns result directly', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/static/image.png`]: { body: 'png-data' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        const response = await runtime.command('/static/image.png', { body: 'png-data' });
        expect(response.status).toBe(200);
        // Only one fetch call (no manifest interaction)
        expect(mock.calls).toHaveLength(1);
      } finally {
        globalThis.fetch = original;
      }
    });

    test('writing to routes dir triggers manifest merge', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/routes/about.page.ts`]: { body: 'ok' },
        [`${ORIGIN}/routes.manifest.json`]: { body: '{}' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        await runtime.command('/routes/about.page.ts', { body: 'export default {}' });
        // Expect: 1 handle for PUT, 1 handle for reading manifest, 1 handle for writing manifest
        // Plus retranspile check
        expect(mock.calls.length).toBeGreaterThan(1);
      } finally {
        globalThis.fetch = original;
      }
    });
  });

  describe('loadModule()', () => {
    test('fetches JS from origin and creates blob URL import', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/routes/index.page.js`]: {
          body: 'export const name = "test";',
        },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        // loadModule fetches, creates a blob URL, and dynamic-imports it
        const mod = await runtime.loadModule('/routes/index.page.js') as { name: string };
        expect(mod.name).toBe('test');
        expect(mock.calls[0].url).toBe(`${ORIGIN}/routes/index.page.js`);
      } finally {
        globalThis.fetch = original;
      }
    });
  });

  describe('error handling', () => {
    function failingFetch(message: string): typeof globalThis.fetch {
      const fn = () => Promise.reject(new TypeError(message));
      (fn as unknown as Record<string, unknown>).preconnect = () => {};
      return fn as unknown as typeof globalThis.fetch;
    }

    test('network failure propagates from handle', async () => {
      const original = globalThis.fetch;
      globalThis.fetch = failingFetch('Failed to fetch');
      try {
        const runtime = new FetchRuntime(ORIGIN);
        await expect(runtime.handle('/any')).rejects.toThrow('Failed to fetch');
      } finally {
        globalThis.fetch = original;
      }
    });

    test('network failure propagates from query', async () => {
      const original = globalThis.fetch;
      globalThis.fetch = failingFetch('Network error');
      try {
        const runtime = new FetchRuntime(ORIGIN);
        await expect(runtime.query('/any')).rejects.toThrow('Network error');
      } finally {
        globalThis.fetch = original;
      }
    });

    test('network failure propagates from query with as: "text"', async () => {
      const original = globalThis.fetch;
      globalThis.fetch = failingFetch('Offline');
      try {
        const runtime = new FetchRuntime(ORIGIN);
        await expect(runtime.query('/any', { as: 'text' })).rejects.toThrow('Offline');
      } finally {
        globalThis.fetch = original;
      }
    });

    test('network failure propagates from command', async () => {
      const original = globalThis.fetch;
      globalThis.fetch = failingFetch('Connection refused');
      try {
        const runtime = new FetchRuntime(ORIGIN);
        await expect(runtime.command('/file.txt', { body: 'x' })).rejects.toThrow('Connection refused');
      } finally {
        globalThis.fetch = original;
      }
    });

    test('server 500 response is returned as-is', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/broken`]: { status: 500, body: 'Internal Server Error' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        const response = await runtime.handle('/broken');
        expect(response.status).toBe(500);
        expect(await response.text()).toBe('Internal Server Error');
      } finally {
        globalThis.fetch = original;
      }
    });
  });

  describe('URL construction (toUrl)', () => {
    test('string path is prepended with origin', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/a/b/c`]: { body: 'ok' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        await runtime.handle('/a/b/c');
        expect(mock.calls[0].url).toBe(`${ORIGIN}/a/b/c`);
      } finally {
        globalThis.fetch = original;
      }
    });

    test('URL uses pathname and search from the URL object', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/path?key=val`]: { body: 'ok' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        await runtime.handle(new URL('https://other-origin.com/path?key=val'));
        expect(mock.calls[0].url).toBe(`${ORIGIN}/path?key=val`);
      } finally {
        globalThis.fetch = original;
      }
    });

    test('Request uses pathname from request URL', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        [`${ORIGIN}/api/data`]: { body: '{}' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime(ORIGIN);
        await runtime.handle(new Request('https://example.com/api/data'));
        expect(mock.calls[0].url).toBe(`${ORIGIN}/api/data`);
      } finally {
        globalThis.fetch = original;
      }
    });

    test('origin with trailing slash is normalized', async () => {
      const original = globalThis.fetch;
      const mock = mockFetch({
        ['http://example.com/test']: { body: 'ok' },
      });
      globalThis.fetch = mock.fn;
      try {
        const runtime = new FetchRuntime('http://example.com/');
        await runtime.handle('/test');
        expect(mock.calls[0].url).toBe('http://example.com/test');
      } finally {
        globalThis.fetch = original;
      }
    });
  });
});
