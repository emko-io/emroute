import { PageComponent } from '@emkodev/emroute';

class BrokenProjectPage extends PageComponent {
  override readonly name = 'broken-project';

  override getData(): Promise<never> {
    throw new Error('Project load failed');
  }

  override renderHTML() {
    return '<p>Should not render</p>';
  }

  override renderMarkdown() {
    return 'Should not render';
  }
}

export default new BrokenProjectPage();
