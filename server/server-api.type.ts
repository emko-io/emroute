/**
 * Server API Types
 *
 * Interfaces for the composable emroute server and build system.
 * Consumers use `createEmrouteServer()` to get a full-featured server
 * that handles SSR, static files, manifest generation, and route matching.
 *
 * See: issues/pending/server-api-bundling.feature.md
 */

import type { RoutesManifest } from '../src/type/route.type.ts';
import type { MarkdownRenderer } from '../src/type/markdown.type.ts';
import type { SpaMode, WidgetManifestEntry } from '../src/type/widget.type.ts';
import type { ContextProvider } from '../src/component/abstract.component.ts';
import type { BasePath } from '../src/route/route.core.ts';
import type { WidgetRegistry } from '../src/widget/widget.registry.ts';
import type { SsrHtmlRouter } from '../src/renderer/ssr/html.renderer.ts';
import type { SsrMdRouter } from '../src/renderer/ssr/md.renderer.ts';
// ── SSR Render Result ──────────────────────────────────────────────────

/** Result of rendering a URL through an SSR renderer. */
export interface SsrRenderResult {
  /** Rendered content (HTML or Markdown) */
  content: string;
  /** HTTP status code */
  status: number;
  /** Page title (from the leaf route's getTitle) */
  title?: string;
  /** Redirect target URL (for 301/302 responses) */
  redirect?: string;
}

// ── Bundler ────────────────────────────────────────────────────────────

/** Handle returned by `Bundler.watch()` to stop watching. */
export interface BundleWatchHandle {
  close(): void;
}

/** Options passed to a bundler for each bundle invocation. */
export interface BundleOptions {
  /** Target environment */
  platform: 'browser';
  /** Enable minification (default: false) */
  minify?: boolean;
  /** Enable obfuscation / mangling (default: false) */
  obfuscate?: boolean;
  /** Generate source maps (default: true in dev, false in prod) */
  sourcemap?: boolean;
  /** External modules — leave as bare imports, don't bundle them */
  external?: string[];
  /** Working directory for the bundler subprocess */
  cwd?: string;
}

/**
 * Pluggable bundler interface.
 *
 * A bundler takes an entry point and produces a JS output file.
 * emroute ships a default bundler based on `deno bundle`; consumers
 * can swap in esbuild, Rollup, Vite, etc.
 */
export interface Bundler {
  /** Bundle a single entry point to an output file. */
  bundle(entry: string, output: string, options: BundleOptions): Promise<void>;

  /**
   * Start watching an entry point and rebundle on changes.
   * Optional — if not implemented, the dev server falls back to
   * rebuild-on-change via file watcher.
   */
  watch?(entry: string, output: string, options: BundleOptions): Promise<BundleWatchHandle>;
}

// ── Server ─────────────────────────────────────────────────────────────

/**
 * Config for `createEmrouteServer()`.
 *
 * The server owns SSR rendering, manifest generation, static file serving,
 * and route matching. Call `serve(port)` for a standalone server, or use
 * `handleRequest(req)` to compose with your own request handling.
 */
export interface EmrouteServerConfig {
  /** Routes directory (Runtime-relative). Triggers auto-discovery. */
  routesDir?: string;

  /** Pre-built manifest (alternative to routesDir) */
  routesManifest?: RoutesManifest;

  /** Widgets directory (Runtime-relative). Triggers auto-discovery. */
  widgetsDir?: string;

  /** Pre-built widget registry (alternative to widgetsDir) */
  widgets?: WidgetRegistry;

  /** SPA mode — controls which routers are constructed and what gets served */
  spa?: SpaMode;

  /** Base paths for SSR endpoints (default: { html: '/html', md: '/md' }) */
  basePath?: BasePath;

  /**
   * Dynamic module loader for consumer `.page.ts` and `.widget.ts` files.
   *
   * Required for SSR when emroute is consumed from JSR — JSR code cannot
   * `import()` non-JSR URLs. The consumer provides this callback from their
   * own (non-JSR) code, bridging Runtime content to ES module imports.
   *
   * ```ts
   * moduleLoader: (path) => import(`http://localhost:${port}${path}`)
   * ```
   */
  moduleLoader?: (path: string) => Promise<unknown>;

  /**
   * SPA entry point (Runtime-relative, e.g. 'main.ts' or '_main.g.ts').
   * When set and spa !== 'none', a `<script type="module">` tag is injected
   * into the HTML shell. The src points at the `.js` equivalent path.
   */
  entryPoint?: string;

  /** HTML shell (string or path to index.html) */
  shell?: string | { path: string };

  /** Page title (fallback when no route provides one) */
  title?: string;

  /** Markdown renderer for server-side <mark-down> expansion */
  markdownRenderer?: MarkdownRenderer;

  /** Enrich every ComponentContext with app-level services. */
  extendContext?: ContextProvider;
}

/**
 * A full-featured emroute server.
 *
 * Owns SSR rendering, manifest generation, static file serving, and route
 * matching. Use `serve(port)` for standalone operation, or `handleRequest`
 * to compose with your own request handling.
 */
export interface EmrouteServer {
  /**
   * Handle an HTTP request for SSR routes and bare paths.
   * Returns `null` for unmatched file requests — consumer handles 404.
   */
  handleRequest(req: Request): Promise<Response | null>;

  /** Rebuild manifests, SSR routers, and rewrite manifest files. */
  rebuild(): Promise<void>;

  /** The SSR HTML router (null in 'only' mode — no server rendering). */
  readonly htmlRouter: SsrHtmlRouter | null;

  /** The SSR Markdown router (null in 'only' mode). */
  readonly mdRouter: SsrMdRouter | null;

  /** The resolved routes manifest. */
  readonly manifest: RoutesManifest;

  /** Discovered widget entries (for manifest code generation). */
  readonly widgetEntries: WidgetManifestEntry[];

  /** The resolved HTML shell. */
  readonly shell: string;
}

// ── Build ──────────────────────────────────────────────────────────────

/** Config for the `build()` function. */
export interface BuildConfig {
  /** Routes directory (Runtime-relative) */
  routesDir: string;

  /** Widgets directory (relative to appRoot) */
  widgetsDir?: string;

  /** Output directory (default: appRoot) */
  outDir?: string;

  /** SPA mode — controls which bundles are produced */
  spa?: SpaMode;

  /** Base paths for SSR endpoints */
  basePath?: BasePath;

  /** Entry point for app bundle (auto-generated if omitted) */
  entryPoint?: string;

  /** Bundler implementation (default: deno bundle) */
  bundler?: Bundler;

  /** Enable minification (default: false in dev, true in prod) */
  minify?: boolean;

  /** Enable obfuscation (default: false) */
  obfuscate?: boolean;

  /** Generate source maps (default: true in dev, false in prod) */
  sourcemap?: boolean;

  /**
   * Core bundle strategy:
   * - 'build': bundle emroute core locally (default)
   * - 'cdn': use CDN-hosted pre-built emroute.min.js
   * - URL string: use a specific CDN URL
   */
  coreBundle?: 'build' | 'cdn' | string;

  /** Pre-render routes to static HTML (SSG) */
  prerender?: boolean;
}

/** Result of a build. */
export interface BuildResult {
  /** Path to core framework bundle (null in 'none' mode or when using CDN) */
  coreBundle: string | null;

  /** CDN URL for core bundle (when coreBundle is 'cdn' or a URL) */
  coreBundleCdn: string | null;

  /** Path to app bundle (null in 'none' mode) */
  appBundle: string | null;

  /** Path to HTML shell */
  shell: string;

  /** Pre-rendered HTML files, keyed by route path (when prerender is true) */
  prerendered?: Map<string, string>;

  /** Paths to generated manifest files */
  manifests: {
    routes: string;
    widgets?: string;
  };
}
