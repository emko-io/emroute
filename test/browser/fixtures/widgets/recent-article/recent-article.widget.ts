import { WidgetComponent } from '@emkodev/emroute';

interface RecentArticleData {
  articles: Array<{ slug: string; title: string; date: string }>;
}

class RecentArticleWidget extends WidgetComponent<Record<string, unknown>, RecentArticleData> {
  override readonly name = 'recent-article';

  override getData() {
    return Promise.resolve({
      articles: [
        { slug: 'zero-deps', title: 'Zero Dependencies Philosophy', date: '2025-05-01' },
        { slug: 'nested-routes', title: 'Nested Routes and Layouts', date: '2025-04-18' },
        { slug: 'widget-system', title: 'The Widget System', date: '2025-04-10' },
      ],
    });
  }

  override renderHTML(
    { data }: { data: RecentArticleData | null; params: Record<string, unknown> },
  ): string {
    if (!data) return '<p>Loading recent articles...</p>';
    const items = data.articles.map((a) =>
      `<li style="margin-bottom:0.5rem">
        <a href="/articles/${a.slug}" style="color:#0f172a;text-decoration:none;font-weight:500">${a.title}</a>
        <br><small style="color:#94a3b8">${a.date}</small>
      </li>`
    ).join('\n');
    return `<ol style="padding-left:1.25rem;margin:0">${items}</ol>`;
  }

  override renderMarkdown(
    { data }: { data: RecentArticleData | null; params: Record<string, unknown> },
  ): string {
    if (!data) return '';
    return data.articles
      .map((a, i) => `${i + 1}. [${a.title}](/articles/${a.slug}) — ${a.date}`)
      .join('\n');
  }
}

export const recentArticleWidget = new RecentArticleWidget();
