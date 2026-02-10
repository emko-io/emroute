import { escapeHtml, WidgetComponent } from '@emkodev/emroute';

interface ArticleCardParams {
  slug: string;
  title: string;
  summary: string;
  author?: string;
  date?: string;
  'read-time'?: string;
}

interface ArticleCardData {
  slug: string;
  title: string;
  summary: string;
  author: string;
  date: string;
  readTime: string;
}

class ArticleCardWidget extends WidgetComponent<ArticleCardParams, ArticleCardData> {
  override readonly name = 'article-card';

  override getData({ params }: { params: ArticleCardParams }) {
    return Promise.resolve({
      slug: params.slug ?? '',
      title: params.title ?? 'Untitled',
      summary: params.summary ?? '',
      author: params.author ?? '',
      date: params.date ?? '',
      readTime: params['read-time'] ?? '',
    });
  }

  override renderHTML(
    { data }: { data: ArticleCardData | null; params: ArticleCardParams },
  ): string {
    if (!data) return '<div class="article-card">Loading...</div>';
    const meta = [data.author, data.date, data.readTime ? `${data.readTime} min` : '']
      .filter(Boolean)
      .join(' &middot; ');
    return `<a href="/articles/${
      escapeHtml(data.slug)
    }" class="article-card" style="display:block;padding:1rem;border:1px solid #e2e8f0;border-radius:8px;text-decoration:none;color:inherit;transition:box-shadow .15s;margin-bottom:0.75rem">
  <h3 style="margin:0 0 0.25rem;color:#0f172a">${escapeHtml(data.title)}</h3>
  <p style="margin:0 0 0.5rem;color:#475569;font-size:0.9rem">${escapeHtml(data.summary)}</p>
  ${meta ? `<small style="color:#94a3b8">${meta}</small>` : ''}
</a>`;
  }

  override renderMarkdown(
    { data }: { data: ArticleCardData | null; params: ArticleCardParams },
  ): string {
    if (!data) return '';
    const meta = [data.author, data.date, data.readTime ? `${data.readTime} min` : '']
      .filter(Boolean)
      .join(' | ');
    return `**[${data.title}](/articles/${data.slug})**: ${data.summary}${
      meta ? ` (${meta})` : ''
    }`;
  }
}

export const articleCardWidget = new ArticleCardWidget();
