/**
 * Server API Types
 *
 * Interfaces for the emroute server.
 * Consumers use `createEmrouteServer()` to get a server that handles
 * SSR rendering, static file serving, and route matching.
 */

import type { RouteNode } from '../src/type/route-tree.type.ts';
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

// ── Server ─────────────────────────────────────────────────────────────

/**
 * Config for `createEmrouteServer()`.
 *
 * The server reads manifests from the Runtime and handles SSR rendering,
 * static file serving, and route matching.
 */
export interface EmrouteServerConfig {
  /** Pre-built route tree (alternative to reading from runtime) */
  routeTree?: RouteNode;

  /** Pre-built widget registry (alternative to reading from runtime) */
  widgets?: WidgetRegistry;

  /** SPA mode — controls which routers are constructed and what gets served */
  spa?: SpaMode;

  /** Base paths for SSR endpoints (default: { html: '/html', md: '/md' }) */
  basePath?: BasePath;

  /** Page title (fallback when no route provides one) */
  title?: string;

  /** Markdown renderer for server-side <mark-down> expansion */
  markdownRenderer?: MarkdownRenderer;

  /** Enrich every ComponentContext with app-level services. */
  extendContext?: ContextProvider;
}

/**
 * An emroute server instance.
 *
 * Handles SSR rendering, static file serving, and route matching.
 * Use `handleRequest(req)` to compose with your own request handling.
 */
export interface EmrouteServer {
  /**
   * Handle an HTTP request for SSR routes and bare paths.
   * Returns `null` for unmatched file requests — consumer handles 404.
   */
  handleRequest(req: Request): Promise<Response | null>;

  /** The SSR HTML router (null in 'only' mode — no server rendering). */
  readonly htmlRouter: SsrHtmlRouter | null;

  /** The SSR Markdown router (null in 'only' mode). */
  readonly mdRouter: SsrMdRouter | null;

  /** The resolved route tree. */
  readonly routeTree: RouteNode;

  /** Discovered widget entries. */
  readonly widgetEntries: WidgetManifestEntry[];

  /** The resolved HTML shell. */
  readonly shell: string;
}
