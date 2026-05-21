import { escapeHtml } from '@emkodev/emroute';

const CHUNK_LINE = /^<!--==chunk(?::([a-z][a-z0-9-]*))?==-->$/;

export interface NamedChunk {
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
export function parseChunks(md: string): NamedChunk[] {
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

/** Remove chunk markers (outside code blocks) and collapse blank-line runs. */
export function stripChunkMarkers(md: string): string {
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

/** Wrap markdown content in a `<mark-down>` element with proper escaping. */
export function wrapMarkdown(content: string): string {
  return `<mark-down>${escapeHtml(content)}</mark-down>`;
}

/**
 * Render a section landing: hero + responsive card grid + optional detail
 * and outro. Picks chunks by name:
 *
 * - `hero`    — full-width header (h1 + tagline)
 * - `card`    — grid item (one per chunk)
 * - `detail`  — full-width content below the card grid
 * - `outro`   — small trailing paragraph
 *
 * Card count drives the grid class (`two`, three default, `four`).
 */
export function renderSectionLanding(md: string): string {
  const chunks = parseChunks(md);
  if (chunks.length === 0) return '';
  const byName = (n: string) => chunks.filter((c) => c.name === n);
  const hero = byName('hero')[0]?.content ?? chunks[0]!.content;
  const cards = byName('card');
  const detail = byName('detail')[0]?.content;
  const outro = byName('outro')[0]?.content;

  const heroHtml = `<header class="section-hero">${wrapMarkdown(hero)}</header>`;
  const gridClass = cards.length === 2 ? ' two' : cards.length === 4 ? ' four' : '';
  const cardsHtml = cards.length === 0
    ? ''
    : `<div class="section-cards${gridClass}">${cards
        .map((c) => `<article class="section-card">${wrapMarkdown(c.content)}</article>`)
        .join('')}</div>`;
  const detailHtml = detail
    ? `<section class="section-detail">${wrapMarkdown(detail)}</section>`
    : '';
  const outroHtml = outro
    ? `<p class="section-outro">${wrapMarkdown(outro)}</p>`
    : '';

  return `${heroHtml}${cardsHtml}${detailHtml}${outroHtml}`;
}
