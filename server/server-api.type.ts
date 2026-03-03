/**
 * Server API Types — re-exports from core/server.
 */
export type {
  BasePath,
  EmrouteServer,
  EmrouteServerConfig,
} from '../core/server/server.type.ts';

export {
  DEFAULT_BASE_PATH,
  ROUTES_MANIFEST_PATH,
  WIDGETS_MANIFEST_PATH,
  ELEMENTS_MANIFEST_PATH,
} from '../core/server/server.type.ts';

/** Result of rendering a URL through an SSR renderer. */
export interface SsrRenderResult {
  content: string;
  status: number;
  title?: string;
  redirect?: string;
}
