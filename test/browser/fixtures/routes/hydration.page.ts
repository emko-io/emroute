import { PageComponent } from '@emkodev/emroute';

let getDataCallCount = 0;

class HydrationPage extends PageComponent<
  Record<string, string>,
  { callCount: number; timestamp: number }
> {
  override readonly name = 'hydration';

  override async getData() {
    getDataCallCount++;
    return { callCount: getDataCallCount, timestamp: Date.now() };
  }

  override getTitle() {
    return 'Hydration Test';
  }

  override renderHTML({
    data,
  }: {
    data: { callCount: number; timestamp: number } | null;
    params: Record<string, string>;
  }) {
    if (!data) return '<p>Loading...</p>';
    return `<div id="hydration-content">
  <h1>Hydration Test</h1>
  <p id="call-count">getData called: ${data.callCount}</p>
  <p id="timestamp">Timestamp: ${data.timestamp}</p>
</div>`;
  }

  override renderMarkdown({
    data,
  }: {
    data: { callCount: number; timestamp: number } | null;
    params: Record<string, string>;
  }) {
    if (!data) return '';
    return `# Hydration Test\n\ngetData called: ${data.callCount}`;
  }
}

export default new HydrationPage();
