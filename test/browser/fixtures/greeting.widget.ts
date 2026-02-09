/**
 * Greeting Widget — Test Fixture
 *
 * A simple widget that demonstrates server-side widget rendering.
 *
 * - getData() returns a greeting message and timestamp
 * - renderHTML() produces a styled greeting block
 * - renderMarkdown() produces a plain-text greeting
 *
 * Used by:
 * - routes/widgets.page.md (fenced widget block, no params and with params)
 * - routes/widgets-html.page.html (widget tag, no params and with params)
 *
 * SSR HTML: resolveWidgetTags() calls getData() + renderHTML(), injects
 *   rendered content + data-ssr attribute for SPA hydration.
 * SSR Markdown: resolveWidgets() calls getData() + renderMarkdown(),
 *   replaces the fenced block with text output.
 * SPA: ComponentElement registers as <widget-greeting>, client-side
 *   getData() + renderHTML(). Or hydrates from data-ssr if SSR content exists.
 */

import { WidgetComponent } from '@emkodev/emroute';

interface GreetingData {
  message: string;
  timestamp: number;
}

class GreetingWidget extends WidgetComponent<{ name?: string }, GreetingData> {
  override readonly name = 'greeting';

  override async getData({ params }: { params: { name?: string } }) {
    const name = params.name ?? 'World';
    return {
      message: `Hello, ${name}!`,
      timestamp: Date.now(),
    };
  }

  override renderHTML({ data }: { data: GreetingData | null; params: { name?: string } }) {
    if (!data) return '<p>Loading greeting...</p>';
    return `<div class="widget-greeting">
  <p class="greeting-message">${data.message}</p>
  <p class="greeting-time">Rendered at: ${data.timestamp}</p>
</div>`;
  }

  override renderMarkdown({ data }: { data: GreetingData | null; params: { name?: string } }) {
    if (!data) return '';
    return `**${data.message}** (rendered at ${data.timestamp})`;
  }
}

export const greetingWidget = new GreetingWidget();
