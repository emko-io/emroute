import { PageComponent } from '@emkodev/emroute';

class TypescriptLeafPage extends PageComponent {
  override readonly name = 'typescript-leaf';

  override renderHTML(args: this['RenderArgs']): string {
    return '<div class="typescript-leaf"><p>[typescript-leaf] rendered by .ts renderHTML</p></div>';
  }

  override renderMarkdown(args: this['RenderArgs']): string {
    return '[typescript-leaf] rendered by .ts renderMarkdown';
  }
}

export default new TypescriptLeafPage();
