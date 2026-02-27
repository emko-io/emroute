import type { RouteNode, RouteFiles } from '../src/type/route-tree.type.ts';
import { resolveTargetNode } from '../src/route/route-tree.util.ts';
import type { WidgetManifestEntry } from '../src/type/widget.type.ts';
import type { ElementManifestEntry } from '../src/type/element.type.ts';

export const CONTENT_TYPES: Map<string, string> = new Map<string, string>([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.mjs', 'application/javascript; charset=utf-8'],
  ['.ts', 'text/typescript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/plain; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
]);

export type FetchParams = Parameters<typeof fetch>;
export type FetchReturn = ReturnType<typeof fetch>;

export const DEFAULT_ROUTES_DIR = '/routes';
export const DEFAULT_WIDGETS_DIR = '/widgets';
export const DEFAULT_ELEMENTS_DIR = '/elements';
export const ROUTES_MANIFEST_PATH = '/routes.manifest.json';
export const WIDGETS_MANIFEST_PATH = '/widgets.manifest.json';
export const ELEMENTS_MANIFEST_PATH = '/elements.manifest.json';

export interface RuntimeConfig {
  routesDir?: string;
  widgetsDir?: string;
  elementsDir?: string;
}

/**
 * Abstract resource provider. Speaks Request/Response (ADR-1).
 *
 * Three access patterns:
 * - `handle()` — raw passthrough, server forwards browser requests as-is.
 * - `query()` — read. Returns Response, or string when `{ as: "text" }`.
 * - `command()` — write (PUT by default, override with `{ method }` in options).
 *
 * Includes manifest resolution: when `query(ROUTES_MANIFEST_PATH)` or
 * `query(WIDGETS_MANIFEST_PATH)` returns 404, the runtime scans the
 * configured directories and caches the result.
 */
export abstract class Runtime {
  constructor(readonly config: RuntimeConfig = {}) {
    this.config = config;
  }
  /** Concrete runtimes implement this. Accepts the same args as `fetch()`. */
  abstract handle(resource: FetchParams[0], init?: FetchParams[1]): FetchReturn;

  /**
   * Read with `{ as: "text" }` — skip metadata, return contents only.
   * Semantically equivalent to `Accept: text/plain`; `as` exists for type safety.
   */
  abstract query(
    resource: FetchParams[0],
    options: FetchParams[1] & { as: 'text' },
  ): Promise<string>;
  /** Read — returns full Response with headers, status, body. */
  abstract query(
    resource: FetchParams[0],
    options?: FetchParams[1],
  ): FetchReturn;

  /** Write. Defaults to PUT; pass `{ method: "DELETE" }` etc. to override. */
  command(resource: FetchParams[0], options?: FetchParams[1]): FetchReturn {
    const path = typeof resource === 'string'
      ? resource
      : new URL(resource instanceof Request ? resource.url : resource.toString()).pathname;
    const result = this.handle(resource, { method: 'PUT', ...options });
    const routesDir = this.config.routesDir ?? DEFAULT_ROUTES_DIR;
    if (path.startsWith(routesDir + '/')) {
      return result.then(async (res) => {
        await this.mergeRouteIntoManifest(path, routesDir);
        return res;
      });
    }
    return result;
  }

  /**
   * Parse a single route file path and merge it into the stored manifest.
   * Avoids a full directory rescan — just reads the current manifest,
   * inserts the new entry, and writes it back.
   */
  private async mergeRouteIntoManifest(
    filePath: string,
    routesDir: string,
  ): Promise<void> {
    const relativePath = filePath.slice(routesDir.length + 1);
    const parts = relativePath.split('/');
    const filename = parts[parts.length - 1];
    const dirSegments = parts.slice(0, -1);

    const match = filename.match(/^(.+?)\.(page|error|redirect)\.(ts|js|html|md|css)$/);
    if (!match) return;

    const [, name, kind, ext] = match;

    // Read current manifest (or start fresh)
    const response = await this.handle(ROUTES_MANIFEST_PATH);
    const tree: RouteNode = response.status === 404
      ? {}
      : await response.json();

    // Walk to the parent node
    let node = tree;
    for (const dir of dirSegments) {
      if (dir.startsWith('[') && dir.endsWith(']')) {
        const param = dir.slice(1, -1);
        node.dynamic ??= { param, child: {} };
        node = node.dynamic.child;
      } else {
        node.children ??= {};
        node.children[dir] ??= {};
        node = node.children[dir];
      }
    }

    // Place the file
    if (kind === 'error') {
      node.errorBoundary = filePath;
    } else {
      const target = resolveTargetNode(node, name, dirSegments.length === 0);
      if (kind === 'redirect') {
        target.redirect = filePath;
      } else {
        target.files ??= {};
        target.files[ext as keyof RouteFiles] = filePath;
      }
    }

    // Write updated manifest back
    this.routesManifestCache = null;
    await this.handle(ROUTES_MANIFEST_PATH, {
      method: 'PUT',
      body: JSON.stringify(tree),
    });
  }

  /**
   * Dynamically import a module from this runtime's storage.
   * Used by the server for SSR imports of `.page.ts` and `.widget.ts` files.
   */
  loadModule(_path: string): Promise<unknown> {
    throw new Error(`loadModule not implemented for ${this.constructor.name}`);
  }

  /**
   * Transpile TypeScript source to JavaScript.
   * Used by the build step to produce browser-loadable .js modules.
   */
  transpile(_source: string): Promise<string> {
    throw new Error(`transpile not implemented for ${this.constructor.name}`);
  }

  // ── Manifest resolution ─────────────────────────────────────────────

  private routesManifestCache: Response | null = null;
  private widgetsManifestCache: Response | null = null;
  private elementsManifestCache: Response | null = null;

  /** Clear cached manifests so the next query triggers a fresh scan. */
  invalidateManifests(): void {
    this.routesManifestCache = null;
    this.widgetsManifestCache = null;
    this.elementsManifestCache = null;
  }

  /**
   * Resolve the routes manifest. Called when the concrete runtime returns
   * 404 for ROUTES_MANIFEST_PATH. Scans `config.routesDir` (or default).
   */
  async resolveRoutesManifest(): Promise<Response> {
    if (this.routesManifestCache) return this.routesManifestCache.clone();

    const routesDir = this.config.routesDir ?? DEFAULT_ROUTES_DIR;

    // Check if directory exists by querying it
    const dirResponse = await this.query(routesDir + '/');
    if (dirResponse.status === 404) {
      return new Response('Not Found', { status: 404 });
    }

    const tree = await this.scanRoutes(routesDir);

    this.routesManifestCache = Response.json(tree);
    return this.routesManifestCache.clone();
  }

  /**
   * Resolve the widgets manifest. Called when the concrete runtime returns
   * 404 for WIDGETS_MANIFEST_PATH. Scans `config.widgetsDir` (or default).
   */
  async resolveWidgetsManifest(): Promise<Response> {
    if (this.widgetsManifestCache) return this.widgetsManifestCache.clone();

    const widgetsDir = this.config.widgetsDir ?? DEFAULT_WIDGETS_DIR;

    const dirResponse = await this.query(widgetsDir + '/');
    if (dirResponse.status === 404) {
      return new Response('Not Found', { status: 404 });
    }

    const entries = await this.scanWidgets(widgetsDir, widgetsDir.replace(/^\//, ''));
    this.widgetsManifestCache = Response.json(entries);
    return this.widgetsManifestCache.clone();
  }

  /**
   * Resolve the elements manifest. Called when the concrete runtime returns
   * 404 for ELEMENTS_MANIFEST_PATH. Scans `config.elementsDir` (or default).
   */
  async resolveElementsManifest(): Promise<Response> {
    if (this.elementsManifestCache) return this.elementsManifestCache.clone();

    const elementsDir = this.config.elementsDir ?? DEFAULT_ELEMENTS_DIR;

    const dirResponse = await this.query(elementsDir + '/');
    if (dirResponse.status === 404) {
      return new Response('Not Found', { status: 404 });
    }

    const entries = await this.scanElements(elementsDir, elementsDir.replace(/^\//, ''));
    this.elementsManifestCache = Response.json(entries);
    return this.elementsManifestCache.clone();
  }

  // ── Scanning ──────────────────────────────────────────────────────────

  protected async *walkDirectory(dir: string): AsyncGenerator<string> {
    const trailingDir = dir.endsWith('/') ? dir : dir + '/';
    const response = await this.query(trailingDir);
    const entries: string[] = await response.json();

    for (const entry of entries) {
      const path = `${trailingDir}${entry}`;
      if (entry.endsWith('/')) {
        yield* this.walkDirectory(path);
      } else {
        yield path;
      }
    }
  }

  /**
   * Scan a routes directory and build a RouteNode tree.
   * The filesystem structure maps directly to the tree — no intermediate array.
   */
  protected async scanRoutes(routesDir: string): Promise<RouteNode> {
    const root: RouteNode = {};

    const allFiles: string[] = [];
    for await (const file of this.walkDirectory(routesDir)) {
      allFiles.push(file);
    }

    for (const filePath of allFiles) {
      const relativePath = filePath.replace(`${routesDir}/`, '');
      const parts = relativePath.split('/');
      const filename = parts[parts.length - 1];
      const dirSegments = parts.slice(0, -1);

      // Parse filename: name.kind.ext (e.g. "about.page.ts", "[id].page.html", "index.error.ts")
      const match = filename.match(/^(.+?)\.(page|error|redirect)\.(ts|js|html|md|css)$/);
      if (!match) continue;

      const [, name, kind, ext] = match;

      // Walk directory segments to reach the parent node
      let node = root;
      for (const dir of dirSegments) {
        if (dir.startsWith('[') && dir.endsWith(']')) {
          const param = dir.slice(1, -1);
          node.dynamic ??= { param, child: {} };
          node = node.dynamic.child;
        } else {
          node.children ??= {};
          node.children[dir] ??= {};
          node = node.children[dir];
        }
      }

      // Place the file on the correct node
      if (kind === 'error') {
        // Error boundary scopes to the directory it's in.
        // Root index.error.ts → root.errorBoundary (global handler).
        // projects/projects.error.ts → projects node errorBoundary.
        node.errorBoundary = filePath;
        continue;
      }

      // For page and redirect files, the name determines the final node
      const target = resolveTargetNode(node, name, dirSegments.length === 0);

      if (kind === 'redirect') {
        target.redirect = filePath;
      } else {
        // kind === 'page'
        target.files ??= {};
        target.files[ext as keyof RouteFiles] = filePath;
      }
    }

    return root;
  }

  protected async scanWidgets(
    widgetsDir: string,
    pathPrefix?: string,
  ): Promise<WidgetManifestEntry[]> {
    const COMPANION_EXTENSIONS = ['html', 'md', 'css'] as const;
    const entries: WidgetManifestEntry[] = [];

    const trailingDir = widgetsDir.endsWith('/') ? widgetsDir : widgetsDir + '/';
    const response = await this.query(trailingDir);
    const listing: string[] = await response.json();

    for (const item of listing) {
      if (!item.endsWith('/')) continue;

      const name = item.slice(0, -1);

      // Try .widget.ts first, then .widget.js
      let moduleFile = `${name}.widget.ts`;
      let modulePath = `${trailingDir}${name}/${moduleFile}`;
      if ((await this.query(modulePath)).status === 404) {
        moduleFile = `${name}.widget.js`;
        modulePath = `${trailingDir}${name}/${moduleFile}`;
        if ((await this.query(modulePath)).status === 404) continue;
      }

      const prefix = pathPrefix ? `${pathPrefix}/` : '';
      const entry: WidgetManifestEntry = {
        name,
        modulePath: `${prefix}${name}/${moduleFile}`,
        tagName: `widget-${name}`,
      };

      const files: { html?: string; md?: string; css?: string } = {};
      let hasFiles = false;
      for (const ext of COMPANION_EXTENSIONS) {
        const companionFile = `${name}.widget.${ext}`;
        const companionPath = `${trailingDir}${name}/${companionFile}`;
        if ((await this.query(companionPath)).status !== 404) {
          files[ext] = `${prefix}${name}/${companionFile}`;
          hasFiles = true;
        }
      }

      if (hasFiles) entry.files = files;
      entries.push(entry);
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
  }

  protected async scanElements(
    elementsDir: string,
    pathPrefix?: string,
  ): Promise<ElementManifestEntry[]> {
    const entries: ElementManifestEntry[] = [];

    const trailingDir = elementsDir.endsWith('/') ? elementsDir : elementsDir + '/';
    const response = await this.query(trailingDir);
    const listing: string[] = await response.json();

    for (const item of listing) {
      if (!item.endsWith('/')) continue;

      const name = item.slice(0, -1);

      // Custom element names must contain a hyphen (web spec requirement)
      if (!name.includes('-')) {
        console.warn(`[emroute] Skipping element "${name}": custom element names must contain a hyphen (e.g. "my-element")`);
        continue;
      }

      // Try .element.ts first, then .element.js
      let moduleFile = `${name}.element.ts`;
      let modulePath = `${trailingDir}${name}/${moduleFile}`;
      if ((await this.query(modulePath)).status === 404) {
        moduleFile = `${name}.element.js`;
        modulePath = `${trailingDir}${name}/${moduleFile}`;
        if ((await this.query(modulePath)).status === 404) continue;
      }

      const prefix = pathPrefix ? `${pathPrefix}/` : '';
      entries.push({
        name,
        modulePath: `${prefix}${name}/${moduleFile}`,
        tagName: name,
      });
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
  }
}
