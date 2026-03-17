import type { RouteNode, RouteFiles } from '../core/type/route-tree.type.ts';
import { resolveTargetNode } from '../core/util/route-tree.util.ts';
import type { WidgetManifestEntry } from '../core/type/widget.type.ts';
import type { ElementManifestEntry } from '../core/type/element.type.ts';
import { escapeTemplateLiteral } from '../core/util/js.util.ts';

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
import {
  ROUTES_MANIFEST_PATH,
  WIDGETS_MANIFEST_PATH,
  ELEMENTS_MANIFEST_PATH,
} from '../core/runtime/abstract.runtime.ts';
export { ROUTES_MANIFEST_PATH, WIDGETS_MANIFEST_PATH, ELEMENTS_MANIFEST_PATH };

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

  /** Write or delete. Defaults to PUT; pass `{ method: "DELETE" }` to remove. */
  command(resource: FetchParams[0], options?: FetchParams[1]): FetchReturn {
    const path = typeof resource === 'string'
      ? resource
      : new URL(resource instanceof Request ? resource.url : resource.toString()).pathname;
    const method = options?.method ?? 'PUT';
    const isDelete = method === 'DELETE';
    const result = this.handle(resource, { method, ...options });
    const routesDir = this.config.routesDir ?? DEFAULT_ROUTES_DIR;
    const widgetsDir = this.config.widgetsDir ?? DEFAULT_WIDGETS_DIR;
    const elementsDir = this.config.elementsDir ?? DEFAULT_ELEMENTS_DIR;
    if (path.startsWith(routesDir + '/')) {
      return result.then(async (res) => {
        if (isDelete) {
          await this.pruneRouteFromManifest(path, routesDir);
        } else {
          await this.mergeRouteIntoManifest(path, routesDir);
          await this.retranspileIfNeeded(path, routesDir, 'route');
        }
        return res;
      });
    }
    if (path.startsWith(widgetsDir + '/')) {
      return result.then(async (res) => {
        if (isDelete) {
          await this.pruneWidgetFromManifest(path, widgetsDir);
        } else {
          await this.mergeWidgetIntoManifest(path, widgetsDir);
          await this.retranspileIfNeeded(path, widgetsDir, 'widget');
        }
        return res;
      });
    }
    if (path.startsWith(elementsDir + '/')) {
      return result.then(async (res) => {
        if (isDelete) {
          await this.pruneElementFromManifest(path, elementsDir);
        } else {
          await this.mergeElementIntoManifest(path, elementsDir);
          await this.retranspileIfNeeded(path, elementsDir, 'element');
        }
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
    const filename = parts[parts.length - 1]!;
    const dirSegments = parts.slice(0, -1);

    const match = filename.match(/^(.+?)\.(page|error|redirect)\.(ts|js|html|md|css)$/);
    if (!match) return;

    const name = match[1]!;
    const kind = match[2]!;
    const ext = match[3]!;

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
        node = node.children[dir]!;
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
   * Remove a route entry from the stored manifest when a file is deleted.
   * Walks the tree to find the node, clears the relevant field, then
   * prunes empty ancestor nodes.
   */
  private async pruneRouteFromManifest(
    filePath: string,
    routesDir: string,
  ): Promise<void> {
    const relativePath = filePath.slice(routesDir.length + 1);
    const parts = relativePath.split('/');
    const filename = parts[parts.length - 1]!;
    const dirSegments = parts.slice(0, -1);

    const match = filename.match(/^(.+?)\.(page|error|redirect)\.(ts|js|html|md|css)$/);
    if (!match) return;

    const name = match[1]!;
    const kind = match[2]!;
    const ext = match[3]! as keyof RouteFiles;

    const response = await this.handle(ROUTES_MANIFEST_PATH);
    if (response.status === 404) return;
    const tree: RouteNode = await response.json();

    // Walk to the parent node, tracking path for pruning
    const ancestors: { node: RouteNode; key: string; via: 'children' | 'dynamic' }[] = [];
    let node = tree;
    for (const dir of dirSegments) {
      if (dir.startsWith('[') && dir.endsWith(']')) {
        if (!node.dynamic) return;
        ancestors.push({ node, key: dir, via: 'dynamic' });
        node = node.dynamic.child;
      } else {
        if (!node.children?.[dir]) return;
        ancestors.push({ node, key: dir, via: 'children' });
        node = node.children[dir]!;
      }
    }

    // Clear the field
    if (kind === 'error') {
      if (node.errorBoundary === filePath) delete node.errorBoundary;
    } else {
      const isRoot = dirSegments.length === 0;
      const target = this.findTargetNode(node, name, isRoot);
      if (!target) return;

      if (kind === 'redirect') {
        if (target.redirect === filePath) delete target.redirect;
      } else {
        if (target.files?.[ext] === filePath) {
          delete target.files[ext];
          if (Object.keys(target.files).length === 0) delete target.files;
        }
      }

      // If target is a child node and now empty, remove it
      if (target !== node && this.isEmptyNode(target)) {
        if (name === 'index' && !isRoot) {
          delete node.wildcard;
        } else if (name.startsWith('[') && name.endsWith(']')) {
          delete node.dynamic;
        } else if (node.children) {
          delete node.children[name];
          if (Object.keys(node.children).length === 0) delete node.children;
        }
      }
    }

    // Prune empty ancestors bottom-up
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const { node: parent, key, via } = ancestors[i]!;
      const child = via === 'dynamic' ? parent.dynamic?.child : parent.children?.[key];
      if (child && this.isEmptyNode(child)) {
        if (via === 'dynamic') {
          delete parent.dynamic;
        } else if (parent.children) {
          delete parent.children[key];
          if (Object.keys(parent.children).length === 0) delete parent.children;
        }
      }
    }

    this.routesManifestCache = null;
    await this.handle(ROUTES_MANIFEST_PATH, {
      method: 'PUT',
      body: JSON.stringify(tree),
    });
  }

  /** Find a target node without creating it (read-only counterpart to resolveTargetNode). */
  private findTargetNode(node: RouteNode, name: string, isRoot: boolean): RouteNode | null {
    if (name === 'index') {
      return isRoot ? node : (node.wildcard?.child ?? null);
    }
    if (name.startsWith('[') && name.endsWith(']')) {
      return node.dynamic?.child ?? null;
    }
    return node.children?.[name] ?? null;
  }

  private isEmptyNode(node: RouteNode): boolean {
    return (
      !node.files &&
      !node.errorBoundary &&
      !node.redirect &&
      !node.children &&
      !node.dynamic &&
      !node.wildcard
    );
  }

  /**
   * Remove a widget entry from the stored manifest when a file is deleted.
   */
  private async pruneWidgetFromManifest(
    filePath: string,
    widgetsDir: string,
  ): Promise<void> {
    const relativePath = filePath.slice(widgetsDir.length + 1);
    const parts = relativePath.split('/');
    if (parts.length !== 2) return;

    const [dirName, filename] = parts as [string, string];
    const match = filename.match(/^(.+?)\.widget\.(ts|js|html|md|css)$/);
    if (!match) return;

    const name = match[1]!;
    const ext = match[2]!;
    if (name !== dirName) return;

    const response = await this.handle(WIDGETS_MANIFEST_PATH);
    if (response.status === 404) return;
    const entries: WidgetManifestEntry[] = await response.json();

    if (ext === 'ts' || ext === 'js') {
      // Module deleted → remove entire entry
      const idx = entries.findIndex((e) => e.name === name);
      if (idx === -1) return;
      entries.splice(idx, 1);
    } else {
      // Companion deleted → remove from files
      const entry = entries.find((e) => e.name === name);
      if (!entry?.files) return;
      delete (entry.files as Record<string, string>)[ext];
      if (Object.keys(entry.files).length === 0) delete entry.files;
    }

    this.widgetsManifestCache = null;
    await this.handle(WIDGETS_MANIFEST_PATH, {
      method: 'PUT',
      body: JSON.stringify(entries),
    });
  }

  /**
   * Remove an element entry from the stored manifest when a file is deleted.
   */
  private async pruneElementFromManifest(
    filePath: string,
    elementsDir: string,
  ): Promise<void> {
    const relativePath = filePath.slice(elementsDir.length + 1);
    const parts = relativePath.split('/');
    if (parts.length !== 2) return;

    const [dirName, filename] = parts as [string, string];
    const match = filename.match(/^(.+?)\.element\.(ts|js)$/);
    if (!match) return;

    const name = match[1]!;
    if (name !== dirName) return;

    const response = await this.handle(ELEMENTS_MANIFEST_PATH);
    if (response.status === 404) return;
    const entries: ElementManifestEntry[] = await response.json();

    const idx = entries.findIndex((e) => e.name === name);
    if (idx === -1) return;
    entries.splice(idx, 1);

    this.elementsManifestCache = null;
    await this.handle(ELEMENTS_MANIFEST_PATH, {
      method: 'PUT',
      body: JSON.stringify(entries),
    });
  }

  /**
   * After a source or companion file is written, check if a built `.js`
   * artifact exists for that module. If so, re-transpile the `.ts` source
   * with companions inlined and write the `.js` back.
   *
   * Best-effort: silently skips if `transpile()` is not implemented.
   */
  private async retranspileIfNeeded(
    filePath: string,
    dir: string,
    kind: 'route' | 'widget' | 'element',
  ): Promise<void> {
    // Only act on source/companion files, not the .js output itself
    if (filePath.endsWith('.js')) return;

    const relativePath = filePath.slice(dir.length + 1);
    const parts = relativePath.split('/');
    const filename = parts[parts.length - 1]!;

    // Determine the module base name and the .js output path
    let jsPath: string;
    if (kind === 'route') {
      const match = filename.match(/^(.+?)\.(page)\.(ts|html|md|css)$/);
      if (!match) return;
      const name = match[1]!;
      jsPath = `${dir}/${parts.slice(0, -1).join('/')}${parts.length > 1 ? '/' : ''}${name}.page.js`;
    } else if (kind === 'widget') {
      const match = filename.match(/^(.+?)\.(widget)\.(ts|html|md|css)$/);
      if (!match) return;
      const name = match[1]!;
      jsPath = `${dir}/${name}/${name}.widget.js`;
    } else {
      const match = filename.match(/^(.+?)\.(element)\.ts$/);
      if (!match) return;
      const name = match[1]!;
      jsPath = `${dir}/${name}/${name}.element.js`;
    }

    // Check if the .js artifact exists
    const jsResponse = await this.handle(jsPath);
    if (jsResponse.status === 404) return;

    // Read the .ts source
    const tsPath = jsPath.replace(/\.js$/, '.ts');
    let tsSource: string;
    try {
      tsSource = await this.query(tsPath, { as: 'text' });
    } catch {
      return; // .ts doesn't exist (maybe .js was hand-written)
    }

    // Transpile and inline companions
    let jsCode: string;
    try {
      jsCode = await this.transpileModule(tsPath, tsSource);
    } catch {
      return; // transpile not implemented — skip silently
    }

    await this.handle(jsPath, { method: 'PUT', body: jsCode });
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
   */
  transpile(_source: string): Promise<string> {
    throw new Error(`transpile not implemented for ${this.constructor.name}`);
  }

  /**
   * Transpile a .ts module and inline companion files (.html, .md, .css)
   * as `export const __files = { ... }`.
   *
   * This is the single implementation of the transpile+merge operation.
   * Used by concrete runtimes in their serving path (e.g. BunFsRuntime
   * intercepts .ts in read()) and by retranspileIfNeeded() to keep
   * pre-built .js artifacts in sync after command() writes.
   *
   * @param path Virtual path (e.g. "/widgets/nav.widget.ts")
   * @param source Raw TypeScript source
   */
  protected async transpileModule(path: string, source: string): Promise<string> {
    let js = await this.transpile(source);

    const basePath = path.replace(/\.ts$/, '');
    const companions = ['html', 'md', 'css'] as const;
    const entries: string[] = [];

    for (const ext of companions) {
      try {
        const content = await this.query(basePath + '.' + ext, { as: 'text' });
        entries.push(`  ${ext}: \`${escapeTemplateLiteral(content)}\``);
      } catch {
        // companion doesn't exist
      }
    }

    if (entries.length > 0) {
      js += `\nexport const __files = {\n${entries.join(',\n')}\n};\n`;
    }

    return js;
  }

  /**
   * Parse a widget file path and merge it into the stored manifest.
   * Reads the current manifest, upserts the entry, writes it back.
   */
  private async mergeWidgetIntoManifest(
    filePath: string,
    widgetsDir: string,
  ): Promise<void> {
    const relativePath = filePath.slice(widgetsDir.length + 1);
    const parts = relativePath.split('/');
    if (parts.length !== 2) return; // must be widgets/{name}/{file}

    const [dirName, filename] = parts as [string, string];

    // Only act on .widget.{ts,js,html,md,css} files
    const match = filename.match(/^(.+?)\.widget\.(ts|js|html|md|css)$/);
    if (!match) return;

    const name = match[1]!;
    const ext = match[2]!;
    if (name !== dirName) return; // filename must match directory

    const response = await this.handle(WIDGETS_MANIFEST_PATH);
    const entries: WidgetManifestEntry[] = response.status === 404
      ? []
      : await response.json();

    const prefix = widgetsDir.replace(/^\//, '');

    if (ext === 'ts' || ext === 'js') {
      // Module file — upsert the entry
      let entry = entries.find((e) => e.name === name);
      if (!entry) {
        entry = {
          name,
          modulePath: `${prefix}/${name}/${filename}`,
          tagName: `widget-${name}`,
        };
        entries.push(entry);
        entries.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        entry.modulePath = `${prefix}/${name}/${filename}`;
      }
    } else {
      // Companion file — update files on existing entry
      const entry = entries.find((e) => e.name === name);
      if (!entry) return; // no module yet, companion alone is not enough
      entry.files ??= {};
      (entry.files as Record<string, string>)[ext] = `${prefix}/${name}/${filename}`;
    }

    this.widgetsManifestCache = null;
    await this.handle(WIDGETS_MANIFEST_PATH, {
      method: 'PUT',
      body: JSON.stringify(entries),
    });
  }

  /**
   * Parse an element file path and merge it into the stored manifest.
   * Reads the current manifest, upserts the entry, writes it back.
   */
  private async mergeElementIntoManifest(
    filePath: string,
    elementsDir: string,
  ): Promise<void> {
    const relativePath = filePath.slice(elementsDir.length + 1);
    const parts = relativePath.split('/');
    if (parts.length !== 2) return;

    const [dirName, filename] = parts as [string, string];

    const match = filename.match(/^(.+?)\.element\.(ts|js)$/);
    if (!match) return;

    const name = match[1]!;
    if (name !== dirName) return;

    // Custom element names must contain a hyphen
    if (!name.includes('-')) return;

    const response = await this.handle(ELEMENTS_MANIFEST_PATH);
    const entries: ElementManifestEntry[] = response.status === 404
      ? []
      : await response.json();

    const prefix = elementsDir.replace(/^\//, '');
    let entry = entries.find((e) => e.name === name);
    if (!entry) {
      entry = {
        name,
        modulePath: `${prefix}/${name}/${filename}`,
        tagName: name,
      };
      entries.push(entry);
      entries.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      entry.modulePath = `${prefix}/${name}/${filename}`;
    }

    this.elementsManifestCache = null;
    await this.handle(ELEMENTS_MANIFEST_PATH, {
      method: 'PUT',
      body: JSON.stringify(entries),
    });
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
    const entries = dirResponse.status === 404
      ? []
      : await this.scanWidgets(widgetsDir, widgetsDir.replace(/^\//, ''));
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
    const entries = dirResponse.status === 404
      ? []
      : await this.scanElements(elementsDir, elementsDir.replace(/^\//, ''));
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
      const filename = parts[parts.length - 1]!;
      const dirSegments = parts.slice(0, -1);

      // Parse filename: name.kind.ext (e.g. "about.page.ts", "[id].page.html", "index.error.ts")
      const match = filename.match(/^(.+?)\.(page|error|redirect)\.(ts|js|html|md|css)$/);
      if (!match) continue;

      const name = match[1]!;
      const kind = match[2]!;
      const ext = match[3]! as keyof RouteFiles;

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
          node = node.children[dir]!;
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
      const target = resolveTargetNode(node, name!, dirSegments.length === 0);

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
      const companionResults = await Promise.all(
        COMPANION_EXTENSIONS.map(async (ext) => {
          const companionFile = `${name}.widget.${ext}`;
          const companionPath = `${trailingDir}${name}/${companionFile}`;
          const exists = (await this.query(companionPath)).status !== 404;
          return { ext, exists, path: `${prefix}${name}/${companionFile}` };
        }),
      );
      for (const { ext, exists, path } of companionResults) {
        if (exists) {
          files[ext] = path;
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
