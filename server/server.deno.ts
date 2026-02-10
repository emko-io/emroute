/**
 * Deno Server Runtime Implementation
 */

import type {
  DirEntry,
  FileStat,
  ServerHandle,
  ServerRuntime,
  WatchEvent,
  WatchHandle,
} from './server.type.ts';
import { ServerRuntimeError } from './server.type.ts';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
};

export const denoServerRuntime: ServerRuntime = {
  serve(port: number, handler: (req: Request) => Promise<Response>): ServerHandle {
    const server = Deno.serve({ port }, handler);
    return {
      async shutdown() {
        await server.shutdown();
      },
    };
  },

  async writeTextFile(path: string, content: string): Promise<void> {
    try {
      await Deno.writeTextFile(path, content);
    } catch (error) {
      if (error instanceof Deno.errors.PermissionDenied) {
        throw new ServerRuntimeError(`Permission denied: ${path}`, 'PERMISSION_DENIED');
      }
      throw error;
    }
  },

  async readTextFile(path: string): Promise<string> {
    try {
      return await Deno.readTextFile(path);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new ServerRuntimeError(`File not found: ${path}`, 'NOT_FOUND');
      }
      if (error instanceof Deno.errors.PermissionDenied) {
        throw new ServerRuntimeError(`Permission denied: ${path}`, 'PERMISSION_DENIED');
      }
      throw error;
    }
  },

  async readFile(path: string): Promise<Uint8Array> {
    try {
      return await Deno.readFile(path);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new ServerRuntimeError(`File not found: ${path}`, 'NOT_FOUND');
      }
      if (error instanceof Deno.errors.PermissionDenied) {
        throw new ServerRuntimeError(`Permission denied: ${path}`, 'PERMISSION_DENIED');
      }
      throw error;
    }
  },

  async stat(path: string): Promise<FileStat | null> {
    try {
      const stat = await Deno.stat(path);
      return {
        isFile: stat.isFile,
        isDirectory: stat.isDirectory,
        mtime: stat.mtime?.getTime() ?? null,
      };
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return null;
      }
      throw error;
    }
  },

  async *readDir(path: string): AsyncIterable<DirEntry> {
    try {
      for await (const entry of Deno.readDir(path)) {
        yield {
          name: entry.name,
          isFile: entry.isFile,
          isDirectory: entry.isDirectory,
        };
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new ServerRuntimeError(`Directory not found: ${path}`, 'NOT_FOUND');
      }
      if (error instanceof Deno.errors.PermissionDenied) {
        throw new ServerRuntimeError(`Permission denied: ${path}`, 'PERMISSION_DENIED');
      }
      throw error;
    }
  },

  async serveStaticFile(_req: Request, path: string): Promise<Response> {
    try {
      const body = await Deno.readFile(path);
      const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream' },
      });
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return new Response('Not Found', { status: 404 });
      }
      throw error;
    }
  },

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await Deno.mkdir(path, options);
  },

  env(key: string): string | undefined {
    return Deno.env.get(key);
  },

  cwd(): string {
    return Deno.cwd();
  },

  watchDir(path: string, callback: (event: WatchEvent) => void): WatchHandle {
    const watcher = Deno.watchFs(path, { recursive: true });

    // Process events asynchronously
    (async () => {
      for await (const event of watcher) {
        if (event.kind === 'access') continue;

        // On macOS, FSEvents can deliver file creation as "other" or "any"
        // instead of "create", so treat all non-remove/non-create as "modify"
        const kind: WatchEvent['kind'] = event.kind === 'create'
          ? 'create'
          : event.kind === 'remove'
          ? 'remove'
          : 'modify';

        callback({ kind, paths: event.paths });
      }
    })();

    return {
      close() {
        watcher.close();
      },
    };
  },
};
