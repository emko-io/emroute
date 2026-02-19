/**
 * Server Runtime
 *
 * Abstract base class with node:* defaults that work on Deno, Node.js, and Bun.
 * Override serve() for platform-native HTTP performance.
 */

import { mkdir, opendir, readFile, stat, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import process from 'node:process';

export interface FileStat {
  isFile: boolean;
  isDirectory: boolean;
  mtime: number | null;
}

export interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

export interface ServerHandle {
  shutdown(): Promise<void>;
}

export interface WatchHandle {
  close(): void;
}

export type RequestHandler = (req: Request) => Promise<Response>;

export type WatchEventKind = 'create' | 'modify' | 'remove';

export interface WatchEvent {
  kind: WatchEventKind;
  paths: string[];
}

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

/** Map node:fs error codes to ServerRuntimeError codes. */
function mapErrorCode(err: unknown): 'NOT_FOUND' | 'PERMISSION_DENIED' | 'UNKNOWN' {
  const code = (err as { code?: string }).code;
  if (code === 'ENOENT') return 'NOT_FOUND';
  if (code === 'EACCES' || code === 'EPERM') return 'PERMISSION_DENIED';
  return 'UNKNOWN';
}

/** Convert node:http IncomingMessage to Web Request. */
function toRequest(req: IncomingMessage): Request {
  const url = new URL(req.url!, `http://${req.headers.host ?? 'localhost'}`);
  return new Request(url, {
    method: req.method,
    headers: req.headers as Record<string, string>,
  });
}

/** Write Web Response to node:http ServerResponse. */
async function writeResponse(response: Response, res: ServerResponse): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) {
    const reader = response.body.getReader();
    let result = await reader.read();
    while (!result.done) {
      res.write(result.value);
      result = await reader.read();
    }
  }
  res.end();
}

export abstract class ServerRuntime {
  /** Start HTTP server on given port. Override for platform-native performance. */
  serve(port: number, handler: RequestHandler): ServerHandle {
    const server = createServer(async (req, res) => {
      const request = toRequest(req);
      const response = await handler(request);
      await writeResponse(response, res);
    });
    server.listen(port);
    return {
      async shutdown() {
        await new Promise<void>((resolve, reject) =>
          server.close((err) => err ? reject(err) : resolve())
        );
      },
    };
  }

  async readTextFile(path: string): Promise<string> {
    try {
      return await readFile(path, 'utf-8');
    } catch (error) {
      throw new ServerRuntimeError(
        mapErrorCode(error) === 'NOT_FOUND' ? `File not found: ${path}` : `${error}`,
        mapErrorCode(error),
      );
    }
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    try {
      await writeFile(path, content, 'utf-8');
    } catch (error) {
      throw new ServerRuntimeError(`${error}`, mapErrorCode(error));
    }
  }

  async readFile(path: string): Promise<Uint8Array> {
    try {
      const buffer = await readFile(path);
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } catch (error) {
      throw new ServerRuntimeError(
        mapErrorCode(error) === 'NOT_FOUND' ? `File not found: ${path}` : `${error}`,
        mapErrorCode(error),
      );
    }
  }

  async stat(path: string): Promise<FileStat | null> {
    try {
      const s = await stat(path);
      return {
        isFile: s.isFile(),
        isDirectory: s.isDirectory(),
        mtime: s.mtimeMs ?? null,
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return null;
      throw error;
    }
  }

  async exists(path: string): Promise<boolean> {
    return (await this.stat(path)) !== null;
  }

  async *readDir(path: string): AsyncIterable<DirEntry> {
    try {
      const dir = await opendir(path);
      for await (const entry of dir) {
        yield {
          name: entry.name,
          isFile: entry.isFile(),
          isDirectory: entry.isDirectory(),
        };
      }
    } catch (error) {
      const code = mapErrorCode(error);
      throw new ServerRuntimeError(
        code === 'NOT_FOUND' ? `Directory not found: ${path}` : `${error}`,
        code,
      );
    }
  }

  async serveStaticFile(_req: Request, path: string): Promise<Response> {
    try {
      const buffer = await readFile(path);
      const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
      return new Response(new Uint8Array(buffer) as BodyInit, {
        status: 200,
        headers: { 'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream' },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        return new Response('Not Found', { status: 404 });
      }
      throw error;
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await mkdir(path, options);
  }

  env(key: string): string | undefined {
    return process.env[key];
  }

  cwd(): string {
    return process.cwd();
  }

  resolveModule(specifier: string): string {
    return new URL(import.meta.resolve(specifier)).pathname;
  }

  watchDir(path: string, callback: (event: WatchEvent) => void): WatchHandle {
    const watcher = watch(path, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const kind: WatchEventKind = eventType === 'rename' ? 'create' : 'modify';
      const fullPath = path.endsWith('/') ? path + filename : path + '/' + filename;
      callback({ kind, paths: [fullPath] });
    });
    return { close: () => watcher.close() };
  }
}

export class ServerRuntimeError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'PERMISSION_DENIED' | 'UNKNOWN',
  ) {
    super(message);
    this.name = 'ServerRuntimeError';
  }
}
