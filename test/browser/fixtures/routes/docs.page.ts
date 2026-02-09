import { type ComponentContext, PageComponent } from '@emkodev/emroute';

class DocsPage extends PageComponent {
  override readonly name = 'docs';

  override getTitle() {
    return 'Documentation';
  }

  override renderHTML(
    { params, context }: {
      data: unknown;
      params: Record<string, string>;
      context?: ComponentContext;
    },
  ) {
    const template = context?.files?.html ?? '<h1>Docs</h1>';
    return template.replaceAll('{{topic}}', params.topic ?? 'general');
  }

  override renderMarkdown() {
    return '# Docs';
  }
}

export default new DocsPage();
