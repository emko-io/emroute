/**
 * Router Slot Element
 *
 * <router-slot> is where page content is rendered.
 * Supports nested routes via parent page containing slot.
 *
 * Usage:
 * ```html
 * <router-slot></router-slot>
 * ```
 *
 * For nested routes, parent page includes:
 * ```typescript
 * export default function render() {
 *   return `
 *     <header>...</header>
 *     <main>
 *       <router-slot></router-slot>
 *     </main>
 *   `;
 * }
 * ```
 */

import { HTMLElementBase } from '../util/html.util.ts';

const DATA_ROUTER_SLOT_ATTR = 'data-router-slot';

/**
 * Router slot web component.
 * Serves as the mounting point for page content.
 */
export class RouterSlot extends HTMLElementBase {
  connectedCallback(): void {
    this.setAttribute(DATA_ROUTER_SLOT_ATTR, 'true');

    if (!this.style.display) {
      this.style.display = 'contents';
    }
  }
}
