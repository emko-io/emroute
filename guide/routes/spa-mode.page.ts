import { PageComponent } from '@emkodev/emroute';
import { renderSectionLanding, stripChunkMarkers } from '@guide/chunks.util.ts';

class SpaModePage extends PageComponent<Record<string, never>, null> {
  override readonly name = 'spa-mode';

  override renderMarkdown({ context }: this['RenderArgs']): string {
    return stripChunkMarkers(context.files?.md ?? '');
  }

  override renderHTML({ context }: this['RenderArgs']): string {
    return renderSectionLanding(context.files?.md ?? '');
  }
}

export default new SpaModePage();
