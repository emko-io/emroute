import { type ComponentContext, escapeHtml, PageComponent } from '@emkodev/emroute';

interface ArticleListItem {
  slug: string;
  title: string;
  summary: string;
  author: string;
  date: string;
  tags: string[];
  readTime: number;
}

interface ArticlesData {
  articles: ArticleListItem[];
}

class ArticlesPage extends PageComponent<Record<string, string>, ArticlesData> {
  override readonly name = 'articles';

  override getData() {
    return Promise.resolve({
      articles: [
        {
          slug: 'getting-started',
          title: 'Getting Started with emroute',
          summary: 'Learn the basics of file-based routing with triple rendering.',
          author: 'Alice',
          date: '2025-03-15',
          tags: ['tutorial', 'beginner'],
          readTime: 5,
        },
        {
          slug: 'file-based-routing',
          title: 'File-Based Routing Explained',
          summary: 'How directory structure maps to URL patterns.',
          author: 'Bob',
          date: '2025-03-20',
          tags: ['routing', 'architecture'],
          readTime: 8,
        },
        {
          slug: 'triple-rendering',
          title: 'Triple Rendering',
          summary: 'SPA, SSR HTML, and SSR Markdown from one codebase.',
          author: 'Alice',
          date: '2025-04-01',
          tags: ['ssr', 'rendering'],
          readTime: 12,
        },
        {
          slug: 'widget-system',
          title: 'The Widget System',
          summary: 'Building reusable components that render everywhere.',
          author: 'Carol',
          date: '2025-04-10',
          tags: ['widgets', 'components'],
          readTime: 10,
        },
        {
          slug: 'nested-routes',
          title: 'Nested Routes and Layouts',
          summary: 'Parent-child route composition with router-slot.',
          author: 'Bob',
          date: '2025-04-18',
          tags: ['routing', 'layout'],
          readTime: 7,
        },
        {
          slug: 'zero-deps',
          title: 'Zero Dependencies Philosophy',
          summary: 'Why emroute avoids third-party packages.',
          author: 'Carol',
          date: '2025-05-01',
          tags: ['philosophy', 'architecture'],
          readTime: 6,
        },
      ],
    });
  }

  override getTitle() {
    return 'Articles';
  }

  override renderHTML(
    { data, context }: {
      data: ArticlesData | null;
      params: Record<string, string>;
      context?: ComponentContext;
    },
  ) {
    if (!context?.isLeaf) {
      return '<router-slot></router-slot>';
    }

    const template = context?.files?.html ?? '<h1>Articles</h1>';
    if (!data) return template;

    const cards = data.articles
      .map((a) =>
        `<widget-article-card slug="${escapeHtml(a.slug)}" title="${
          escapeHtml(a.title)
        }" summary="${escapeHtml(a.summary)}" author="${
          escapeHtml(a.author)
        }" date="${a.date}" read-time="${a.readTime}"></widget-article-card>`
      )
      .join('\n      ');

    return template
      .replaceAll('{{count}}', String(data.articles.length))
      .replaceAll('{{articleCards}}', cards);
  }

  override renderMarkdown({ data }: { data: ArticlesData | null; params: Record<string, string> }) {
    if (!data) return '# Articles';
    const list = data.articles
      .map((a) => `- [${a.title}](/html/articles/${a.slug}) by ${a.author} (${a.readTime} min)`)
      .join('\n');
    return `# Articles\n\n${data.articles.length} articles published.\n\n${list}`;
  }
}

export default new ArticlesPage();
