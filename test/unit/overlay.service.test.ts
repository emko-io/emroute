/**
 * Unit tests for OverlayService
 *
 * Tests cover:
 * - Service creation and API surface
 * - Modal state management
 * - Toast creation and dismissal
 * - Toast template cloning and fallback
 * - Toast convenience methods (success, error, warning, info)
 * - Toast update() and confirmation toasts
 * - Popover state management
 * - dismissAll functionality
 * - Promise resolution and callbacks
 */

// deno-lint-ignore-file no-explicit-any no-unused-vars

import { test, expect, describe } from 'bun:test';
import { createOverlayService } from '../../src/overlay/overlay.service.ts';
import type { OverlayService } from '../../src/overlay/overlay.type.ts';

/**
 * Mock DOM environment for testing without a full DOM implementation
 * This provides a minimal HTMLElement, HTMLDialogElement, etc.
 */
class MockCSSStyleDeclaration {
  [key: string]: any;

  setProperty(name: string, value: string): void {
    this[name] = value;
  }

  removeProperty(name: string): void {
    delete this[name];
  }
}

class MockHTMLElement {
  tagName = 'DIV';
  innerHTML = '';
  textContent = '';
  hidden = false;
  style: MockCSSStyleDeclaration = new MockCSSStyleDeclaration();
  attributes: Map<string, string> = new Map();
  private eventListeners: Map<string, Set<{ handler: (e: Event) => void; once: boolean }>> = new Map();
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

  addEventListener(event: string, handler: (e: Event) => void, opts?: { once?: boolean }): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add({ handler, once: opts?.once ?? false });
  }

  removeEventListener(event: string, handler: (e: Event) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const entry of listeners) {
        if (entry.handler === handler) {
          listeners.delete(entry);
          break;
        }
      }
    }
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const entry of [...listeners]) {
        entry.handler(event);
        if (entry.once) listeners.delete(entry);
      }
    }
    return true;
  }

  appendChild(child: MockHTMLElement | MockDocumentFragment): void {
    if (child instanceof MockDocumentFragment) {
      // Appending a fragment moves all its children
      for (const c of child.children) {
        this.children.push(c);
        c.parentNode = this;
      }
      child.children = [];
    } else {
      this.children.push(child);
      child.parentNode = this;
    }
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

  querySelector(selector: string): MockHTMLElement | null {
    return queryDescendants(this, selector);
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
}

/** Recursively search descendants for a matching element by attribute selector. */
function queryDescendants(root: MockHTMLElement, selector: string): MockHTMLElement | null {
  // Support [attr] selectors
  const attrMatch = selector.match(/^\[([a-z\-]+)\]$/);
  if (attrMatch) {
    const attr = attrMatch[1]!;
    for (const child of root.children) {
      if (child.hasAttribute(attr)) return child;
      const found = queryDescendants(child, selector);
      if (found) return found;
    }
  }
  return null;
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

class MockTemplateElement extends MockHTMLElement {
  content: MockDocumentFragment;

  constructor() {
    super();
    this.tagName = 'TEMPLATE';
    this.content = new MockDocumentFragment();
  }
}

class MockDocumentFragment {
  children: MockHTMLElement[] = [];

  appendChild(child: MockHTMLElement): void {
    this.children.push(child);
  }

  cloneNode(_deep?: boolean): MockDocumentFragment {
    const frag = new MockDocumentFragment();
    for (const child of this.children) {
      frag.children.push(cloneElement(child));
    }
    return frag;
  }
}

/** Deep-clone a MockHTMLElement tree. */
function cloneElement(el: MockHTMLElement): MockHTMLElement {
  const clone = new MockHTMLElement();
  clone.tagName = el.tagName;
  clone.textContent = el.textContent;
  clone.innerHTML = el.innerHTML;
  clone.hidden = el.hidden;
  // Copy attributes
  for (const [k, v] of el.attributes) {
    clone.setAttribute(k, v);
  }
  // Clone children
  for (const child of el.children) {
    clone.appendChild(cloneElement(child));
  }
  return clone;
}

class MockDocument {
  head = new MockHTMLElement();
  body = new MockHTMLElement();
  private templates: Map<string, MockTemplateElement> = new Map();

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
    if (tag === 'template') {
      return new MockTemplateElement();
    }
    const el = new MockHTMLElement();
    el.tagName = tag.toUpperCase();
    return el;
  }

  /** Register a template for getElementById-style lookups via querySelector('#id'). */
  addTemplate(id: string, template: MockTemplateElement): void {
    this.templates.set(id, template);
  }

  querySelector(selector: string): MockHTMLElement | null {
    // Support #id selector for templates
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this.templates.get(id) ?? null;
    }
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

/** Helper: build a toast template with standard data attributes. */
function installToastTemplate(): void {
  const tpl = mockDoc.createElement('template') as MockTemplateElement;

  const wrapper = mockDoc.createElement('div');
  wrapper.setAttribute('data-toast-wrapper', '');

  const msg = mockDoc.createElement('span');
  msg.setAttribute('data-toast-message', '');
  wrapper.appendChild(msg);

  const confirmBtn = mockDoc.createElement('button');
  confirmBtn.setAttribute('data-toast-confirm', '');
  confirmBtn.hidden = true;
  wrapper.appendChild(confirmBtn);

  const rejectBtn = mockDoc.createElement('button');
  rejectBtn.setAttribute('data-toast-reject', '');
  rejectBtn.hidden = true;
  wrapper.appendChild(rejectBtn);

  (tpl as MockTemplateElement).content.appendChild(wrapper);
  mockDoc.addTemplate('overlay-toast', tpl as MockTemplateElement);
}

test('OverlayService - create service', () => {
  const service = createOverlayService();
  expect(service.modal).toBeDefined();
  expect(service.closeModal).toBeDefined();
  expect(service.toast).toBeDefined();
  expect(service.popover).toBeDefined();
  expect(service.closePopover).toBeDefined();
  expect(service.dismissAll).toBeDefined();
});

test('OverlayService - service provides all methods', () => {
  const service = createOverlayService() as OverlayService;
  expect(typeof service.modal).toEqual('function');
  expect(typeof service.closeModal).toEqual('function');
  expect(typeof service.toast).toEqual('function');
  expect(typeof service.popover).toEqual('function');
  expect(typeof service.closePopover).toEqual('function');
  expect(typeof service.dismissAll).toEqual('function');
});

test('OverlayService - toast convenience methods exist', () => {
  const service = createOverlayService();
  expect(typeof service.toast.success).toEqual('function');
  expect(typeof service.toast.error).toEqual('function');
  expect(typeof service.toast.warning).toEqual('function');
  expect(typeof service.toast.info).toEqual('function');
});

test('OverlayService - CSS injection on first modal', () => {
  setupMocks();

  const service = createOverlayService();
  const initialStyleCount = mockDoc.head.children.length;

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Test Modal';
    },
  });

  const newStyleCount = mockDoc.head.children.length;
  expect(newStyleCount).toEqual(initialStyleCount + 1);

  teardownMocks();
});

test('OverlayService - CSS injection on first toast', () => {
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
  expect(newStyleCount).toEqual(initialStyleCount + 1);

  teardownMocks();
});

test('OverlayService - CSS injected only once across multiple overlays', () => {
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
  expect(finalStyleCount).toEqual(initialStyleCount + 1);

  teardownMocks();
});

test('OverlayService - modal creates dialog element', () => {
  setupMocks();
  const service = createOverlayService();

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Test Content';
    },
  });

  const dialog = mockDoc.querySelector('dialog[data-overlay-modal]');
  expect(dialog).toBeDefined();
  expect(dialog!.textContent).toEqual('Test Content');

  teardownMocks();
});

test('OverlayService - modal appends to body', () => {
  setupMocks();
  const service = createOverlayService();

  const initialChildCount = mockDoc.body.children.length;

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Test Modal';
    },
  });

  expect(mockDoc.body.children.length).toEqual(initialChildCount + 1);

  teardownMocks();
});

test('OverlayService - modal with return value resolves correctly', async () => {
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
    for (const entry of handlers) {
      entry.handler();
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 350));

  const result = await modalPromise;
  expect(result).toEqual('test-value');

  teardownMocks();
});

test('OverlayService - modal with undefined return resolves correctly', async () => {
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
  expect(result).toEqual(undefined);

  teardownMocks();
});

test('OverlayService - modal close calls onClose callback', async () => {
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
    for (const entry of handlers) {
      entry.handler();
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 350));

  expect(onCloseCalled).toBeTruthy();

  teardownMocks();
});

test('OverlayService - modal sets data-dismissing attribute on close', async () => {
  setupMocks();
  const service = createOverlayService();

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal';
    },
  });

  const dialog = mockDoc.querySelector('dialog[data-overlay-modal]')!;
  expect(!dialog.hasAttribute('data-dismissing')).toBeTruthy();

  service.closeModal();
  expect(dialog.hasAttribute('data-dismissing')).toBeTruthy();

  await new Promise((resolve) => setTimeout(resolve, 350));

  teardownMocks();
});

test('OverlayService - modal background click closes modal', async () => {
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

  expect(dialog.hasAttribute('data-dismissing')).toBeTruthy();

  await new Promise((resolve) => setTimeout(resolve, 350));

  teardownMocks();
});

test('OverlayService - new modal replaces existing modal', () => {
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
  expect(dialog.textContent).toEqual('Modal 1');

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal 2';
    },
  });

  expect(dialog.textContent).toEqual('Modal 2');
  expect(firstOnCloseCalled).toBeTruthy();

  teardownMocks();
});

test('OverlayService - closeModal does nothing if no modal open', () => {
  setupMocks();
  const service = createOverlayService();

  // Should not throw
  service.closeModal();

  teardownMocks();
});

test('OverlayService - toast creates toast element', () => {
  setupMocks();
  const service = createOverlayService();

  service.toast({
    render: (el) => {
      el.textContent = 'Test Toast';
    },
    timeout: 0,
  });

  const toast = mockDoc.querySelector('[data-overlay-toast]');
  expect(toast).toBeDefined();
  expect(toast!.textContent).toEqual('Test Toast');

  teardownMocks();
});

test('OverlayService - toast appended to container', () => {
  setupMocks();
  const service = createOverlayService();

  service.toast({
    render: (el) => {
      el.textContent = 'Toast 1';
    },
    timeout: 0,
  });

  const container = mockDoc.querySelector('[data-overlay-toast-container]');
  expect(container).toBeDefined();
  expect(container!.children.length).toEqual(1);
  expect(container!.children[0]!.textContent).toEqual('Toast 1');

  teardownMocks();
});

test('OverlayService - multiple toasts stack correctly', () => {
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
  expect(container!.children.length).toEqual(2);
  expect(container!.children[0]!.textContent).toEqual('Toast 1');
  expect(container!.children[1]!.textContent).toEqual('Toast 2');

  teardownMocks();
});

test('OverlayService - toast dismiss sets data-dismissing', () => {
  setupMocks();
  const service = createOverlayService();

  const { dismiss } = service.toast({
    render: (el) => {
      el.textContent = 'Dismissible Toast';
    },
    timeout: 0,
  });

  const container = mockDoc.querySelector('[data-overlay-toast-container]');
  expect(container!.children.length).toEqual(1);

  const toast = container!.children[0]!;
  expect(!toast.hasAttribute('data-dismissing')).toBeTruthy();

  dismiss();

  expect(toast.hasAttribute('data-dismissing')).toBeTruthy();
  // Element stays in DOM -- CSS handles exit animation, cleared on next toast()
  expect(container!.children.length).toEqual(1);

  teardownMocks();
});

test('OverlayService - toast with timeout 0 does not auto-dismiss', async () => {
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

  expect(container!.children.length).toEqual(initialCount);

  teardownMocks();
});

test('OverlayService - toast dismiss called multiple times is safe', async () => {
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

test('OverlayService - toast returns ToastHandle with id', () => {
  setupMocks();
  const service = createOverlayService();

  const handle = service.toast({
    render: (el) => {
      el.textContent = 'Toast';
    },
    timeout: 0,
  });

  expect(typeof handle.id).toEqual('number');
  expect(typeof handle.dismiss).toEqual('function');
  expect(typeof handle.update).toEqual('function');

  teardownMocks();
});

test('OverlayService - popover creates popover element', () => {
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
  expect(popover).toBeDefined();
  expect(popover!.textContent).toEqual('Test Popover');
  expect(popover!.getAttribute('popover')).toEqual('');

  teardownMocks();
});

test('OverlayService - popover appended to body', () => {
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

  expect(mockDoc.body.children.length).toEqual(initialChildCount + 1);

  teardownMocks();
});

test('OverlayService - closePopover with no popover open', () => {
  setupMocks();
  const service = createOverlayService();

  // Should not throw
  service.closePopover();

  teardownMocks();
});

test('OverlayService - closePopover with popover showing', async () => {
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
  expect(!popover.hasAttribute('data-dismissing')).toBeTruthy();

  service.closePopover();
  expect(popover.hasAttribute('data-dismissing')).toBeTruthy();

  await new Promise((resolve) => setTimeout(resolve, 350));

  teardownMocks();
});

test('OverlayService - new popover replaces existing popover', () => {
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
  expect(popover.textContent).toEqual('Popover 1');

  service.popover({
    anchor: anchor2 as any,
    render: (el) => {
      el.textContent = 'Popover 2';
    },
  });

  expect(popover.textContent).toEqual('Popover 2');

  teardownMocks();
});

test('OverlayService - dismissAll closes modal', async () => {
  setupMocks();
  const service = createOverlayService();

  const modalPromise = service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal';
    },
  });

  const dialog = mockDoc.querySelector('dialog[data-overlay-modal]')! as any;
  expect(dialog.open).toBeTruthy();

  service.dismissAll();

  // Modal should be closed immediately by dismissAll
  expect(!dialog.open).toBeTruthy();

  // Allow promise to resolve
  await new Promise((resolve) => setTimeout(resolve, 10));

  const result = await modalPromise;
  expect(result).toEqual(undefined);

  teardownMocks();
});

test('OverlayService - dismissAll marks all toasts as dismissing', () => {
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
  expect(container!.children.length).toEqual(2);

  service.dismissAll();

  // Toasts stay in DOM with data-dismissing -- CSS handles exit
  for (const child of container!.children) {
    expect(child.hasAttribute('data-dismissing')).toBeTruthy();
  }

  teardownMocks();
});

test('OverlayService - dismissAll hides popover', async () => {
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

  expect(!popover.hasAttribute('data-dismissing')).toBeTruthy();

  await new Promise((resolve) => setTimeout(resolve, 10));

  teardownMocks();
});

test('OverlayService - dismissAll with nothing open is safe', () => {
  setupMocks();
  const service = createOverlayService();

  // Should not throw
  service.dismissAll();

  teardownMocks();
});

test('OverlayService - modal hides popover when opened', async () => {
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

  expect(!popover.hasAttribute('data-dismissing')).toBeTruthy();

  await new Promise((resolve) => setTimeout(resolve, 10));

  teardownMocks();
});

test('OverlayService - modal calls onClose when replaced', () => {
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

  expect(onCloseCalled).toBeTruthy();

  teardownMocks();
});

test('OverlayService - modal data-dismissing removed on new modal', async () => {
  setupMocks();
  const service = createOverlayService();

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal 1';
    },
  });

  const dialog = mockDoc.querySelector('dialog[data-overlay-modal]')!;

  service.closeModal();
  expect(dialog.hasAttribute('data-dismissing')).toBeTruthy();

  service.modal({
    render: (dialog) => {
      dialog.textContent = 'Modal 2';
    },
  });

  expect(!dialog.hasAttribute('data-dismissing')).toBeTruthy();

  await new Promise((resolve) => setTimeout(resolve, 350));

  teardownMocks();
});

test('OverlayService - toast render receives correct element', () => {
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

  expect(receivedEl).toBeDefined();
  expect(receivedEl.getAttribute('data-overlay-toast')).toEqual('');
  expect(receivedEl.textContent).toEqual('Toast');

  teardownMocks();
});

test('OverlayService - popover render receives correct element', async () => {
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

  expect(receivedEl).toBeDefined();
  expect(receivedEl.getAttribute('data-overlay-popover')).toEqual('');
  expect(receivedEl.textContent).toEqual('Popover');

  await new Promise((resolve) => setTimeout(resolve, 10));

  teardownMocks();
});

test('OverlayService - modal render receives correct element', () => {
  setupMocks();
  const service = createOverlayService();

  let receivedEl: any = null;

  service.modal({
    render: (el) => {
      receivedEl = el;
      el.textContent = 'Modal';
    },
  });

  expect(receivedEl).toBeDefined();
  expect(receivedEl.getAttribute('data-overlay-modal')).toEqual('');
  expect(receivedEl.textContent).toEqual('Modal');

  teardownMocks();
});

test('OverlayService - multiple toasts can be dismissed independently', () => {
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
  expect(container.children.length).toEqual(2);

  dismiss1();
  expect(container.children[0]!.hasAttribute('data-dismissing')).toBeTruthy();
  expect(!container.children[1]!.hasAttribute('data-dismissing')).toBeTruthy();

  dismiss2();
  expect(container.children[1]!.hasAttribute('data-dismissing')).toBeTruthy();

  teardownMocks();
});

test('OverlayService - closeModal does nothing if called after new modal', async () => {
  setupMocks();
  const service = createOverlayService();

  void service.modal<string>({
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
  expect(dialog.textContent).toEqual('Modal 2');

  // This should not affect Modal 2
  service.closeModal('should-be-ignored');

  expect(dialog.textContent).toEqual('Modal 2');

  await new Promise((resolve) => setTimeout(resolve, 350));

  teardownMocks();
});

// --- Template-based toast tests ---

test('OverlayService - toast with message uses template when available', () => {
  setupMocks();
  installToastTemplate();
  const service = createOverlayService();

  service.toast({ message: 'Hello from template', timeout: 3000 });

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;

  // Template was cloned: wrapper child should exist
  expect(toastEl.children.length).toBeGreaterThan(0);

  // data-toast-message filled
  const msgEl = toastEl.querySelector('[data-toast-message]');
  expect(msgEl).toBeDefined();
  expect(msgEl!.textContent).toEqual('Hello from template');

  teardownMocks();
});

test('OverlayService - toast with message falls back to span when no template', () => {
  setupMocks();
  // No template installed
  const service = createOverlayService();

  service.toast({ message: 'Fallback toast', timeout: 2000 });

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;

  const msgEl = toastEl.querySelector('[data-toast-message]');
  expect(msgEl).toBeDefined();
  expect(msgEl!.tagName).toEqual('SPAN');
  expect(msgEl!.textContent).toEqual('Fallback toast');

  teardownMocks();
});

test('OverlayService - toast message option fills data-toast-message', () => {
  setupMocks();
  const service = createOverlayService();

  service.toast({ message: 'Test message content' });

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;
  const msgEl = toastEl.querySelector('[data-toast-message]');
  expect(msgEl!.textContent).toEqual('Test message content');

  teardownMocks();
});

test('OverlayService - toast type option sets data-toast-type attribute', () => {
  setupMocks();
  const service = createOverlayService();

  service.toast({ message: 'Typed toast', type: 'error' });

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;
  expect(toastEl.getAttribute('data-toast-type')).toEqual('error');

  teardownMocks();
});

test('OverlayService - toast type set on template-cloned element', () => {
  setupMocks();
  installToastTemplate();
  const service = createOverlayService();

  service.toast({ message: 'Warning', type: 'warning' });

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;
  expect(toastEl.getAttribute('data-toast-type')).toEqual('warning');

  teardownMocks();
});

test('OverlayService - toast.success convenience method', () => {
  setupMocks();
  const service = createOverlayService();

  const handle = service.toast.success('Operation completed');

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;
  expect(toastEl.getAttribute('data-toast-type')).toEqual('success');

  const msgEl = toastEl.querySelector('[data-toast-message]');
  expect(msgEl!.textContent).toEqual('Operation completed');

  // Should have timeout (not manual)
  expect(!toastEl.hasAttribute('data-toast-manual')).toBeTruthy();
  expect(toastEl.style['--overlay-toast-duration']).toEqual('5000ms');

  expect(typeof handle.id).toEqual('number');
  expect(typeof handle.dismiss).toEqual('function');
  expect(typeof handle.update).toEqual('function');

  teardownMocks();
});

test('OverlayService - toast.error convenience method', () => {
  setupMocks();
  const service = createOverlayService();

  service.toast.error('Something went wrong');

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;
  expect(toastEl.getAttribute('data-toast-type')).toEqual('error');

  const msgEl = toastEl.querySelector('[data-toast-message]');
  expect(msgEl!.textContent).toEqual('Something went wrong');

  teardownMocks();
});

test('OverlayService - toast.warning convenience method', () => {
  setupMocks();
  const service = createOverlayService();

  service.toast.warning('Be careful');

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;
  expect(toastEl.getAttribute('data-toast-type')).toEqual('warning');

  teardownMocks();
});

test('OverlayService - toast.info convenience method', () => {
  setupMocks();
  const service = createOverlayService();

  service.toast.info('FYI');

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;
  expect(toastEl.getAttribute('data-toast-type')).toEqual('info');

  teardownMocks();
});

test('OverlayService - toast.success with custom timeout', () => {
  setupMocks();
  const service = createOverlayService();

  service.toast.success('Quick', 1000);

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;
  expect(toastEl.style['--overlay-toast-duration']).toEqual('1000ms');

  teardownMocks();
});

test('OverlayService - toast update changes message and type', () => {
  setupMocks();
  const service = createOverlayService();

  const handle = service.toast({ message: 'Initial', type: 'info' });

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;

  expect(toastEl.querySelector('[data-toast-message]')!.textContent).toEqual('Initial');
  expect(toastEl.getAttribute('data-toast-type')).toEqual('info');

  handle.update({ message: 'Updated', type: 'success' });

  expect(toastEl.querySelector('[data-toast-message]')!.textContent).toEqual('Updated');
  expect(toastEl.getAttribute('data-toast-type')).toEqual('success');

  teardownMocks();
});

test('OverlayService - toast update changes timeout', () => {
  setupMocks();
  const service = createOverlayService();

  const handle = service.toast({ message: 'Test', timeout: 3000 });

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;

  handle.update({ timeout: 10000 });
  expect(toastEl.style['--overlay-toast-duration']).toEqual('10000ms');

  // Setting timeout to 0 makes it manual
  handle.update({ timeout: 0 });
  expect(toastEl.hasAttribute('data-toast-manual')).toBeTruthy();

  teardownMocks();
});

test('OverlayService - toast dismiss still works with new handle', () => {
  setupMocks();
  const service = createOverlayService();

  const handle = service.toast({ message: 'Dismissible' });

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;

  expect(!toastEl.hasAttribute('data-dismissing')).toBeTruthy();

  handle.dismiss();

  expect(toastEl.hasAttribute('data-dismissing')).toBeTruthy();

  teardownMocks();
});

test('OverlayService - confirmation toast with confirm and reject buttons (fallback)', () => {
  setupMocks();
  const service = createOverlayService();

  const handle = service.toast({
    message: 'Are you sure?',
    confirm: 'Yes',
    reject: 'No',
  });

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;

  // Should be manual (no auto-dismiss) because it has confirm
  expect(toastEl.hasAttribute('data-toast-manual')).toBeTruthy();

  // Confirm button exists
  const confirmBtn = toastEl.querySelector('[data-toast-confirm]');
  expect(confirmBtn).toBeDefined();
  expect(confirmBtn!.textContent).toEqual('Yes');

  // Reject button exists
  const rejectBtn = toastEl.querySelector('[data-toast-reject]');
  expect(rejectBtn).toBeDefined();
  expect(rejectBtn!.textContent).toEqual('No');

  // Handle should be PromiseLike
  expect(typeof (handle as any).then).toEqual('function');

  teardownMocks();
});

test('OverlayService - confirmation toast resolves true on confirm click', async () => {
  setupMocks();
  const service = createOverlayService();

  const handle = service.toast({
    message: 'Confirm?',
    confirm: 'OK',
    reject: 'Cancel',
  });

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;
  const confirmBtn = toastEl.querySelector('[data-toast-confirm]')!;

  // Click confirm
  confirmBtn.dispatchEvent(new Event('click'));

  const result = await (handle as any);
  expect(result).toEqual(true);

  // Should also be dismissed
  expect(toastEl.hasAttribute('data-dismissing')).toBeTruthy();

  teardownMocks();
});

test('OverlayService - confirmation toast resolves false on reject click', async () => {
  setupMocks();
  const service = createOverlayService();

  const handle = service.toast({
    message: 'Confirm?',
    confirm: 'OK',
    reject: 'Cancel',
  });

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;
  const rejectBtn = toastEl.querySelector('[data-toast-reject]')!;

  // Click reject
  rejectBtn.dispatchEvent(new Event('click'));

  const result = await (handle as any);
  expect(result).toEqual(false);

  // Should also be dismissed
  expect(toastEl.hasAttribute('data-dismissing')).toBeTruthy();

  teardownMocks();
});

test('OverlayService - confirmation toast with template cloning', () => {
  setupMocks();
  installToastTemplate();
  const service = createOverlayService();

  service.toast({
    message: 'Delete item?',
    confirm: 'Delete',
    reject: 'Keep',
  });

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;

  const confirmBtn = toastEl.querySelector('[data-toast-confirm]');
  expect(confirmBtn).toBeDefined();
  expect(confirmBtn!.textContent).toEqual('Delete');
  expect(confirmBtn!.hidden).toEqual(false);

  const rejectBtn = toastEl.querySelector('[data-toast-reject]');
  expect(rejectBtn).toBeDefined();
  expect(rejectBtn!.textContent).toEqual('Keep');
  expect(rejectBtn!.hidden).toEqual(false);

  teardownMocks();
});

test('OverlayService - template hides confirm/reject buttons when not provided', () => {
  setupMocks();
  installToastTemplate();
  const service = createOverlayService();

  service.toast({ message: 'No buttons', timeout: 3000 });

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  const toastEl = container.children[0]!;

  const confirmBtn = toastEl.querySelector('[data-toast-confirm]');
  expect(confirmBtn!.hidden).toEqual(true);

  const rejectBtn = toastEl.querySelector('[data-toast-reject]');
  expect(rejectBtn!.hidden).toEqual(true);

  teardownMocks();
});

test('OverlayService - render escape hatch still works', () => {
  setupMocks();
  installToastTemplate();
  const service = createOverlayService();

  let customRenderCalled = false;
  service.toast({
    render: (el) => {
      customRenderCalled = true;
      el.textContent = 'Custom render';
    },
    timeout: 0,
  });

  expect(customRenderCalled).toBeTruthy();

  const container = mockDoc.querySelector('[data-overlay-toast-container]')!;
  expect(container.children[0]!.textContent).toEqual('Custom render');

  teardownMocks();
});
