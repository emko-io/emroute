/**
 * Router - Backwards Compatibility Layer
 *
 * Re-exports SPA HTML router as the default Router for backwards compatibility.
 * New code should import from specific renderer modules:
 * - spa/html.renderer.ts for SPA
 * - ssr/html.renderer.ts for SSR HTML
 * - ssr/md.renderer.ts for SSR Markdown
 */

export {
  createSpaHtmlRouter as createRouter,
  SpaHtmlRouter as Router,
} from '../renderer/spa/html.renderer.ts';
