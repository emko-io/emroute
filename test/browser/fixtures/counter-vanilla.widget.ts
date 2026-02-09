import { WidgetComponent } from '@emkodev/emroute';

interface CounterData {
  initial: number;
}

const STYLES = `<style>
.c-counter-vanilla {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  background: #eff6ff;
  border: 1px solid #93c5fd;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin: 1rem 0;
}
.c-counter-vanilla__display {
  font-size: 1.125rem;
  min-width: 4rem;
  margin: 0;
}
.c-counter-vanilla__btn {
  width: 2rem;
  height: 2rem;
  border: 1px solid #93c5fd;
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
.c-counter-vanilla__btn:hover {
  background: #dbeafe;
}
</style>`;

class CounterVanillaWidget extends WidgetComponent<{ start?: string }, CounterData> {
  override readonly name = 'counter-vanilla';

  override async getData({ params }: { params: { start?: string } }) {
    return { initial: parseInt(params.start ?? '0', 10) };
  }

  override renderHTML({ data }: { data: CounterData | null; params: { start?: string } }) {
    if (!data) return '';
    const dec = `this.parentElement.querySelector('[data-count]').textContent=Number(this.parentElement.querySelector('[data-count]').textContent)-1`;
    const inc = `this.parentElement.querySelector('[data-count]').textContent=Number(this.parentElement.querySelector('[data-count]').textContent)+1`;
    return `${STYLES}<div class="c-counter-vanilla">
  <button class="c-counter-vanilla__btn" onclick="${dec}">−</button>
  <p class="c-counter-vanilla__display">Count: <strong data-count>${data.initial}</strong></p>
  <button class="c-counter-vanilla__btn" onclick="${inc}">+</button>
</div>`;
  }

  override renderMarkdown({ data }: { data: CounterData | null; params: { start?: string } }) {
    if (!data) return '';
    return `**Counter (vanilla):** ${data.initial}`;
  }
}

export const counterVanillaWidget = new CounterVanillaWidget();