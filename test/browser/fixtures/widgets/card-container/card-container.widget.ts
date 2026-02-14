/**
 * Card Container Widget
 *
 * Demonstrates nested widget resolution by rendering other widgets inside.
 */

import { WidgetComponent } from '@emkodev/emroute';

interface CardData {
  title: string;
  count: number;
}

class CardContainerWidget extends WidgetComponent<{ title?: string }, CardData> {
  override readonly name = 'card-container';

  override getData({ params }: this['DataArgs']): Promise<CardData> {
    console.log('[CardContainer] getData called with params:', params);
    return Promise.resolve({
      title: params.title ?? 'Card Container',
      count: 42,
    });
  }

  override renderHTML({ data }: this['RenderArgs']): string {
    if (!data) return '<div>Loading...</div>';

    return `
      <div class="card-container" style="border: 2px solid #3b82f6; padding: 1rem; margin: 1rem 0; border-radius: 8px;">
        <h3 style="color: #3b82f6; margin-top: 0;">${data.title}</h3>
        <p>This card contains nested widgets rendered by the server:</p>

        <div style="background: #eff6ff; padding: 1rem; margin: 0.5rem 0; border-radius: 4px;">
          <strong>Counter Widget:</strong>
          <widget-counter-vanilla></widget-counter-vanilla>
        </div>

        <div style="background: #f0fdf4; padding: 1rem; margin: 0.5rem 0; border-radius: 4px;">
          <strong>Greeting Widget:</strong>
          <widget-greeting name="Nested"></widget-greeting>
        </div>

        <div style="background: #fef3c7; padding: 1rem; margin: 0.5rem 0; border-radius: 4px;">
          <strong>Info Card Widget:</strong>
          <widget-info-card title="Nested Info" description="This is nested inside the card container"></widget-info-card>
        </div>
      </div>
    `;
  }

  override renderMarkdown({ data }: this['RenderArgs']): string {
    if (!data) return '';

    return `## ${data.title}

Nested widgets demonstration.

\`\`\`widget:greeting
{"name": "Markdown Nested"}
\`\`\`

\`\`\`widget:counter-vanilla
{}
\`\`\`
`;
  }
}

export const cardContainerWidget = new CardContainerWidget();
