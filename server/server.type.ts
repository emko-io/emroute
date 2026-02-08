/**
 * Server Runtime Abstraction
 *
 * Allows the dev server to work with different runtimes (Deno, Node.js).
 */

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

export interface ServerRuntime {
  /** Start HTTP server on given port */
  serve(port: number, handler: RequestHandler): ServerHandle;

  /** Read file as text */
  readTextFile(path: string): Promise<string>;

  /** Write file as text */
  writeTextFile(path: string, content: string): Promise<void>;

  /** Read file as binary */
  readFile(path: string): Promise<Uint8Array>;

  /** Get file stat, returns null if not found */
  stat(path: string): Promise<FileStat | null>;

  /** Read directory entries */
  readDir(path: string): AsyncIterable<DirEntry>;

  /** Serve a static file with proper headers */
  serveStaticFile(req: Request, path: string): Promise<Response>;

  /** Create directory (with optional recursive) */
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  /** Get environment variable */
  env(key: string): string | undefined;

  /** Get current working directory */
  cwd(): string;

  /** Watch directory for changes (optional - for dev mode) */
  watchDir?(path: string, callback: (event: WatchEvent) => void): WatchHandle;
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
