import { WidgetComponent } from '@emkodev/emroute';

// Track browser-side getData calls (resets per page load)
declare global {
  var __hydration_test_calls: number | undefined;
}

interface HydrationData {
  ssrRendered: boolean;
  renderTime: number;
}

class HydrationTestWidget extends WidgetComponent<Record<string, never>, HydrationData> {
  override readonly name = 'hydration-test';
  private clickCount = 0;
  private handleClick = () => {
    this.clickCount++;
    const countSpan = this.element?.querySelector<HTMLElement>('#click-count');
    if (countSpan) {
      countSpan.textContent = String(this.clickCount);
    }
  };

  override getData() {
    // Increment browser-side counter (only exists in browser context)
    if (typeof globalThis !== 'undefined') {
      globalThis.__hydration_test_calls = (globalThis.__hydration_test_calls || 0) + 1;
    }

    const ssrRendered = typeof globalThis === 'undefined';
    return Promise.resolve({
      ssrRendered,
      renderTime: Date.now(),
    });
  }

  override hydrate(): void {
    // Called after rendering (both SSR adoption and SPA navigation)
    const button = this.element?.querySelector<HTMLElement>('#click-counter');
    const statusSpan = this.element?.querySelector<HTMLElement>('#listener-state');

    if (button && statusSpan) {
      button.addEventListener('click', this.handleClick);

      statusSpan.textContent = 'attached';
      statusSpan.setAttribute('data-attached-at', String(Date.now()));
    }
  }

  override renderHTML({ data }: this['RenderArgs']) {
    if (!data) return '<p>Loading...</p>';

    const browserCalls = typeof globalThis !== 'undefined'
      ? globalThis.__hydration_test_calls || 0
      : 'N/A';

    return `<div id="hydration-content" data-ssr="${data.ssrRendered}">
  <h1>Hydration Test</h1>
  <p id="render-context">${data.ssrRendered ? 'SSR rendered' : 'SPA rendered'}</p>
  <p id="render-time">Render time: ${data.renderTime}</p>
  <p id="browser-calls">Browser getData calls: <span id="call-count">${browserCalls}</span></p>

  <div id="interaction-test">
    <p>If DOM is rebuilt, the click listener below will be lost:</p>
    <button id="click-counter">Clicks: <span id="click-count">0</span></button>
    <p id="listener-status">Listener status: <span id="listener-state">unknown</span></p>
  </div>
</div>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']) {
    if (!data) return '';
    return `# Hydration Test\n\nBrowser getData calls: ${
      typeof globalThis !== 'undefined' ? globalThis.__hydration_test_calls || 0 : 'N/A'
    }`;
  }

  override destroy(): void {
    // Remove event listeners to prevent memory leaks
    const button = this.element?.querySelector<HTMLElement>('#click-counter');
    if (button) {
      button.removeEventListener('click', this.handleClick);
    }
  }
}

export const hydrationTestWidget = new HydrationTestWidget();
