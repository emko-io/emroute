/// <reference lib="deno.ns" />

/**
 * Deno File System Implementation
 */

import type { DirEntry, FileSystem } from './fs.type.ts';
import { FileSystemError } from './fs.type.ts';

export const denoFs: FileSystem = {
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
        throw new FileSystemError(`Directory not found: ${path}`, 'NOT_FOUND');
      }
      if (error instanceof Deno.errors.PermissionDenied) {
        throw new FileSystemError(`Permission denied: ${path}`, 'PERMISSION_DENIED');
      }
      throw error;
    }
  },

  async writeTextFile(path: string, content: string): Promise<void> {
    try {
      await Deno.writeTextFile(path, content);
    } catch (error) {
      if (error instanceof Deno.errors.PermissionDenied) {
        throw new FileSystemError(`Permission denied: ${path}`, 'PERMISSION_DENIED');
      }
      throw error;
    }
  },

  async exists(path: string): Promise<boolean> {
    try {
      await Deno.stat(path);
      return true;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return false;
      }
      throw error;
    }
  },
};
