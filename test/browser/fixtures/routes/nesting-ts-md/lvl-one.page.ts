import { PageComponent } from '@emkodev/emroute';

class LvlOneTsMdPage extends PageComponent {
  override readonly name = 'lvl-one-ts-md';

  override getData() {
    return Promise.resolve(null);
  }
}

export default new LvlOneTsMdPage();
