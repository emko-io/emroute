import { WidgetComponent } from '@emkodev/emroute';

interface ClockData {
  /** ISO timestamp from `getData()` — captured server-side in SSR, client-side in SPA. */
  iso: string;
}

class ClockWidget extends WidgetComponent<Record<string, never>, ClockData> {
  override readonly name = 'clock';

  private timer?: number;

  override getData(): Promise<ClockData> {
    return Promise.resolve({ iso: new Date().toISOString() });
  }

  override renderHTML({ data }: this['RenderArgs']): string {
    if (!data) return '<time>--:--:--</time>';
    return `<time datetime="${data.iso}">${formatTime(data.iso)}</time>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']): string {
    if (!data) return '`--:--:--`';
    return `\`${formatTime(data.iso)}\``;
  }

  override hydrate(): void {
    const el = this.element?.shadowRoot?.querySelector('time');
    if (!el) return;

    this.timer = globalThis.setInterval(() => {
      const now = new Date();
      el.textContent = formatTime(now.toISOString());
      el.setAttribute('datetime', now.toISOString());
    }, 1000);
  }

  override destroy(): void {
    if (this.timer !== undefined) {
      globalThis.clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default new ClockWidget();
