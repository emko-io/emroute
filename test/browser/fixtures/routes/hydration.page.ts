import { PageComponent } from '@emkodev/emroute';

class HydrationPage extends PageComponent {
  override readonly name = 'hydration';

  override getData() {
    return Promise.resolve(null);
  }

  override getTitle() {
    return 'Hydration Test';
  }

  override renderHTML() {
    return '<widget-hydration-test></widget-hydration-test>';
  }

  override renderMarkdown() {
    return '# Hydration Test\n\n```widget-hydration-test\n```';
  }
}

export default new HydrationPage();
