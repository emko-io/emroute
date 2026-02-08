import { PageComponent } from '@emkodev/emroute';

class CrashPage extends PageComponent {
  override readonly name = 'crash';

  override getData(): Promise<never> {
    throw new Error('Simulated crash');
  }

  override renderHTML() {
    return '<p>Should not render</p>';
  }

  override renderMarkdown() {
    return 'Should not render';
  }
}

export default new CrashPage();
