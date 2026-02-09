/**
 * Info Card Widget — Test Fixture
 *
 * A widget with multiple params that demonstrates attribute-based
 * parameter passing and server-side rendering.
 *
 * - Params: title (required), description (optional), badge (optional)
 * - getData() echoes params into structured data
 * - renderHTML() produces a card with badge, title, and description
 * - renderMarkdown() produces a single formatted line
 *
 * Used by:
 * - routes/widgets.page.md (fenced widget block with JSON params)
 * - routes/widgets-html.page.html (widget tag with HTML attributes)
 *
 * Tests param handling:
 * - In markdown: params come from JSON inside the fenced block
 * - In HTML: params come from element attributes (kebab-case to camelCase)
 * - SSR: resolveWidgetTags parses attributes, passes to getData()
 * - SPA: ComponentElement.connectedCallback parses attributes
 */

import { WidgetComponent } from '@emkodev/emroute';

interface InfoCardData {
  title: string;
  description: string;
  badge: string;
}

class InfoCardWidget extends WidgetComponent<
  { title: string; description?: string; badge?: string },
  InfoCardData
> {
  override readonly name = 'info-card';

  override async getData({
    params,
  }: {
    params: { title: string; description?: string; badge?: string };
  }) {
    return {
      title: params.title,
      description: params.description ?? 'No description provided.',
      badge: params.badge ?? 'info',
    };
  }

  override renderHTML({
    data,
  }: {
    data: InfoCardData | null;
    params: Record<string, unknown>;
  }) {
    if (!data) return '<div class="widget-info-card">Loading...</div>';
    return `<div class="widget-info-card">
  <span class="info-badge">${data.badge}</span>
  <h3 class="info-title">${data.title}</h3>
  <p class="info-desc">${data.description}</p>
</div>`;
  }

  override renderMarkdown({
    data,
  }: {
    data: InfoCardData | null;
    params: Record<string, unknown>;
  }) {
    if (!data) return '';
    return `**[${data.badge}] ${data.title}**: ${data.description}`;
  }
}

export const infoCardWidget = new InfoCardWidget();
