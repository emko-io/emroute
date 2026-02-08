/**
 * File System Abstraction
 *
 * Allows the route generator to work with different runtimes.
 */

export interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

export interface FileSystem {
  /** Read directory entries */
  readDir(path: string): AsyncIterable<DirEntry>;

  /** Write text to file */
  writeTextFile(path: string, content: string): Promise<void>;

  /** Check if path exists */
  exists(path: string): Promise<boolean>;
}

export class FileSystemError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'PERMISSION_DENIED' | 'UNKNOWN',
  ) {
    super(message);
    this.name = 'FileSystemError';
  }
}
