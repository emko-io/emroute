/**
 * Toast Template — Browser Validation
 *
 * Validates the overlay service toast API in a real browser:
 * - Template cloning via <template id="overlay-toast">
 * - Fallback when no template exists
 * - Convenience methods (success/error/warning/info)
 * - ToastHandle (dismiss, update)
 * - Confirmation toast (confirm/reject buttons, PromiseLike<boolean>)
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import {
  createTestBrowser,
  createTestServer,
  type TestBrowser,
  type TestServer,
} from '../shared/setup.ts';
import type { Page } from 'playwright';

let server: TestServer;
let tb: TestBrowser;
let page: Page;

describe('Toast templates — browser', () => {
  beforeAll(async () => {
    server = await createTestServer({ mode: 'leaf', port: 4110 });
    tb = await createTestBrowser();
    page = await tb.newPage();
    await page.goto(server.baseUrl('/html/'));
    await page.waitForSelector('h1', { timeout: 5000 });
  });

  afterAll(async () => {
    await tb.close();
    server.stop();
  });

  // ── Fallback (no template) ─────────────────────────────────────────

  test('toast fallback creates span with message', async () => {
    const result = await page.evaluate(async () => {
      const { createOverlayService } = await import('@emkodev/emroute/overlay');
      const overlay = createOverlayService();
      overlay.toast({ message: 'Hello fallback', type: 'info' });

      const container = document.querySelector('[data-overlay-toast-container]');
      const toast = container?.querySelector('[data-overlay-toast]') as HTMLElement;
      const msg = toast?.querySelector('[data-toast-message]');
      return {
        containerExists: container !== null,
        toastExists: toast !== null,
        message: msg?.textContent,
        type: toast?.getAttribute('data-toast-type'),
      };
    });

    expect(result.containerExists).toBe(true);
    expect(result.toastExists).toBe(true);
    expect(result.message).toBe('Hello fallback');
    expect(result.type).toBe('info');
  });

  test('convenience methods set correct type', async () => {
    // Clean up previous toasts
    await page.evaluate(() => {
      document.querySelector('[data-overlay-toast-container]')?.remove();
    });

    const result = await page.evaluate(async () => {
      const { createOverlayService } = await import('@emkodev/emroute/overlay');
      const overlay = createOverlayService();

      overlay.toast.success('ok');
      overlay.toast.error('fail');
      overlay.toast.warning('careful');
      overlay.toast.info('fyi');

      const toasts = document.querySelectorAll('[data-overlay-toast]');
      return Array.from(toasts).map((t) => ({
        type: t.getAttribute('data-toast-type'),
        message: t.querySelector('[data-toast-message]')?.textContent,
      }));
    });

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ type: 'success', message: 'ok' });
    expect(result[1]).toEqual({ type: 'error', message: 'fail' });
    expect(result[2]).toEqual({ type: 'warning', message: 'careful' });
    expect(result[3]).toEqual({ type: 'info', message: 'fyi' });
  });

  // ── Template cloning ──────────────────────────────────────────────

  test('toast clones <template id="overlay-toast"> when present', async () => {
    await page.evaluate(() => {
      // Clean up
      document.querySelector('[data-overlay-toast-container]')?.remove();

      // Inject template into DOM
      const tpl = document.createElement('template');
      tpl.id = 'overlay-toast';
      tpl.innerHTML = `
        <span data-toast-message></span>
        <button data-toast-confirm hidden></button>
        <button data-toast-reject hidden></button>
      `;
      document.body.appendChild(tpl);
    });

    const result = await page.evaluate(async () => {
      const { createOverlayService } = await import('@emkodev/emroute/overlay');
      const overlay = createOverlayService();

      overlay.toast({ message: 'From template', type: 'success' });

      const toast = document.querySelector('[data-overlay-toast]') as HTMLElement;
      const msg = toast?.querySelector('[data-toast-message]');
      const confirmBtn = toast?.querySelector('[data-toast-confirm]') as HTMLElement;
      const rejectBtn = toast?.querySelector('[data-toast-reject]') as HTMLElement;

      return {
        message: msg?.textContent,
        type: toast?.getAttribute('data-toast-type'),
        confirmHidden: confirmBtn?.hidden,
        rejectHidden: rejectBtn?.hidden,
      };
    });

    expect(result.message).toBe('From template');
    expect(result.type).toBe('success');
    expect(result.confirmHidden).toBe(true);
    expect(result.rejectHidden).toBe(true);
  });

  // ── ToastHandle ────────────────────────────────────────────────────

  test('toast.update() changes message and type', async () => {
    await page.evaluate(() => {
      document.querySelector('[data-overlay-toast-container]')?.remove();
    });

    const result = await page.evaluate(async () => {
      const { createOverlayService } = await import('@emkodev/emroute/overlay');
      const overlay = createOverlayService();

      const handle = overlay.toast({ message: 'Loading...', type: 'info', timeout: 0 });

      // Verify initial
      const toast = document.querySelector('[data-overlay-toast]') as HTMLElement;
      const before = {
        message: toast.querySelector('[data-toast-message]')?.textContent,
        type: toast.getAttribute('data-toast-type'),
      };

      // Update
      handle.update({ message: 'Done!', type: 'success', timeout: 3000 });

      const after = {
        message: toast.querySelector('[data-toast-message]')?.textContent,
        type: toast.getAttribute('data-toast-type'),
        hasManual: toast.hasAttribute('data-toast-manual'),
      };

      return { before, after };
    });

    expect(result.before.message).toBe('Loading...');
    expect(result.before.type).toBe('info');
    expect(result.after.message).toBe('Done!');
    expect(result.after.type).toBe('success');
    expect(result.after.hasManual).toBe(false); // timeout > 0 removes manual
  });

  test('toast.dismiss() sets data-dismissing', async () => {
    await page.evaluate(() => {
      document.querySelector('[data-overlay-toast-container]')?.remove();
    });

    const result = await page.evaluate(async () => {
      const { createOverlayService } = await import('@emkodev/emroute/overlay');
      const overlay = createOverlayService();

      const handle = overlay.toast({ message: 'Bye', timeout: 0 });
      const toast = document.querySelector('[data-overlay-toast]') as HTMLElement;
      const beforeDismiss = toast.hasAttribute('data-dismissing');

      handle.dismiss();
      const afterDismiss = toast.hasAttribute('data-dismissing');

      return { beforeDismiss, afterDismiss };
    });

    expect(result.beforeDismiss).toBe(false);
    expect(result.afterDismiss).toBe(true);
  });

  // ── Confirmation toast ──────────────────────────────────────────────

  test('confirmation toast shows buttons and resolves on confirm click', async () => {
    await page.evaluate(() => {
      document.querySelector('[data-overlay-toast-container]')?.remove();
    });

    const result = await page.evaluate(async () => {
      const { createOverlayService } = await import('@emkodev/emroute/overlay');
      const overlay = createOverlayService();

      const handle = overlay.toast({
        message: 'Delete item?',
        type: 'warning',
        confirm: 'Delete',
        reject: 'Cancel',
      });

      const toast = document.querySelector('[data-overlay-toast]') as HTMLElement;
      const confirmBtn = toast.querySelector('[data-toast-confirm]') as HTMLElement;
      const rejectBtn = toast.querySelector('[data-toast-reject]') as HTMLElement;

      const buttonsVisible = {
        confirmHidden: confirmBtn.hidden,
        confirmText: confirmBtn.textContent,
        rejectHidden: rejectBtn.hidden,
        rejectText: rejectBtn.textContent,
      };

      // Click confirm
      confirmBtn.click();
      const resolved = await (handle as unknown as PromiseLike<boolean>);

      return { buttonsVisible, resolved };
    });

    expect(result.buttonsVisible.confirmHidden).toBe(false);
    expect(result.buttonsVisible.confirmText).toBe('Delete');
    expect(result.buttonsVisible.rejectHidden).toBe(false);
    expect(result.buttonsVisible.rejectText).toBe('Cancel');
    expect(result.resolved).toBe(true);
  });

  test('confirmation toast resolves false on reject click', async () => {
    await page.evaluate(() => {
      document.querySelector('[data-overlay-toast-container]')?.remove();
    });

    const result = await page.evaluate(async () => {
      const { createOverlayService } = await import('@emkodev/emroute/overlay');
      const overlay = createOverlayService();

      const handle = overlay.toast({
        message: 'Are you sure?',
        confirm: 'Yes',
        reject: 'No',
      });

      const toast = document.querySelector('[data-overlay-toast]') as HTMLElement;
      const rejectBtn = toast.querySelector('[data-toast-reject]') as HTMLElement;

      rejectBtn.click();
      return await (handle as unknown as PromiseLike<boolean>);
    });

    expect(result).toBe(false);
  });

  // ── Escape hatch ──────────────────────────────────────────────────

  test('render() escape hatch gives full control', async () => {
    await page.evaluate(() => {
      document.querySelector('[data-overlay-toast-container]')?.remove();
    });

    const result = await page.evaluate(async () => {
      const { createOverlayService } = await import('@emkodev/emroute/overlay');
      const overlay = createOverlayService();

      overlay.toast({
        render(el) {
          el.innerHTML = '<strong>Custom!</strong>';
        },
      });

      const toast = document.querySelector('[data-overlay-toast]') as HTMLElement;
      return toast?.innerHTML;
    });

    expect(result).toBe('<strong>Custom!</strong>');
  });
});
