import { PageComponent } from '@emkodev/emroute';

class LevelThreeTsHtmlPage extends PageComponent {
  override readonly name = 'level-three-ts-html';

  override getData() {
    return Promise.resolve(null);
  }
}

export default new LevelThreeTsHtmlPage();
