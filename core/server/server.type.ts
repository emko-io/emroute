/**
 * Server Types
 *
 * Types and conventions for the emroute server layer.
 */

import type { RouteNode } from '../type/route-tree.type.ts';
import type { MarkdownRenderer } from '../type/markdown.type.ts';
import type { SpaMode } from '../type/widget.type.ts';
import type { ContextProvider } from '../type/component.type.ts';
import type { WidgetRegistry } from '../widget/widget.registry.ts';
import type { SsrHtmlRenderer } from '../renderer/html.renderer.ts';
import type { SsrMdRenderer } from '../renderer/md.renderer.ts';

/** Base paths for the three rendering endpoints. */
export interface BasePath {
  html: string;
  md: string;
  app: string;
}

export const DEFAULT_BASE_PATH: BasePath = { html: '/html', md: '/md', app: '/app' };

/** Well-known manifest paths (convention between Runtime and Server). */
export const ROUTES_MANIFEST_PATH = '/routes.manifest.json';
export const WIDGETS_MANIFEST_PATH = '/widgets.manifest.json';
export const ELEMENTS_MANIFEST_PATH = '/elements.manifest.json';

/** Config for `createEmrouteServer()`. */
export interface EmrouteServerConfig {
  routeTree?: RouteNode;
  widgets?: WidgetRegistry;
  spa?: SpaMode;
  basePath?: BasePath;
  title?: string;
  markdownRenderer?: MarkdownRenderer;
  extendContext?: ContextProvider;
  moduleLoaders?: Record<string, () => Promise<unknown>>;
}

/** An emroute server instance. */
export interface EmrouteServer {
  handleRequest(req: Request): Promise<Response | null>;
  readonly htmlRenderer: SsrHtmlRenderer | null;
  readonly mdRenderer: SsrMdRenderer | null;
  readonly shell: string;
}
