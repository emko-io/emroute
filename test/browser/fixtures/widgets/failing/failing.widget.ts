import { WidgetComponent } from '@emkodev/emroute';

class FailingWidget extends WidgetComponent {
  override readonly name = 'failing';

  override getData(): Promise<never> {
    return Promise.reject(new Error('Widget data fetch failed'));
  }

  override renderMarkdown(): string {
    return '';
  }
}

export default new FailingWidget();
