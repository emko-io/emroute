import { PageComponent } from '@emkodev/emroute';

class LevelThreeTsMdPage extends PageComponent {
  override readonly name = 'level-three-ts-md';

  override getData() {
    return Promise.resolve(null);
  }
}

export default new LevelThreeTsMdPage();
