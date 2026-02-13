import { PageComponent } from '@emkodev/emroute';

class LevelTwoTsHtmlPage extends PageComponent {
  override readonly name = 'level-two-ts-html';

  override getData() {
    return Promise.resolve(null);
  }
}

export default new LevelTwoTsHtmlPage();
