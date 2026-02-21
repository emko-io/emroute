/**
 * Base Renderer
 *
 * Shared rendering logic for SPA and Hash routers:
 * - Route hierarchy traversal with nested slot rendering
 * - Component loading, data fetching, and HTML rendering
 * - Markdown render waiting
 * - Document title updates
 */

import type { MatchedRoute, RouteConfig, RouteInfo } from '../../type/route.type.ts';
import defaultPageComponent, { type PageComponent } from '../../component/page.component.ts';
import { DEFAULT_ROOT_ROUTE, RouteCore } from '../../route/route.core.ts';
import { logger } from '../../util/logger.util.ts';

const MARKDOWN_RENDER_TIMEOUT = 5000;

/**
 * Abstract base for renderers that share the page rendering pipeline.
 * Subclasses provide navigation mechanics (Navigation API, hashchange, etc.).
 */
export abstract class BaseRenderer {
  protected core: RouteCore;
  protected slot: Element | null = null;

  constructor(core: RouteCore) {
    this.core = core;
  }

  /**
   * Render a matched page route with nested route support.
   */
  protected async renderPage(
    routeInfo: RouteInfo,
    matched: MatchedRoute,
    signal: AbortSignal,
  ): Promise<void> {
    if (!this.slot) return;

    try {
      const hierarchy = this.core.buildRouteHierarchy(routeInfo.pattern);
      logger.render('page', routeInfo.pattern, `hierarchy: ${hierarchy.join(' > ')}`);

      let currentSlot: Element = this.slot;
      let pageTitle: string | undefined;

      for (let i = 0; i < hierarchy.length; i++) {
        if (signal.aborted) return;

        const routePattern = hierarchy[i];
        const isLeaf = i === hierarchy.length - 1;

        let route = this.core.matcher.findRoute(routePattern);

        if (!route && routePattern === this.core.root) {
          route = { ...DEFAULT_ROOT_ROUTE, pattern: this.core.root };
        }

        if (!route) {
          logger.render('skip', routePattern, 'route not found');
          continue;
        }

        const routeType = isLeaf ? 'leaf' : 'layout';
        logger.render(routeType, routePattern, `${route.files?.ts ?? 'default'} → slot`);

        // Skip wildcard route appearing as its own parent (prevents double-render)
        if (route === matched.route && routePattern !== matched.route.pattern) {
          continue;
        }

        const { html, title } = await this.renderRouteContent(routeInfo, route, signal, isLeaf);
        if (signal.aborted) return;

        currentSlot.setHTMLUnsafe(html);

        if (title) {
          pageTitle = title;
        }

        // Wait for <mark-down> to finish rendering its content
        // (must happen before attributing slots — router-slot may be inside markdown)
        const markDown = currentSlot.querySelector<HTMLElement>('mark-down');
        if (markDown) {
          await this.waitForMarkdownRender(markDown);
          if (signal.aborted) return;
        }

        // Attribute bare <router-slot> tags with this route's pattern
        for (const slot of currentSlot.querySelectorAll('router-slot:not([pattern])')) {
          slot.setAttribute('pattern', routePattern);
        }

        if (!isLeaf) {
          const nestedSlot = currentSlot.querySelector(
            `router-slot[pattern="${CSS.escape(routePattern)}"]`,
          );
          if (nestedSlot) {
            currentSlot = nestedSlot;
          } else {
            logger.warn(
              `Route "${routePattern}" has no <router-slot> ` +
                `for child routes to render into. ` +
                `Add <router-slot></router-slot> to the parent template.`,
            );
          }
        }
      }

      if (signal.aborted) return;

      this.updateTitle(pageTitle);

      this.core.emit({
        type: 'load',
        pathname: routeInfo.pattern,
        params: routeInfo.params,
      });
    } catch (error) {
      if (signal.aborted) return;
      throw error;
    }
  }

  /**
   * Render a single route's content.
   */
  protected async renderRouteContent(
    routeInfo: RouteInfo,
    route: RouteConfig,
    signal: AbortSignal,
    isLeaf?: boolean,
  ): Promise<{ html: string; title?: string }> {
    if (route.modulePath === DEFAULT_ROOT_ROUTE.modulePath) {
      return { html: `<router-slot pattern="${route.pattern}"></router-slot>` };
    }

    const files = route.files ?? {};

    const component: PageComponent = files.ts
      ? (await this.core.loadModule<{ default: PageComponent }>(files.ts)).default
      : defaultPageComponent;

    const context = await this.core.buildComponentContext(routeInfo, route, signal, isLeaf);
    const data = await component.getData({ params: routeInfo.params, signal, context });
    const html = component.renderHTML({ data, params: routeInfo.params, context });
    const title = component.getTitle({ data, params: routeInfo.params, context });
    return { html, title };
  }

  /**
   * Wait for a <mark-down> element to finish rendering.
   */
  protected waitForMarkdownRender(element: HTMLElement): Promise<void> {
    return new Promise((resolve) => {
      if (element.children.length > 0) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        observer.disconnect();
        resolve();
      }, MARKDOWN_RENDER_TIMEOUT);

      const observer = new MutationObserver(() => {
        if (element.children.length > 0) {
          clearTimeout(timeout);
          observer.disconnect();
          resolve();
        }
      });

      observer.observe(element, { childList: true });
    });
  }

  /**
   * Update document.title from getTitle() result.
   */
  protected updateTitle(pageTitle?: string): void {
    if (pageTitle) {
      document.title = pageTitle;
    }
  }
}
