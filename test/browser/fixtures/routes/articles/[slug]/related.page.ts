import { escapeHtml, PageComponent } from '@emkodev/emroute';

interface RelatedData {
  related: Array<{ slug: string; title: string; summary: string }>;
}

const ALL_ARTICLES = [
  {
    slug: 'getting-started',
    title: 'Getting Started with emroute',
    summary: 'Learn the basics of file-based routing.',
  },
  {
    slug: 'file-based-routing',
    title: 'File-Based Routing Explained',
    summary: 'How directory structure maps to URL patterns.',
  },
  {
    slug: 'triple-rendering',
    title: 'Triple Rendering',
    summary: 'SPA, SSR HTML, and SSR Markdown from one codebase.',
  },
  {
    slug: 'widget-system',
    title: 'The Widget System',
    summary: 'Building reusable components that render everywhere.',
  },
  {
    slug: 'nested-routes',
    title: 'Nested Routes and Layouts',
    summary: 'Parent-child route composition with router-slot.',
  },
  {
    slug: 'zero-deps',
    title: 'Zero Dependencies Philosophy',
    summary: 'Why emroute avoids third-party packages.',
  },
];

class RelatedPage extends PageComponent<{ slug: string }, RelatedData> {
  override readonly name = 'related';

  override getData({ params }: this['DataArgs']) {
    return Promise.resolve({
      related: ALL_ARTICLES.filter((a) => a.slug !== params.slug).slice(0, 3),
    });
  }

  override renderHTML({ data }: this['RenderArgs']): string {
    if (!data) return '<p>Loading related articles...</p>';
    const items = data.related.map((a) =>
      `<li style="margin-bottom:0.5rem">
        <a href="/html/articles/${
        escapeHtml(a.slug)
      }" style="color:#0f172a;font-weight:500;text-decoration:none">${escapeHtml(a.title)}</a>
        <br><small style="color:#94a3b8">${escapeHtml(a.summary)}</small>
      </li>`
    ).join('\n');
    return `<section style="margin-top:1.5rem">
  <h2 style="font-size:1.25rem;margin-bottom:1rem">Related Articles</h2>
  <ul style="padding-left:1.25rem">${items}</ul>
</section>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']): string {
    if (!data) return '';
    return `## Related Articles\n\n${
      data.related.map((a) => `- [${a.title}](/html/articles/${a.slug})`).join('\n')
    }`;
  }
}

export default new RelatedPage();
