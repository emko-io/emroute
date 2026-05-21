import { PageComponent } from '@emkodev/emroute';
import { renderSectionLanding, stripChunkMarkers } from '../../util/chunks.util.ts';

class SetupIndexPage extends PageComponent<Record<string, never>, null> {
  override readonly name = 'setup-index';

  override renderMarkdown({ context }: this['RenderArgs']): string {
    return stripChunkMarkers(context.files?.md ?? '');
  }

  override renderHTML({ context }: this['RenderArgs']): string {
    return renderSectionLanding(context.files?.md ?? '');
  }
}

export default new SetupIndexPage();
