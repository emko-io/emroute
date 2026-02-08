import { PageComponent, type PageContext } from '@emkodev/emroute';

class BlogPage extends PageComponent {
  override readonly name = 'blog';

  override getTitle() {
    return 'Blog';
  }

  override renderHTML(
    { context }: { data: unknown; params: Record<string, string>; context?: PageContext },
  ) {
    const md = context?.files?.md ?? '';
    return `<mark-down>${md}</mark-down>\n<p class="blog-footer">Posts: 0</p>`;
  }

  override renderMarkdown(
    { context }: { data: unknown; params: Record<string, string>; context?: PageContext },
  ) {
    return context?.files?.md ?? '';
  }
}

export default new BlogPage();
