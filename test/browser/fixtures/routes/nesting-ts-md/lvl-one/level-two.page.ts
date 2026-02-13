import { PageComponent } from '@emkodev/emroute';

class LevelTwoTsMdPage extends PageComponent {
  override readonly name = 'level-two-ts-md';

  override getData() {
    return Promise.resolve(null);
  }
}

export default new LevelTwoTsMdPage();
