import { PageComponent } from '@emkodev/emroute';

class NestingTsMdPage extends PageComponent {
  override readonly name = 'nesting-ts-md';

  override getData() {
    return Promise.resolve(null);
  }
}

export default new NestingTsMdPage();
