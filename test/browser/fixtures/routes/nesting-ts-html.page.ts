import { PageComponent } from '@emkodev/emroute';

class NestingTsHtmlPage extends PageComponent {
  override readonly name = 'nesting-ts-html';

  override getData() {
    return Promise.resolve(null);
  }
}

export default new NestingTsHtmlPage();
