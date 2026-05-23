import { WidgetComponent } from '@emkodev/emroute';

interface PreactCounterParams {
  start?: string;
  label?: string;
}

class PreactCounterWidget extends WidgetComponent<PreactCounterParams, null> {
  override readonly name = 'preact-counter';

  override renderHTML({ params }: this['RenderArgs']): string {
    const start = Number(params.start ?? 0);
    const label = params.label ?? 'clicks';
    return `<div class="mount">
      <button type="button" disabled>
        <span class="count">${start}</span>
        <span class="label">${label}</span>
      </button>
      <small class="note">SSR placeholder — Preact takes over on hydrate</small>
    </div>`;
  }

  override renderMarkdown({ params }: this['RenderArgs']): string {
    const start = Number(params.start ?? 0);
    const label = params.label ?? 'clicks';
    return `*Interactive Preact counter starting at ${start} ${label}*`;
  }

  override async hydrate({ params }: this['RenderArgs']): Promise<void> {
    const [{ h, render }, { useState }] = await Promise.all([
      import('preact'),
      import('preact/hooks'),
    ]);

    const start = Number(params.start ?? 0);
    const label = (params.label ?? 'clicks') as string;

    const Counter = () => {
      const [n, setN] = useState(start);
      return h(
        'button',
        { type: 'button', onClick: () => setN(n + 1) },
        h('span', { className: 'count' }, n),
        ' ',
        h('span', { className: 'label' }, label),
      );
    };

    const mount = this.element?.shadowRoot?.querySelector('.mount');
    if (mount) {
      mount.innerHTML = '';
      render(h(Counter, null), mount as Element);
    }
  }
}

export default new PreactCounterWidget();
