import { PageComponent, escapeHtml } from '@emkodev/emroute';

const CHUNK_LINE = /^<!--==chunk(?::([a-z][a-z0-9-]*))?==-->$/;

interface NamedChunk {
  name: string;
  content: string;
}

/**
 * Split a markdown source by chunk markers, ignoring markers that appear
 * inside fenced code blocks. Each marker must occupy its own line.
 *
 * - `<!--==chunk==-->`        — anonymous chunk
 * - `<!--==chunk:name==-->`   — named chunk
 */
function parseChunks(md: string): NamedChunk[] {
  const lines = md.split('\n');
  const chunks: NamedChunk[] = [];
  let currentName = '';
  let buffer: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      buffer.push(line);
      continue;
    }
    if (!inCodeBlock) {
      const match = line.match(CHUNK_LINE);
      if (match) {
        const content = buffer.join('\n').trim();
        if (content) chunks.push({ name: currentName, content });
        currentName = match[1] ?? '';
        buffer = [];
        continue;
      }
    }
    buffer.push(line);
  }
  const tail = buffer.join('\n').trim();
  if (tail) chunks.push({ name: currentName, content: tail });
  return chunks;
}

function stripChunkMarkers(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inCodeBlock = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      out.push(line);
      continue;
    }
    if (!inCodeBlock && CHUNK_LINE.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function wrapMarkdown(content: string): string {
  return `<mark-down>${escapeHtml(content)}</mark-down>`;
}

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
