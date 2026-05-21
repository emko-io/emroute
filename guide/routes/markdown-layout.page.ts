import { PageComponent } from '@emkodev/emroute';
import { parseChunks, stripChunkMarkers, wrapMarkdown } from '../util/chunks.util.ts';

class MarkdownLayoutPage extends PageComponent<Record<string, never>, null> {
  override readonly name = 'markdown-layout';

  override renderMarkdown({ context }: this['RenderArgs']): string {
    return stripChunkMarkers(context.files?.md ?? '');
  }

  override renderHTML({ context }: this['RenderArgs']): string {
    const css = context.files?.css ?? '';
    const style = css ? `<style>${css}</style>\n` : '';
    const chunks = parseChunks(context.files?.md ?? '');
    if (chunks.length === 0) return style;

    const byName = (n: string) => chunks.filter((c) => c.name === n);
    const intro = byName('intro')[0]?.content ?? chunks[0]!.content;
    const cards = byName('card');
    const note = byName('note')[0]?.content;
    const outro = byName('outro')[0]?.content;

    const introHtml = `<div class="markdown-layout-lead">${wrapMarkdown(intro)}</div>`;
    const cardsHtml = cards.length === 0
      ? ''
      : `<div class="markdown-layout-cards">${cards
          .map((c) => `<div class="markdown-layout-card">${wrapMarkdown(c.content)}</div>`)
          .join('')}</div>`;
    const noteHtml = note ? `<div class="markdown-layout-note">${wrapMarkdown(note)}</div>` : '';
    const outroHtml = outro ? `<div class="markdown-layout-outro">${wrapMarkdown(outro)}</div>` : '';

    return `${style}${introHtml}${cardsHtml}${noteHtml}${outroHtml}`;
  }
}

export default new MarkdownLayoutPage();
