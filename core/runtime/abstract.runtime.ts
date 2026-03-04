/**
 * Abstract Runtime
 *
 * Storage contract. Speaks Request/Response.
 * Concrete implementations decide how to store, cache, scan, and serve.
 *
 * Three access patterns:
 * - handle() — raw passthrough
 * - query()  — read (Response or string)
 * - command() — write/delete
 */

export type FetchParams = Parameters<typeof fetch>;
export type FetchReturn = ReturnType<typeof fetch>;

/** Well-known manifest paths (convention between Runtime and consumers). */
export const ROUTES_MANIFEST_PATH = '/routes.manifest.json';
export const WIDGETS_MANIFEST_PATH = '/widgets.manifest.json';
export const ELEMENTS_MANIFEST_PATH = '/elements.manifest.json';

export abstract class Runtime {
  /** Raw passthrough — same signature as fetch(). */
  abstract handle(resource: FetchParams[0], init?: FetchParams[1]): FetchReturn;

  /** Read. Returns Response, or string with { as: 'text' }. */
  abstract query(
    resource: FetchParams[0],
    options: FetchParams[1] & { as: 'text' },
  ): Promise<string>;
  abstract query(
    resource: FetchParams[0],
    options?: FetchParams[1],
  ): FetchReturn;

  /** Write (PUT) or delete (DELETE). */
  abstract command(resource: FetchParams[0], options?: FetchParams[1]): FetchReturn;

  /** Dynamically import a module from storage. */
  loadModule(_path: string): Promise<unknown> {
    throw new Error(`loadModule not implemented for ${this.constructor.name}`);
  }

  /** Transpile TypeScript to JavaScript. */
  transpile(_source: string): Promise<string> {
    throw new Error(`transpile not implemented for ${this.constructor.name}`);
  }
}
