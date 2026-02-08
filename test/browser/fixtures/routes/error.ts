import { PageComponent } from '@emkodev/emroute';

class RootErrorHandler extends PageComponent {
  override readonly name = 'root-error';

  override renderHTML() {
    return '<h1>Something Went Wrong</h1><p class="root-error">An unexpected error occurred.</p>';
  }

  override renderMarkdown() {
    return '# Something Went Wrong\n\nAn unexpected error occurred.';
  }
}

export default new RootErrorHandler();
