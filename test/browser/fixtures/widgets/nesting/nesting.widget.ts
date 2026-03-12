/**
 * Nesting Widget — Test Fixture
 *
 * A widget that renders another widget (<widget-greeting>) inside its output.
 * Tests recursive widget resolution: the renderer must resolve the inner
 * widget tag after the outer widget's renderHTML() produces it.
 *
 * Used to verify:
 * - Nested widget resolution works end-to-end
 * - Per-render memoization (greeting module loaded once, not twice)
 */

import { WidgetComponent } from '@emkodev/emroute';

class NestingWidget extends WidgetComponent<Record<string, unknown>, { label: string }> {
  override readonly name = 'nesting';

  override getData() {
    return Promise.resolve({ label: 'Wrapper' });
  }

  override renderHTML({ data }: this['RenderArgs']) {
    if (!data) return '<p>Loading...</p>';
    return `<div class="nesting-widget">
  <p>${data.label}</p>
  <widget-greeting name="Nested"></widget-greeting>
</div>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']) {
    if (!data) return '';
    return `${data.label}:\n\n\`\`\`widget:greeting\n{"name": "Nested"}\n\`\`\``;
  }
}

export const nestingWidget = new NestingWidget();
