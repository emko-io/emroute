import { escapeHtml, WidgetComponent } from '@emkodev/emroute';

interface TagCloudData {
  tags: Array<{ name: string; count: number }>;
}

class TagCloudWidget extends WidgetComponent<Record<string, unknown>, TagCloudData> {
  override readonly name = 'tag-cloud';

  override getData() {
    return Promise.resolve({
      tags: [
        { name: 'routing', count: 3 },
        { name: 'architecture', count: 2 },
        { name: 'widgets', count: 2 },
        { name: 'tutorial', count: 1 },
        { name: 'ssr', count: 1 },
        { name: 'rendering', count: 1 },
        { name: 'components', count: 1 },
        { name: 'layout', count: 1 },
        { name: 'philosophy', count: 1 },
        { name: 'beginner', count: 1 },
      ],
    });
  }

  override renderHTML(
    { data }: { data: TagCloudData | null; params: Record<string, unknown> },
  ): string {
    if (!data) return '<p>Loading tags...</p>';
    const badges = data.tags.map((t) => {
      const size = t.count >= 3 ? '1rem' : t.count >= 2 ? '0.9rem' : '0.8rem';
      const weight = t.count >= 2 ? '600' : '400';
      return `<span style="display:inline-block;padding:0.2rem 0.6rem;margin:0.2rem;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;font-size:${size};font-weight:${weight};color:#334155">${
        escapeHtml(t.name)
      } <small style="color:#94a3b8">${t.count}</small></span>`;
    }).join('\n');
    return `<div class="tag-cloud" style="line-height:2">${badges}</div>`;
  }

  override renderMarkdown(
    { data }: { data: TagCloudData | null; params: Record<string, unknown> },
  ): string {
    if (!data) return '';
    return data.tags.map((t) => `\`${t.name}\` (${t.count})`).join(', ');
  }
}

export const tagCloudWidget = new TagCloudWidget();
