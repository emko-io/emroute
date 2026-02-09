/**
 * Deno Server Runtime Implementation
 */

import { serveFile } from 'jsr:@std/http@1.0.10/file-server';
import type {
  DirEntry,
  FileStat,
  ServerHandle,
  ServerRuntime,
  WatchEvent,
  WatchHandle,
} from './server.type.ts';
import { ServerRuntimeError } from './server.type.ts';

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

  async serveStaticFile(req: Request, path: string): Promise<Response> {
    return await serveFile(req, path);
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
