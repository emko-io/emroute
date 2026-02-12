/**
 * Overlay Service — Unit Tests
 *
 * Uses mock DOM elements to test the overlay service logic (modals, toasts,
 * popovers) without a real browser. Each test sets up its own mock DOM and
 * overlay instance for isolation.
 */

import { assert, assertEquals } from '@std/assert';
import { createOverlayService } from '../../src/overlay/overlay.service.ts';

// ============================================================================
// Mock DOM Infrastructure
// ============================================================================

type ListenerEntry = {
  handler: (event: unknown) => void;
  options?: { once?: boolean };
};

class MockElement {
  tagName: string;
  private attrs = new Map<string, string>();
  children: MockElement[] = [];
  parentNode: MockElement | null = null;
  innerHTML = '';
  textContent = '';
  open = false;
  style: Record<string, string> & { removeProperty(name: string): void };
  private eventListeners = new Map<string, ListenerEntry[]>();

  constructor(tag: string) {
    this.tagName = tag;
    const props: Record<string, string> = {};
    this.style = Object.assign(props, {
      removeProperty(name: string) {
        delete props[name];
      },
    });
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }

  addEventListener(
    type: string,
    handler: (event: unknown) => void,
    options?: { once?: boolean },
  ): void {
    if (!this.eventListeners.has(type)) this.eventListeners.set(type, []);
    this.eventListeners.get(type)!.push({ handler, options });
  }

  fire(type: string, event?: Record<string, unknown>): void {
    const list = this.eventListeners.get(type);
    if (!list) return;
    const evt = event ?? { target: this };
    for (const entry of [...list]) {
      entry.handler(evt);
      if (entry.options?.once) {
        const idx = list.indexOf(entry);
        if (idx >= 0) list.splice(idx, 1);
      }
    }
  }

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  remove(): void {
    if (this.parentNode) {
      const idx = this.parentNode.children.indexOf(this);
      if (idx >= 0) this.parentNode.children.splice(idx, 1);
      this.parentNode = null;
    }
  }

  contains(el: unknown): boolean {
    const m = el as MockElement;
    return this.children.includes(m) || this.children.some((c) => c.contains(m));
  }

  matches(selector: string): boolean {
    if (selector === ':popover-open') return this.hasAttribute('__popover_open');
    return false;
  }

  getBoundingClientRect() {
    return {
      top: 100,
      left: 200,
      bottom: 150,
      right: 300,
      width: 100,
      height: 50,
      x: 200,
      y: 100,
      toJSON() {},
    };
  }

  showModal(): void {
    this.open = true;
  }
  close(): void {
    this.open = false;
  }
  showPopover(): void {
    this.setAttribute('__popover_open', '');
  }
  hidePopover(): void {
    this.removeAttribute('__popover_open');
  }
  // deno-lint-ignore no-unused-vars
  querySelector(s: string): null {
    return null;
  }
}

class MockObserver {
  callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
}

interface TestDOM {
  body: MockElement;
  head: MockElement;
  observers: MockObserver[];
  cleanup(): void;
}

function setupDOM(): TestDOM {
  const body = new MockElement('body');
  const head = new MockElement('head');
  const observers: MockObserver[] = [];

  const g = globalThis as Record<string, unknown>;
  g.document = {
    createElement: (tag: string) => new MockElement(tag),
    body,
    head,
    contains: (el: unknown) => body.contains(el),
  };
  g.CSS = { supports: () => false };
  g.MutationObserver = class extends MockObserver {
    constructor(cb: () => void) {
      super(cb);
      observers.push(this);
    }
  };
  g.scrollY = 0;
  g.scrollX = 0;

  return {
    body,
    head,
    observers,
    cleanup() {
      delete g.document;
      delete g.CSS;
      delete g.MutationObserver;
      delete g.scrollY;
      delete g.scrollX;
    },
  };
}

function findByAttr(parent: MockElement, attr: string): MockElement | undefined {
  for (const child of parent.children) {
    if (child.hasAttribute(attr)) return child;
    const found = findByAttr(child, attr);
    if (found) return found;
  }
  return undefined;
}

/** Complete a dismiss animation by firing transitionend. */
function flushDismiss(el: MockElement): void {
  el.fire('transitionend');
}

// ============================================================================
// Tests
// ============================================================================

// Sanitizers disabled because animateDismiss schedules a 300ms safety timeout
// that outlives the synchronous test step.
Deno.test({ name: 'overlay service', sanitizeOps: false, sanitizeResources: false }, async (t) => {
  // ------------------------------------------------------------------
  // Shape
  // ------------------------------------------------------------------

  await t.step('createOverlayService returns all expected methods', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      assertEquals(typeof overlay.modal, 'function');
      assertEquals(typeof overlay.closeModal, 'function');
      assertEquals(typeof overlay.toast, 'function');
      assertEquals(typeof overlay.popover, 'function');
      assertEquals(typeof overlay.closePopover, 'function');
      assertEquals(typeof overlay.dismissAll, 'function');
    } finally {
      dom.cleanup();
    }
  });

  // ------------------------------------------------------------------
  // Modal
  // ------------------------------------------------------------------

  await t.step('modal opens dialog and calls render callback', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      let rendered = false;
      overlay.modal({
        render() {
          rendered = true;
        },
      });

      assert(rendered, 'render should have been called');
      const dialog = findByAttr(dom.body, 'data-overlay-modal')!;
      assert(dialog, 'dialog should exist in body');
      assert(dialog.open, 'dialog should be open');
    } finally {
      dom.cleanup();
    }
  });

  await t.step('closeModal resolves modal promise with value', async () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      const promise = overlay.modal({ render() {} });
      const dialog = findByAttr(dom.body, 'data-overlay-modal')!;

      overlay.closeModal(42);
      flushDismiss(dialog);

      const value = await promise;
      assertEquals(value, 42);
    } finally {
      dom.cleanup();
    }
  });

  await t.step('closeModal without value resolves with undefined', async () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      const promise = overlay.modal({ render() {} });
      const dialog = findByAttr(dom.body, 'data-overlay-modal')!;

      overlay.closeModal();
      flushDismiss(dialog);

      const value = await promise;
      assertEquals(value, undefined);
    } finally {
      dom.cleanup();
    }
  });

  await t.step('closeModal closes the dialog element', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      overlay.modal({ render() {} });
      const dialog = findByAttr(dom.body, 'data-overlay-modal')!;
      assert(dialog.open);

      overlay.closeModal();
      flushDismiss(dialog);

      assert(!dialog.open, 'dialog should be closed');
    } finally {
      dom.cleanup();
    }
  });

  await t.step('backdrop click closes modal with undefined', async () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      const promise = overlay.modal({ render() {} });
      const dialog = findByAttr(dom.body, 'data-overlay-modal')!;

      // Simulate backdrop click: e.target is the dialog itself
      dialog.fire('click', { target: dialog });
      flushDismiss(dialog);

      const value = await promise;
      assertEquals(value, undefined);
    } finally {
      dom.cleanup();
    }
  });

  await t.step('click on dialog child does not close modal', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      overlay.modal({ render() {} });
      const dialog = findByAttr(dom.body, 'data-overlay-modal')!;
      const child = new MockElement('div');

      dialog.fire('click', { target: child });

      assert(dialog.open, 'dialog should remain open');
    } finally {
      dom.cleanup();
    }
  });

  await t.step('last wins: new modal closes previous, previous resolves undefined', async () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      const first = overlay.modal({ render() {} });
      // Opening a second modal closes the first immediately (no animation)
      const second = overlay.modal({ render() {} });

      const firstValue = await first;
      assertEquals(firstValue, undefined);

      const dialog = findByAttr(dom.body, 'data-overlay-modal')!;
      assert(dialog.open, 'second modal should be open');

      overlay.closeModal('ok');
      flushDismiss(dialog);
      const secondValue = await second;
      assertEquals(secondValue, 'ok');
    } finally {
      dom.cleanup();
    }
  });

  await t.step('modal clears dialog content between calls', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      overlay.modal({
        render(d) {
          d.innerHTML = '<p>first</p>';
        },
      });
      // Second modal opens — innerHTML should be cleared before render
      overlay.modal({ render() {} });
      const dialog = findByAttr(dom.body, 'data-overlay-modal')!;
      assertEquals(dialog.innerHTML, '');
    } finally {
      dom.cleanup();
    }
  });

  await t.step('onClose callback is called on closeModal', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      let closed = false;
      overlay.modal({
        render() {},
        onClose() {
          closed = true;
        },
      });
      const dialog = findByAttr(dom.body, 'data-overlay-modal')!;

      overlay.closeModal();
      flushDismiss(dialog);

      assert(closed, 'onClose should have been called');
    } finally {
      dom.cleanup();
    }
  });

  await t.step('closeModal when no modal is open is a no-op', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      overlay.closeModal(); // should not throw
    } finally {
      dom.cleanup();
    }
  });

  // ------------------------------------------------------------------
  // Toast
  // ------------------------------------------------------------------

  await t.step('toast creates element and calls render', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      let rendered = false;
      overlay.toast({
        render(el) {
          rendered = true;
          el.textContent = 'saved';
        },
        timeout: 0,
      });

      assert(rendered);
      const container = findByAttr(dom.body, 'data-overlay-toast-container')!;
      assert(container, 'toast container should exist');
      const toast = findByAttr(container, 'data-overlay-toast')!;
      assert(toast, 'toast element should exist');
      assertEquals(toast.textContent, 'saved');
    } finally {
      dom.cleanup();
    }
  });

  await t.step('toast dismiss removes element after animation', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      const { dismiss } = overlay.toast({ render() {}, timeout: 0 });
      const container = findByAttr(dom.body, 'data-overlay-toast-container')!;
      assertEquals(container.children.length, 1);

      const toastEl = container.children[0];
      dismiss();
      assert(toastEl.hasAttribute('data-dismissing'), 'should animate out');
      flushDismiss(toastEl);

      assertEquals(container.children.length, 0);
    } finally {
      dom.cleanup();
    }
  });

  await t.step('multiple toasts coexist in container', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      overlay.toast({ render() {}, timeout: 0 });
      overlay.toast({ render() {}, timeout: 0 });
      overlay.toast({ render() {}, timeout: 0 });
      const container = findByAttr(dom.body, 'data-overlay-toast-container')!;
      assertEquals(container.children.length, 3);
    } finally {
      dom.cleanup();
    }
  });

  await t.step('toast dismiss is idempotent', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      const { dismiss } = overlay.toast({ render() {}, timeout: 0 });
      const container = findByAttr(dom.body, 'data-overlay-toast-container')!;
      const toastEl = container.children[0];

      dismiss();
      flushDismiss(toastEl);
      dismiss(); // second call — no-op

      assertEquals(container.children.length, 0);
    } finally {
      dom.cleanup();
    }
  });

  // ------------------------------------------------------------------
  // Popover
  // ------------------------------------------------------------------

  await t.step('popover shows element and calls render', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      const anchor = new MockElement('button');
      dom.body.appendChild(anchor);

      let rendered = false;
      overlay.popover({
        anchor: anchor as unknown as HTMLElement,
        render() {
          rendered = true;
        },
      });

      assert(rendered);
      const pop = findByAttr(dom.body, 'data-overlay-popover')!;
      assert(pop, 'popover element should exist');
      assert(pop.hasAttribute('__popover_open'), 'popover should be shown');
    } finally {
      dom.cleanup();
    }
  });

  await t.step('popover uses getBoundingClientRect fallback positioning', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      const anchor = new MockElement('button');
      dom.body.appendChild(anchor);

      overlay.popover({
        anchor: anchor as unknown as HTMLElement,
        render() {},
      });

      const pop = findByAttr(dom.body, 'data-overlay-popover')!;
      // MockElement.getBoundingClientRect returns bottom:150, left:200
      assertEquals(pop.style.top, '150px');
      assertEquals(pop.style.left, '200px');
      assertEquals(pop.style.position, 'absolute');
    } finally {
      dom.cleanup();
    }
  });

  await t.step('closePopover hides the popover', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      const anchor = new MockElement('button');
      dom.body.appendChild(anchor);

      overlay.popover({
        anchor: anchor as unknown as HTMLElement,
        render() {},
      });

      const pop = findByAttr(dom.body, 'data-overlay-popover')!;
      overlay.closePopover();
      flushDismiss(pop);

      assert(!pop.hasAttribute('__popover_open'), 'popover should be hidden');
    } finally {
      dom.cleanup();
    }
  });

  await t.step('popover last wins: new popover replaces previous content', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      const anchor1 = new MockElement('button');
      const anchor2 = new MockElement('button');
      dom.body.appendChild(anchor1);
      dom.body.appendChild(anchor2);

      overlay.popover({
        anchor: anchor1 as unknown as HTMLElement,
        render(el) {
          el.innerHTML = 'first';
        },
      });
      overlay.popover({
        anchor: anchor2 as unknown as HTMLElement,
        render(el) {
          el.innerHTML = 'second';
        },
      });

      const pop = findByAttr(dom.body, 'data-overlay-popover')!;
      assertEquals(pop.innerHTML, 'second');
      assert(pop.hasAttribute('__popover_open'));
    } finally {
      dom.cleanup();
    }
  });

  await t.step('popover anchor disconnect triggers close', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      const anchor = new MockElement('button');
      dom.body.appendChild(anchor);

      overlay.popover({
        anchor: anchor as unknown as HTMLElement,
        render() {},
      });

      // Simulate anchor removal from DOM
      anchor.remove();
      // Trigger the MutationObserver callback
      const observer = dom.observers[dom.observers.length - 1];
      observer.callback();

      const pop = findByAttr(dom.body, 'data-overlay-popover')!;
      flushDismiss(pop);
      assert(!pop.hasAttribute('__popover_open'), 'popover should close on anchor disconnect');
    } finally {
      dom.cleanup();
    }
  });

  await t.step('closePopover when no popover is open is a no-op', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      overlay.closePopover(); // should not throw
    } finally {
      dom.cleanup();
    }
  });

  // ------------------------------------------------------------------
  // dismissAll
  // ------------------------------------------------------------------

  await t.step('dismissAll closes modal, removes toasts, hides popover', async () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();

      // Open a modal
      const modalPromise = overlay.modal({ render() {} });

      // Create toasts
      overlay.toast({ render() {}, timeout: 0 });
      overlay.toast({ render() {}, timeout: 0 });

      // Show popover
      const anchor = new MockElement('button');
      dom.body.appendChild(anchor);
      overlay.popover({ anchor: anchor as unknown as HTMLElement, render() {} });

      overlay.dismissAll();

      // Modal promise resolves with undefined
      const modalValue = await modalPromise;
      assertEquals(modalValue, undefined);

      // Dialog is closed
      const dialog = findByAttr(dom.body, 'data-overlay-modal')!;
      assert(!dialog.open, 'dialog should be closed');

      // Toasts are removed immediately (no animation)
      const container = findByAttr(dom.body, 'data-overlay-toast-container')!;
      assertEquals(container.children.length, 0);

      // Popover is hidden immediately
      const pop = findByAttr(dom.body, 'data-overlay-popover')!;
      assert(!pop.hasAttribute('__popover_open'), 'popover should be hidden');
    } finally {
      dom.cleanup();
    }
  });

  await t.step('dismissAll is safe when nothing is open', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      overlay.dismissAll(); // should not throw
    } finally {
      dom.cleanup();
    }
  });

  // ------------------------------------------------------------------
  // CSS injection
  // ------------------------------------------------------------------

  await t.step('CSS is injected on first overlay use', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      assertEquals(dom.head.children.length, 0, 'no styles before first use');

      overlay.toast({ render() {}, timeout: 0 });
      assertEquals(dom.head.children.length, 1, 'style injected after first use');
      assertEquals(dom.head.children[0].tagName, 'style');
      assert(dom.head.children[0].textContent.includes('--overlay-backdrop'));
    } finally {
      dom.cleanup();
    }
  });

  await t.step('CSS is injected only once across multiple overlay types', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      overlay.toast({ render() {}, timeout: 0 });
      overlay.modal({ render() {} });
      const anchor = new MockElement('button');
      dom.body.appendChild(anchor);
      overlay.popover({ anchor: anchor as unknown as HTMLElement, render() {} });

      assertEquals(dom.head.children.length, 1, 'only one style element');
    } finally {
      dom.cleanup();
    }
  });

  // ------------------------------------------------------------------
  // DOM element reuse
  // ------------------------------------------------------------------

  await t.step('dialog element is reused across modal calls', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      overlay.modal({ render() {} });
      overlay.modal({ render() {} });
      const dialogs = dom.body.children.filter((c) => c.hasAttribute('data-overlay-modal'));
      assertEquals(dialogs.length, 1, 'should reuse the same dialog');
    } finally {
      dom.cleanup();
    }
  });

  await t.step('popover element is reused across popover calls', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      const anchor = new MockElement('button');
      dom.body.appendChild(anchor);
      overlay.popover({ anchor: anchor as unknown as HTMLElement, render() {} });
      overlay.popover({ anchor: anchor as unknown as HTMLElement, render() {} });
      const popovers = dom.body.children.filter((c) => c.hasAttribute('data-overlay-popover'));
      assertEquals(popovers.length, 1, 'should reuse the same popover');
    } finally {
      dom.cleanup();
    }
  });

  await t.step('toast container is reused across toast calls', () => {
    const dom = setupDOM();
    try {
      const overlay = createOverlayService();
      overlay.toast({ render() {}, timeout: 0 });
      overlay.toast({ render() {}, timeout: 0 });
      const containers = dom.body.children.filter((c) =>
        c.hasAttribute('data-overlay-toast-container')
      );
      assertEquals(containers.length, 1, 'should reuse the same container');
    } finally {
      dom.cleanup();
    }
  });
});
