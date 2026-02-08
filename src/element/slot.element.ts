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

/**
 * Router slot web component.
 * Serves as the mounting point for page content.
 */
export class RouterSlot extends HTMLElementBase {
  connectedCallback(): void {
    this.setAttribute('data-router-slot', 'true');

    if (!this.style.display) {
      this.style.display = 'contents';
    }
  }
}

// Register the custom element (browser only)
if (globalThis.customElements && !customElements.get('router-slot')) {
  customElements.define('router-slot', RouterSlot);
}
