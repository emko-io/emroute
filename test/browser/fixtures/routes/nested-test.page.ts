/**
 * Nested Widget Test Page
 *
 * Demonstrates nested widget resolution in SSR.
 */

import { PageComponent } from '@emkodev/emroute';

class NestedTestPage extends PageComponent<Record<string, unknown>, { title: string }> {
  override readonly name = 'nested-test';

  override getData(): Promise<{ title: string }> {
    return Promise.resolve({ title: 'Nested Widget Test' });
  }

  override renderHTML({ data }: this['RenderArgs']): string {
    return `
      <h1>${data?.title ?? 'Loading...'}</h1>
      <p>This page demonstrates nested widgets resolved during SSR. The card-container widget renders other widgets in its renderHTML() method:</p>

      <widget-card-container title="SSR Nested Widgets Demo"></widget-card-container>

      <div style="margin-top: 2rem; padding: 1rem; background: #f8fafc; border-left: 4px solid #3b82f6;">
        <h2 style="margin-top: 0;">How it works:</h2>
        <ol>
          <li>Page renderHTML() outputs <code>&lt;widget-card-container&gt;</code></li>
          <li>SSR resolves card-container widget, calls its getData() and renderHTML()</li>
          <li>card-container.renderHTML() returns HTML with <code>&lt;widget-counter-vanilla&gt;</code>, <code>&lt;widget-greeting&gt;</code>, etc.</li>
          <li>SSR recursively resolves those nested widgets</li>
          <li>Final HTML has all widgets resolved with data-ssr attributes</li>
        </ol>
      </div>
    `;
  }

  override renderMarkdown({ data }: this['RenderArgs']): string {
    return data ? `# ${data.title}\n\nNested widgets test page.` : '';
  }
}

export default new NestedTestPage();
