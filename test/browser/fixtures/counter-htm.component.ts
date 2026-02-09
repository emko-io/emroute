// deno-lint-ignore-file no-explicit-any no-import-prefix
import { Component } from '@emkodev/emroute';

interface CounterData {
  initial: number;
}

const STYLES = `<style>
.c-counter-htm {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  background: #f0fff4;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin: 1rem 0;
}
.c-counter-htm__display {
  font-size: 1.125rem;
  min-width: 6rem;
  margin: 0;
}
.c-counter-htm__btn {
  width: 2rem;
  height: 2rem;
  border: 1px solid #6ee7b7;
  border-radius: 6px;
  background: #fff;
  font-size: 1.125rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background .15s;
}
.c-counter-htm__btn:hover {
  background: #d1fae5;
}
</style>`;

class CounterHtmComponent extends Component<{ start?: string }, CounterData> {
  override readonly name = 'counter-htm';

  private static preact: {
    html: any;
    render: any;
    useState: any;
    useEffect: any;
  } | null = null;

  override async getData({ params }: { params: { start?: string } }) {
    if (!CounterHtmComponent.preact) {
      const { html, render } = (await import(
        'https://esm.sh/htm@3/preact?deps=preact@10'
      )) as {
        html: any;
        render: any;
      };
      const { useState, useEffect } = (await import(
        'https://esm.sh/preact@10/hooks'
      )) as { useState: any; useEffect: any };
      CounterHtmComponent.preact = { html, render, useState, useEffect };
    }
    const initial = parseInt(params.start ?? '0', 10);
    return { initial };
  }

  override renderHTML({
    data,
  }: {
    data: CounterData | null;
    params: { start?: string };
  }) {
    if (!data) return '';
    const initial = data.initial;
    const { html, render, useState, useEffect } = CounterHtmComponent.preact!;
    queueMicrotask(() => {
      const el = document.querySelector(
        '[data-island="counter-htm"]:not([data-hydrated])',
      );
      if (!el) return;
      el.setAttribute('data-hydrated', '');
      const Counter = ({ start }: { start: number }) => {
        const [count, setCount] = useState(start);
        const [time, setTime] = useState(new Date().toLocaleTimeString());
        useEffect(() => {
          const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
          return () => clearInterval(id);
        }, []);

        return html`
          <div class="c-counter-htm">
            <button
              class="c-counter-htm__btn"
              onClick="${() => setCount((c: number) => c - 1)}"
            >
              −
            </button>
            <p class="c-counter-htm__display">
              Count: <strong>${count}</strong>
            </p>
            <button
              class="c-counter-htm__btn"
              onClick="${() => setCount((c: number) => c + 1)}"
            >
              +
            </button>
            <p class="c-counter-htm__display">
              🕐 <strong>${time}</strong>
            </p>
          </div>
        `;
      };
      render(
        html`
          <${Counter} start="${initial}" />
        `,
        el,
      );
    });
    return `${STYLES}<div class="c-counter-htm" data-island="counter-htm"></div>`;
  }

  override renderMarkdown({
    data,
  }: {
    data: CounterData | null;
    params: { start?: string };
  }) {
    if (!data) return '';
    return `**Counter (htm):** ${data.initial}`;
  }
}

export default new CounterHtmComponent();
