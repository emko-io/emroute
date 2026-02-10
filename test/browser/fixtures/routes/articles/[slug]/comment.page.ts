import { escapeHtml, PageComponent } from '@emkodev/emroute';

interface CommentData {
  comments: Array<{ id: string; author: string; date: string; body: string }>;
}

class CommentPage extends PageComponent<{ slug: string }, CommentData> {
  override readonly name = 'comment';

  override getData({ params }: { params: { slug: string } }) {
    return Promise.resolve({
      comments: [
        {
          id: '1',
          author: 'Dave',
          date: '2025-04-20',
          body: `Great article on "${params.slug}". Really helped me understand the concepts.`,
        },
        {
          id: '2',
          author: 'Eve',
          date: '2025-04-21',
          body: 'Very clear explanation, thanks for writing this!',
        },
        {
          id: '3',
          author: 'Frank',
          date: '2025-04-22',
          body: 'Could you do a follow-up covering edge cases?',
        },
      ],
    });
  }

  override renderHTML(
    { data }: { data: CommentData | null; params: { slug: string } },
  ): string {
    if (!data) return '<p>Loading comments...</p>';
    const items = data.comments.map((c) =>
      `<div style="padding:0.75rem;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:0.5rem">
        <div style="display:flex;gap:0.5rem;align-items:baseline;margin-bottom:0.25rem">
          <strong style="color:#0f172a">${escapeHtml(c.author)}</strong>
          <time style="color:#94a3b8;font-size:0.8rem">${c.date}</time>
        </div>
        <p style="margin:0;color:#475569">${escapeHtml(c.body)}</p>
      </div>`
    ).join('\n');
    return `<section style="margin-top:1.5rem">
  <h2 style="font-size:1.25rem;margin-bottom:1rem">Comments (${data.comments.length})</h2>
  ${items}
</section>`;
  }

  override renderMarkdown(
    { data }: { data: CommentData | null; params: { slug: string } },
  ): string {
    if (!data) return '';
    return `## Comments\n\n${
      data.comments.map((c) => `**${c.author}** (${c.date}): ${c.body}`).join('\n\n')
    }`;
  }
}

export default new CommentPage();
