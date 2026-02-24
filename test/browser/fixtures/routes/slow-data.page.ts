import { PageComponent } from '@emkodev/emroute';

declare const globalThis: { // eslint-disable-line no-shadow-restricted-names
  __slow_data_entered?: (signal?: AbortSignal) => void;
  __slow_data_resolved?: boolean;
} & typeof window;

interface SlowData {
  value: string;
}

class SlowDataPage extends PageComponent<Record<string, string>, SlowData> {
  override readonly name = 'slow-data';

  override async getData({ signal }: this['DataArgs']) {
    // Signal the test that getData has been entered, passing the abort signal
    globalThis.__slow_data_entered?.(signal);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => resolve(), 5000);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason);
      }, { once: true });
    });

    globalThis.__slow_data_resolved = true;
    return { value: 'slow-data-loaded' };
  }

  override renderHTML({ data }: this['RenderArgs']) {
    if (!data) return '<p>Loading slow data...</p>';
    return `<h1>Slow Data</h1><p id="slow-result">${data.value}</p>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']) {
    if (!data) return '# Loading...';
    return `# Slow Data\n\n${data.value}`;
  }
}

export default new SlowDataPage();
