import { PageComponent } from '@emkodev/emroute';
import { renderSectionLanding, stripChunkMarkers } from '../../util/chunks.util.ts';

class DecisionsIndexPage extends PageComponent<Record<string, never>, null> {
  override readonly name = 'decisions-index';

  override renderMarkdown({ context }: this['RenderArgs']): string {
    return stripChunkMarkers(context.files?.md ?? '');
  }

  override renderHTML({ context }: this['RenderArgs']): string {
    return renderSectionLanding(context.files?.md ?? '');
  }
}

export default new DecisionsIndexPage();
