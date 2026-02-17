import { type ComponentContext, WidgetComponent } from '@emkodev/emroute';
import type { OverlayService } from '@emkodev/emroute/overlay';

class OverlayDemoWidget extends WidgetComponent {
  override readonly name = 'overlay-demo';
  private bindTimer: ReturnType<typeof setTimeout> | null = null;

  override getData() {
    return Promise.resolve(null);
  }

  override renderHTML(
    { context }: { data: unknown; params: Record<string, string>; context?: ComponentContext },
  ): string {
    const overlay = (context as Record<string, unknown> | undefined)?.overlay;
    if (!overlay || typeof overlay !== 'object' || !('modal' in overlay)) {
      return '<p>overlay service not wired into context</p>';
    }

    const host = this.element;
    if (host) {
      // Defer binding until after the last innerHTML update.
      // renderHTML is called twice (loading → ready); clearTimeout cancels the
      // first so only the final render's buttons get listeners.
      if (this.bindTimer) clearTimeout(this.bindTimer);
      this.bindTimer = setTimeout(() => this.bind(host, overlay as OverlayService), 0);
    }

    return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:1rem 0">
  <button data-action="modal" style="padding:8px 16px;border-radius:6px;border:1px solid #94a3b8;background:#fff;cursor:pointer">Open Modal</button>
  <button data-action="toast" style="padding:8px 16px;border-radius:6px;border:1px solid #94a3b8;background:#fff;cursor:pointer">Show Toast</button>
  <button data-action="popover" style="padding:8px 16px;border-radius:6px;border:1px solid #94a3b8;background:#fff;cursor:pointer">Show Popover</button>
  <button data-action="dismiss-all" style="padding:8px 16px;border-radius:6px;border:1px solid #ef4444;color:#ef4444;background:#fff;cursor:pointer">Dismiss All</button>
</div>`;
  }

  private bind(host: HTMLElement, overlay: OverlayService): void {
    const root = host.shadowRoot ?? host;
    for (const btn of root.querySelectorAll<HTMLElement>('[data-action]')) {
      const action = btn.dataset.action!;
      btn.addEventListener('click', () => this.handleAction(action, overlay, btn));
    }
  }

  private handleAction(action: string, overlay: OverlayService, anchor: HTMLElement): void {
    switch (action) {
      case 'modal':
        overlay.modal({
          render(dialog) {
            dialog.innerHTML = `
<div style="padding:24px;max-width:400px">
  <h2 style="margin:0 0 12px">Confirm Action</h2>
  <p style="margin:0 0 20px;color:#64748b">Modal opened from widget context via the overlay service.</p>
  <div style="display:flex;gap:8px;justify-content:flex-end">
    <button data-close style="padding:8px 16px;border-radius:6px;border:1px solid #94a3b8;background:#fff;cursor:pointer">Cancel</button>
    <button data-confirm style="padding:8px 16px;border-radius:6px;border:none;background:#3b82f6;color:#fff;cursor:pointer">Confirm</button>
  </div>
</div>`;
            dialog.querySelector('[data-close]')!
              .addEventListener('click', () => overlay.closeModal());
            dialog.querySelector('[data-confirm]')!
              .addEventListener('click', () => overlay.closeModal('confirmed'));
          },
        }).then((result) => {
          if (result === 'confirmed') {
            overlay.toast({
              render(el) {
                el.textContent = 'Action confirmed!';
                el.style.cssText = 'padding:12px 16px';
              },
              timeout: 3000,
            });
          }
        });
        break;

      case 'toast':
        overlay.toast({
          render(el) {
            el.textContent = `Toast at ${new Date().toLocaleTimeString()}`;
            el.style.cssText = 'padding:12px 16px';
          },
          timeout: 5000,
        });
        break;

      case 'popover':
        overlay.popover({
          anchor,
          render(el) {
            el.innerHTML = `
<ul style="list-style:none;margin:0;padding:8px 0;min-width:140px">
  <li style="padding:8px 16px;cursor:pointer" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background=''">Edit</li>
  <li style="padding:8px 16px;cursor:pointer" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background=''">Duplicate</li>
  <li style="padding:8px 16px;cursor:pointer;color:#ef4444" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background=''">Delete</li>
</ul>`;
          },
        });
        break;

      case 'dismiss-all':
        overlay.dismissAll();
        break;
    }
  }

  override renderMarkdown(): string {
    return '**[Overlay Demo — SPA only]**';
  }
}

export const overlayDemoWidget = new OverlayDemoWidget();
