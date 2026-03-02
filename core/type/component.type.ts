/**
 * Component Types
 *
 * Types for the component system. Separate from route types.
 */

import type { RouteInfo } from './route.type.ts';

/** Shape of companion file contents (html, md, css). */
export type FileContents = { html?: string; md?: string; css?: string };

/** Context passed to components during rendering. */
export interface ComponentContext extends RouteInfo {
  /** @deprecated Use context.url.pathname */
  readonly pathname: string;
  /** @deprecated Use context.url.searchParams */
  readonly searchParams: URLSearchParams;
  readonly files?: Readonly<FileContents>;
  readonly signal?: AbortSignal;
  readonly isLeaf?: boolean;
}

/**
 * Enriches the base ComponentContext with app-level services.
 * Registered once at server creation; called for every context construction.
 */
export type ContextProvider = (base: ComponentContext) => ComponentContext;

/** Render context determines how components are rendered. */
export type RenderContext = 'markdown' | 'html' | 'spa';
