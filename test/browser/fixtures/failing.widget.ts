import { Widget } from '@emkodev/emroute';

class FailingWidget extends Widget {
  override readonly name = 'failing';

  override async getData(): Promise<never> {
    throw new Error('Widget data fetch failed');
  }

  override renderMarkdown(): string {
    return '';
  }
}

export default new FailingWidget();
