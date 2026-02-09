/**
 * SPA (Browser) Module
 *
 * Everything needed for the browser bundle:
 * - SPA router with client-side navigation
 * - Custom elements for rendering and hydrating SSR islands
 */

export { createSpaHtmlRouter, SpaHtmlRouter } from './html.renderer.ts';
export { RouterSlot } from '../../element/slot.element.ts';
export { MarkdownElement } from '../../element/markdown.element.ts';
export { ComponentElement } from '../../element/component.element.ts';

// Built-in widgets (auto-register on import)
import '../../widget/page-title.widget.ts';
import '../../widget/breadcrumb.widget.ts';
