/**
 * Markdown Link Rewriting
 *
 * Rewrites internal absolute links in markdown to include a base path prefix.
 * Skips fenced code blocks and links already under a known base path.
 */

/** Rewrite internal absolute links in markdown to include the base path prefix. */
export function rewriteMdLinks(markdown: string, base: string, skipPrefixes: string[]): string {
  const prefix = base + '/';
  // Negative lookahead: skip links already under a known base path
  const skip = skipPrefixes.map((p) => p.slice(1) + '/').join('|');
  const inlineRe = new RegExp(`\\]\\(\\/(?!${skip})`, 'g');
  const refRe = new RegExp(`^(\\[[^\\]]+\\]:\\s+)\\/(?!${skip})`, 'g');

  const lines = markdown.split('\n');
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    lines[i] = lines[i].replaceAll(inlineRe, `](${prefix}`);
    lines[i] = lines[i].replaceAll(refRe, `$1${prefix}`);
  }

  return lines.join('\n');
}
