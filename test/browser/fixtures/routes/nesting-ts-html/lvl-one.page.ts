import { PageComponent } from '@emkodev/emroute';

class LvlOneTsHtmlPage extends PageComponent {
  override readonly name = 'lvl-one-ts-html';

  override getData() {
    return Promise.resolve(null);
  }
}

export default new LvlOneTsHtmlPage();
