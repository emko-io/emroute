/**
 * Unit tests for OverlayService
 *
 * Tests cover:
 * - Service creation and API surface
 * - Modal state management
 * - Toast creation and dismissal
 * - Popover state management
 * - dismissAll functionality
 * - Promise resolution and callbacks
 */

// deno-lint-ignore-file no-explicit-any no-unused-vars

import { assert, assertEquals, assertExists } from '@std/assert';
import { createOverlayService } from '../../src/overlay/overlay.service.ts';
import type { OverlayService } from '../../src/overlay/overlay.type.ts';

/**
 * Mock DOM environment for testing without a full DOM implementation
 * This provides a minimal HTMLElement, HTMLDialogElement, etc.
 */
class MockHTMLElement {
  innerHTML = '';
  textContent = '';
  style: Record<string, string> = {};
  private attributes: Map<string, string> = new Map();
  private eventListeners: Map<string, Set<(e: Event) => void>> = new Map();
  children: MockHTMLElement[] = [];
  parentNode: MockHTMLElement | null = null;

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  addEventListener(event: string, handler: (e: Event) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  removeEventListener(event: string, handler: (e: Event) => void): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  dispatchEvent(event: Event): boolean {
    const handlers = this.eventListeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        (handler as EventListener)(event);
      }
    }
    return true;
  }

  appendChild(child: MockHTMLElement): void {
    this.children.push(child);
    child.parentNode = this;
  }

  removeChild(child: MockHTMLElement): void {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
  }

  remove(): void {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  matches(selector: string): boolean {
    if (selector === ':popover-open') {
      return this.hasAttribute('popover') && this.style.display !== 'none';
    }
    return false;
  }

  showPopover(): void {
    this.style.display = 'block';
  }

  hidePopover(): void {
    this.style.display = 'none';
  }

  getBoundingClientRect(): DOMRect {
    return {
      top: 50,
      left: 100,
      bottom: 100,
      right: 200,
      width: 100,
      height: 50,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    };
  }

  setProperty(name: string, value: string): void {
    this.style[name] = value;
  }

  removeProperty(name: string): void {
    delete this.style[name];
  }
}

class MockHTMLDialog extends MockHTMLElement {
  open = false;

  showModal(): void {
    this.open = true;
  }

  close(): void {
    this.open = false;
  }
}

class MockDocument {
  head = new MockHTMLElement();
  body = new MockHTMLElement();
  private _contains(el: MockHTMLElement): boolean {
    if (el === this.body) return true;
    for (const child of this.body.children) {
      if (child === el) return true;
      if (this._contains(child)) return true;
    }
    return false;
  }

  createElement(tag: string): MockHTMLElement {
    if (tag === 'dialog') {
      return new MockHTMLDialog();
    }
    return new MockHTMLElement();
  }

  querySelector(selector: string): MockHTMLElement | null {
    if (selector === 'dialog[data-overlay-modal]') {
      for (const child of this.body.children) {
        if (child.getAttribute('data-overlay-modal') !== null) {
          return child;
        }
      }
    }
    if (selector === '[data-overlay-toast-container]') {
      for (const child of this.body.children) {
        if (child.getAttribute('data-overlay-toast-container') !== null) {
          return child;
        }
      }
    }
    if (selector === '[data-overlay-toast]') {
      for (const child of this.body.children) {
        if (child.getAttribute('data-overlay-toast') !== null) {
          return child;
        }
        for (const grandchild of child.children) {
          if (grandchild.getAttribute('data-overlay-toast') !== null) {
            return grandchild;
          }
        }
      }
    }
    if (selector === '[data-overlay-popover]') {
      for (const child of this.body.children) {
        if (child.getAttribute('data-overlay-popover') !== null) {
          return child;
        }
      }
    }
    if (selector === 'style') {
      for (const child of this.head.children) {
        if (child instanceof MockHTMLElement && child.constructor.name === 'MockHTMLElement') {
          return child;
        }
      }
    }
    return null;
  }

  querySelectorAll(selector: string): MockHTMLElement[] {
    const result: MockHTMLElement[] = [];
    if (selector === 'style') {
      return this.head.children;
    }
    return result;
  }

  contains(el: MockHTMLElement): boolean {
    return this._contains(el);
  }
}

/**
 * Mock MutationObserver
 */
class MockMutationObserver {
  callback: ((mutations: unknown[]) => void) | null = null;

  constructor(callback: (mutations: unknown[]) => void) {
    this.callback = callback;
  }

  observe(): void {
    // No-op
  }

  disconnect(): void {
    this.callback = null;
  }
}

let mockDoc: MockDocument;
let originalDocument: Document;
let originalMutationObserver: typeof MutationObserver;
let originalMouseEvent: typeof MouseEvent;

function setupMocks(): void {
  mockDoc = new MockDocument();
  originalDocument = globalThis.document as Document;
  originalMutationObserver = globalThis.MutationObserver;
  originalMouseEvent = globalThis.MouseEvent;

  // Override globalThis.document
  (globalThis as any).document = mockDoc;

  // Override MutationObserver
  (globalThis as any).MutationObserver = MockMutationObserver;

  // Create a simple MouseEvent mock if not available
  if (typeof globalThis.MouseEvent === 'undefined') {
    (globalThis as any).MouseEvent = class extends Event {
      constructor(type: string, options?: EventInit) {
        super(type, options);
      }
    };
  }
}

function teardownMocks(): void {
  (globalThis as any).document = originalDocument;
  (globalThis as any).MutationObserver = originalMutationObserver;
  if (originalMouseEvent) {
    (globalThis as any).MouseEvent = originalMouseEvent;
  }
}

Deno.test('OverlayService - create service', () => {
  const service = createOverlayService();
  assertExists(service.modal);
  assertExists(service.closeModal);
  assertExists(service.toast);
  assertExists(service.popover);
  assertExists(service.closePopover);
  assertExists(service.dismissAll);
});

Deno.test('OverlayService - service provides all methods', () => {
  const service = createOverlayService() as OverlayService;
  assertEquals(typeof service.modal, 'function');
  assertEquals(typeof service.closeModal, 'function');
  assertEquals(typeof service.toast, 'function');
  assertEquals(typeof service.popover, 'function');
  assertEquals(typeof service.closePopover, 'function');
  assertEquals(typeof service.dismissAll, 'function');
});

Deno.test('OverlayService - CSS injection on first modal', () => {
  setupMocks();

  const service = createOverlayService();
  const initialStyleCount = mockDoc.head.children.length;

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Test Modal';
    },
  });

  const newStyleCount = mockDoc.head.children.length;
  assertEquals(newStyleCount, initialStyleCount + 1, 'CSS should be injected');

  teardownMocks();
});

Deno.test('OverlayService - CSS injection on first toast', () => {
  setupMocks();
  const service = createOverlayService();
  const initialStyleCount = mockDoc.head.children.length;

  service.toast({
    render: (el) => {
      el.textContent = 'Test Toast';
    },
    timeout: 0,
  });

  const newStyleCount = mockDoc.head.children.length;
  assertEquals(newStyleCount, initialStyleCount + 1, 'CSS should be injected');

  teardownMocks();
});

Deno.test('OverlayService - CSS injected only once across multiple overlays', () => {
  setupMocks();
  const service = createOverlayService();

  const initialStyleCount = mockDoc.head.children.length;

  // Create multiple overlays
  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal 1';
    },
  });

  service.toast({
    render: (el) => {
      el.textContent = 'Toast 1';
    },
    timeout: 0,
  });

  const finalStyleCount = mockDoc.head.children.length;
  assertEquals(
    finalStyleCount,
    initialStyleCount + 1,
    'CSS should be injected only once',
  );

  teardownMocks();
});

Deno.test('OverlayService - modal creates dialog element', () => {
  setupMocks();
  const service = createOverlayService();

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Test Content';
    },
  });

  const dialog = mockDoc.querySelector('dialog[data-overlay-modal]');
  assertExists(dialog);
  assertEquals(dialog!.textContent, 'Test Content');

  teardownMocks();
});

Deno.test('OverlayService - modal appends to body', () => {
  setupMocks();
  const service = createOverlayService();

  const initialChildCount = mockDoc.body.children.length;

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Test Modal';
    },
  });

  assertEquals(
    mockDoc.body.children.length,
    initialChildCount + 1,
    'Dialog should be appended to body',
  );

  teardownMocks();
});

Deno.test('OverlayService - modal with return value resolves correctly', async () => {
  setupMocks();
  const service = createOverlayService();

  const modalPromise = service.modal<string>({
    render: (dialog) => {
      dialog.textContent = 'Modal with value';
    },
  });

  service.closeModal('test-value');

  // Simulate animation completion
  const dialog = mockDoc.querySelector('dialog[data-overlay-modal]')!;
  const handlers = (dialog as any).eventListeners?.get('transitionend');
  if (handlers) {
    for (const handler of handlers) {
      handler();
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 350));

  const result = await modalPromise;
  assertEquals(result, 'test-value');

  teardownMocks();
});

Deno.test('OverlayService - modal with undefined return resolves correctly', async () => {
  setupMocks();
  const service = createOverlayService();

  const modalPromise = service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal';
    },
  });

  service.closeModal();

  // Simulate animation completion or safety timeout
  await new Promise((resolve) => setTimeout(resolve, 350));

  const result = await modalPromise;
  assertEquals(result, undefined);

  teardownMocks();
});

Deno.test('OverlayService - modal close calls onClose callback', async () => {
  setupMocks();
  const service = createOverlayService();

  let onCloseCalled = false;

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal';
    },
    onClose: () => {
      onCloseCalled = true;
    },
  });

  service.closeModal();

  // Simulate animation completion
  const dialog = mockDoc.querySelector('dialog[data-overlay-modal]')!;
  const handlers = (dialog as any).eventListeners?.get('transitionend');
  if (handlers) {
    for (const handler of handlers) {
      handler();
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 350));

  assert(onCloseCalled, 'onClose callback should be called');

  teardownMocks();
});

Deno.test('OverlayService - modal sets data-dismissing attribute on close', async () => {
  setupMocks();
  const service = createOverlayService();

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal';
    },
  });

  const dialog = mockDoc.querySelector('dialog[data-overlay-modal]')!;
  assert(!dialog.hasAttribute('data-dismissing'), 'Should not have data-dismissing initially');

  service.closeModal();
  assert(
    dialog.hasAttribute('data-dismissing'),
    'Should have data-dismissing after close',
  );

  await new Promise((resolve) => setTimeout(resolve, 350));

  teardownMocks();
});

Deno.test('OverlayService - modal background click closes modal', async () => {
  setupMocks();
  const service = createOverlayService();

  service.modal({
    render: (dialog) => {
      dialog.innerHTML = '<p>Modal content</p>';
    },
  });

  const dialog = mockDoc.querySelector('dialog[data-overlay-modal]')!;

  // Simulate click on backdrop
  const clickEvent = new MouseEvent('click', { bubbles: true });
  Object.defineProperty(clickEvent, 'target', { value: dialog });
  dialog.dispatchEvent(clickEvent);

  assert(dialog.hasAttribute('data-dismissing'), 'Modal should be dismissed on background click');

  await new Promise((resolve) => setTimeout(resolve, 350));

  teardownMocks();
});

Deno.test('OverlayService - new modal replaces existing modal', () => {
  setupMocks();
  const service = createOverlayService();

  let firstOnCloseCalled = false;

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal 1';
    },
    onClose: () => {
      firstOnCloseCalled = true;
    },
  });

  const dialog = mockDoc.querySelector('dialog[data-overlay-modal]')!;
  assertEquals(dialog.textContent, 'Modal 1');

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal 2';
    },
  });

  assertEquals(dialog.textContent, 'Modal 2');
  assert(firstOnCloseCalled, 'First modal onClose should be called');

  teardownMocks();
});

Deno.test('OverlayService - closeModal does nothing if no modal open', () => {
  setupMocks();
  const service = createOverlayService();

  // Should not throw
  service.closeModal();

  teardownMocks();
});

Deno.test('OverlayService - toast creates toast element', () => {
  setupMocks();
  const service = createOverlayService();

  service.toast({
    render: (el) => {
      el.textContent = 'Test Toast';
    },
    timeout: 0,
  });

  const toast = mockDoc.querySelector('[data-overlay-toast]');
  assertExists(toast);
  assertEquals(toast!.textContent, 'Test Toast');

  teardownMocks();
});

Deno.test('OverlayService - toast appended to container', () => {
  setupMocks();
  const service = createOverlayService();

  service.toast({
    render: (el) => {
      el.textContent = 'Toast 1';
    },
    timeout: 0,
  });

  const container = mockDoc.querySelector('[data-overlay-toast-container]');
  assertExists(container);
  assertEquals(container!.children.length, 1);
  assertEquals(container!.children[0].textContent, 'Toast 1');

  teardownMocks();
});

Deno.test('OverlayService - multiple toasts stack correctly', () => {
  setupMocks();
  const service = createOverlayService();

  service.toast({
    render: (el) => {
      el.textContent = 'Toast 1';
    },
    timeout: 0,
  });

  service.toast({
    render: (el) => {
      el.textContent = 'Toast 2';
    },
    timeout: 0,
  });

  const container = mockDoc.querySelector('[data-overlay-toast-container]');
  assertEquals(container!.children.length, 2);
  assertEquals(container!.children[0].textContent, 'Toast 1');
  assertEquals(container!.children[1].textContent, 'Toast 2');

  teardownMocks();
});

Deno.test('OverlayService - toast dismiss method removes toast', async () => {
  setupMocks();
  const service = createOverlayService();

  const { dismiss } = service.toast({
    render: (el) => {
      el.textContent = 'Dismissible Toast';
    },
    timeout: 0,
  });

  const container = mockDoc.querySelector('[data-overlay-toast-container]');
  assertEquals(container!.children.length, 1);

  dismiss();

  // Simulate animation completion or safety timeout
  const toast = mockDoc.querySelector('[data-overlay-toast]');
  if (toast) {
    const handlers = (toast as any).eventListeners?.get('transitionend');
    if (handlers) {
      for (const handler of handlers) {
        handler();
      }
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 350));

  assertEquals(container!.children.length, 0, 'Toast should be removed');

  teardownMocks();
});

Deno.test('OverlayService - toast with timeout 0 does not auto-dismiss', async () => {
  setupMocks();
  const service = createOverlayService();

  service.toast({
    render: (el) => {
      el.textContent = 'Manual Toast';
    },
    timeout: 0,
  });

  const container = mockDoc.querySelector('[data-overlay-toast-container]');
  const initialCount = container!.children.length;

  await new Promise((resolve) => setTimeout(resolve, 100));

  assertEquals(
    container!.children.length,
    initialCount,
    'Toast should not auto-dismiss with timeout 0',
  );

  teardownMocks();
});

Deno.test('OverlayService - toast dismiss called multiple times is safe', async () => {
  setupMocks();
  const service = createOverlayService();

  const { dismiss } = service.toast({
    render: (el) => {
      el.textContent = 'Toast';
    },
    timeout: 0,
  });

  dismiss();
  // Should not throw
  dismiss();
  dismiss();

  await new Promise((resolve) => setTimeout(resolve, 350));

  teardownMocks();
});

Deno.test('OverlayService - popover creates popover element', () => {
  setupMocks();
  const service = createOverlayService();

  const anchor = mockDoc.createElement('div');
  mockDoc.body.appendChild(anchor);

  service.popover({
    anchor: anchor as any,
    render: (el) => {
      el.textContent = 'Test Popover';
    },
  });

  const popover = mockDoc.querySelector('[data-overlay-popover]');
  assertExists(popover);
  assertEquals(popover!.textContent, 'Test Popover');
  assertEquals(popover!.getAttribute('popover'), '');

  teardownMocks();
});

Deno.test('OverlayService - popover appended to body', () => {
  setupMocks();
  const service = createOverlayService();

  const anchor = mockDoc.createElement('div');
  mockDoc.body.appendChild(anchor);

  const initialChildCount = mockDoc.body.children.length;

  service.popover({
    anchor: anchor as any,
    render: (el) => {
      el.textContent = 'Popover';
    },
  });

  assertEquals(
    mockDoc.body.children.length,
    initialChildCount + 1,
    'Popover should be appended to body',
  );

  teardownMocks();
});

Deno.test('OverlayService - closePopover with no popover open', () => {
  setupMocks();
  const service = createOverlayService();

  // Should not throw
  service.closePopover();

  teardownMocks();
});

Deno.test('OverlayService - closePopover with popover showing', async () => {
  setupMocks();
  const service = createOverlayService();

  const anchor = mockDoc.createElement('div');
  mockDoc.body.appendChild(anchor);

  service.popover({
    anchor: anchor as any,
    render: (el) => {
      el.textContent = 'Popover';
    },
  });

  const popover = mockDoc.querySelector('[data-overlay-popover]')!;
  assert(!popover.hasAttribute('data-dismissing'), 'Should not have data-dismissing initially');

  service.closePopover();
  assert(
    popover.hasAttribute('data-dismissing'),
    'Should have data-dismissing after close',
  );

  await new Promise((resolve) => setTimeout(resolve, 350));

  teardownMocks();
});

Deno.test('OverlayService - new popover replaces existing popover', () => {
  setupMocks();
  const service = createOverlayService();

  const anchor1 = mockDoc.createElement('div');
  const anchor2 = mockDoc.createElement('div');
  mockDoc.body.appendChild(anchor1);
  mockDoc.body.appendChild(anchor2);

  service.popover({
    anchor: anchor1 as any,
    render: (el) => {
      el.textContent = 'Popover 1';
    },
  });

  const popover = mockDoc.querySelector('[data-overlay-popover]')!;
  assertEquals(popover.textContent, 'Popover 1');

  service.popover({
    anchor: anchor2 as any,
    render: (el) => {
      el.textContent = 'Popover 2';
    },
  });

  assertEquals(popover.textContent, 'Popover 2');

  teardownMocks();
});

Deno.test('OverlayService - dismissAll closes modal', async () => {
  setupMocks();
  const service = createOverlayService();

  const modalPromise = service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal';
    },
  });

  const dialog = mockDoc.querySelector('dialog[data-overlay-modal]')! as any;
  assert(dialog.open, 'Modal should be open');

  service.dismissAll();

  // Modal should be closed immediately by dismissAll
  assert(!dialog.open, 'Modal should be closed after dismissAll');

  // Allow promise to resolve
  await new Promise((resolve) => setTimeout(resolve, 10));

  const result = await modalPromise;
  assertEquals(result, undefined);

  teardownMocks();
});

Deno.test('OverlayService - dismissAll removes all toasts', () => {
  setupMocks();
  const service = createOverlayService();

  service.toast({
    render: (el) => {
      el.textContent = 'Toast 1';
    },
    timeout: 0,
  });

  service.toast({
    render: (el) => {
      el.textContent = 'Toast 2';
    },
    timeout: 0,
  });

  const container = mockDoc.querySelector('[data-overlay-toast-container]');
  assertEquals(container!.children.length, 2);

  service.dismissAll();

  assertEquals(container!.children.length, 0, 'All toasts should be removed');

  teardownMocks();
});

Deno.test('OverlayService - dismissAll hides popover', async () => {
  setupMocks();
  const service = createOverlayService();

  const anchor = mockDoc.createElement('div');
  mockDoc.body.appendChild(anchor);

  service.popover({
    anchor: anchor as any,
    render: (el) => {
      el.textContent = 'Popover';
    },
  });

  const popover = mockDoc.querySelector('[data-overlay-popover]')!;

  service.dismissAll();

  assert(!popover.hasAttribute('data-dismissing'), 'Popover should be hidden immediately');

  await new Promise((resolve) => setTimeout(resolve, 10));

  teardownMocks();
});

Deno.test('OverlayService - dismissAll with nothing open is safe', () => {
  setupMocks();
  const service = createOverlayService();

  // Should not throw
  service.dismissAll();

  teardownMocks();
});

Deno.test('OverlayService - modal hides popover when opened', async () => {
  setupMocks();
  const service = createOverlayService();

  const anchor = mockDoc.createElement('div');
  mockDoc.body.appendChild(anchor);

  service.popover({
    anchor: anchor as any,
    render: (el) => {
      el.textContent = 'Popover';
    },
  });

  const popover = mockDoc.querySelector('[data-overlay-popover]')!;

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal';
    },
  });

  assert(
    !popover.hasAttribute('data-dismissing'),
    'Popover should be hidden immediately when modal opens',
  );

  await new Promise((resolve) => setTimeout(resolve, 10));

  teardownMocks();
});

Deno.test('OverlayService - modal calls onClose when replaced', () => {
  setupMocks();
  const service = createOverlayService();

  let onCloseCalled = false;

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal 1';
    },
    onClose: () => {
      onCloseCalled = true;
    },
  });

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal 2';
    },
  });

  assert(onCloseCalled, 'onClose should be called when modal is replaced');

  teardownMocks();
});

Deno.test('OverlayService - modal data-dismissing removed on new modal', async () => {
  setupMocks();
  const service = createOverlayService();

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal 1';
    },
  });

  const dialog = mockDoc.querySelector('dialog[data-overlay-modal]')!;

  service.closeModal();
  assert(dialog.hasAttribute('data-dismissing'), 'Modal should have data-dismissing');

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal 2';
    },
  });

  assert(
    !dialog.hasAttribute('data-dismissing'),
    'data-dismissing should be removed on new modal',
  );

  await new Promise((resolve) => setTimeout(resolve, 350));

  teardownMocks();
});

Deno.test('OverlayService - toast render receives correct element', () => {
  setupMocks();
  const service = createOverlayService();

  let receivedEl: any = null;

  service.toast({
    render: (el) => {
      receivedEl = el;
      el.textContent = 'Toast';
    },
    timeout: 0,
  });

  assertExists(receivedEl);
  assertEquals(receivedEl.getAttribute('data-overlay-toast'), '');
  assertEquals(receivedEl.textContent, 'Toast');

  teardownMocks();
});

Deno.test('OverlayService - popover render receives correct element', async () => {
  setupMocks();
  const service = createOverlayService();

  const anchor = mockDoc.createElement('div');
  mockDoc.body.appendChild(anchor);

  let receivedEl: any = null;

  service.popover({
    anchor: anchor as any,
    render: (el) => {
      receivedEl = el;
      el.textContent = 'Popover';
    },
  });

  assertExists(receivedEl);
  assertEquals(receivedEl.getAttribute('data-overlay-popover'), '');
  assertEquals(receivedEl.textContent, 'Popover');

  await new Promise((resolve) => setTimeout(resolve, 10));

  teardownMocks();
});

Deno.test('OverlayService - modal render receives correct element', () => {
  setupMocks();
  const service = createOverlayService();

  let receivedEl: any = null;

  service.modal({
    render: (el) => {
      receivedEl = el;
      el.textContent = 'Modal';
    },
  });

  assertExists(receivedEl);
  assertEquals(receivedEl.getAttribute('data-overlay-modal'), '');
  assertEquals(receivedEl.textContent, 'Modal');

  teardownMocks();
});

Deno.test('OverlayService - multiple toasts can be dismissed independently', async () => {
  setupMocks();
  const service = createOverlayService();

  const { dismiss: dismiss1 } = service.toast({
    render: (el) => {
      el.textContent = 'Toast 1';
    },
    timeout: 0,
  });

  const { dismiss: dismiss2 } = service.toast({
    render: (el) => {
      el.textContent = 'Toast 2';
    },
    timeout: 0,
  });

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  assertEquals(container.children.length, 2);

  dismiss1();

  // Simulate animation completion
  const toast1 = container.children[0];
  const handlers1 = (toast1 as any).eventListeners?.get('transitionend');
  if (handlers1) {
    for (const handler of handlers1) {
      handler();
    }
  }

  assertEquals(container.children.length, 1, 'First toast should be removed');

  dismiss2();

  // Simulate animation completion
  if (container.children.length > 0) {
    const toast2 = container.children[0];
    const handlers2 = (toast2 as any).eventListeners?.get('transitionend');
    if (handlers2) {
      for (const handler of handlers2) {
        handler();
      }
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 350));

  assertEquals(container.children.length, 0, 'Second toast should be removed');

  teardownMocks();
});

Deno.test('OverlayService - closeModal does nothing if called after new modal', async () => {
  setupMocks();
  const service = createOverlayService();

  const modalPromise1 = service.modal<string>({
    render: (dialog) => {
      dialog.textContent = 'Modal 1';
    },
  });

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal 2';
    },
  });

  const dialog = mockDoc.querySelector('dialog[data-overlay-modal]')!;
  assertEquals(dialog.textContent, 'Modal 2');

  // This should not affect Modal 2
  service.closeModal('should-be-ignored');

  assertEquals(dialog.textContent, 'Modal 2', 'Modal 2 should not be affected');

  await new Promise((resolve) => setTimeout(resolve, 350));

  teardownMocks();
});
