import { describe, expect, test } from 'bun:test';
import { rewriteMdLinks } from '../../src/util/md.util.ts';

const BASE = '/md';
const SKIP = ['/md', '/html'];

describe('rewriteMdLinks', () => {
  test('rewrites inline absolute links', () => {
    expect(rewriteMdLinks('[About](/about)', BASE, SKIP))
      .toBe('[About](/md/about)');
  });

  test('rewrites multiple inline links on one line', () => {
    expect(rewriteMdLinks('[A](/a) and [B](/b)', BASE, SKIP))
      .toBe('[A](/md/a) and [B](/md/b)');
  });

  test('rewrites reference-style links', () => {
    expect(rewriteMdLinks('[about]: /about', BASE, SKIP))
      .toBe('[about]: /md/about');
  });

  test('skips links already under md base', () => {
    expect(rewriteMdLinks('[About](/md/about)', BASE, SKIP))
      .toBe('[About](/md/about)');
  });

  test('skips links already under html base', () => {
    expect(rewriteMdLinks('[About](/html/about)', BASE, SKIP))
      .toBe('[About](/html/about)');
  });

  test('skips external URLs', () => {
    expect(rewriteMdLinks('[Ext](https://example.com)', BASE, SKIP))
      .toBe('[Ext](https://example.com)');
  });

  test('skips relative links', () => {
    expect(rewriteMdLinks('[Rel](./about)', BASE, SKIP))
      .toBe('[Rel](./about)');
  });

  test('skips fragment-only links', () => {
    expect(rewriteMdLinks('[Frag](#section)', BASE, SKIP))
      .toBe('[Frag](#section)');
  });

  test('skips links inside fenced code blocks', () => {
    const md = '```\n[About](/about)\n```';
    expect(rewriteMdLinks(md, BASE, SKIP)).toBe(md);
  });

  test('resumes rewriting after code block ends', () => {
    const md = '```\n[A](/a)\n```\n[B](/b)';
    expect(rewriteMdLinks(md, BASE, SKIP))
      .toBe('```\n[A](/a)\n```\n[B](/md/b)');
  });

  test('handles links with title attribute', () => {
    expect(rewriteMdLinks('[About](/about "About page")', BASE, SKIP))
      .toBe('[About](/md/about "About page")');
  });

  test('preserves non-link content', () => {
    const md = '# Hello\n\nSome text without links.';
    expect(rewriteMdLinks(md, BASE, SKIP)).toBe(md);
  });

  test('works with custom base paths', () => {
    expect(rewriteMdLinks('[About](/about)', '/api/md', ['/api/md', '/api/html']))
      .toBe('[About](/api/md/about)');
  });

  test('reference-style with extra whitespace', () => {
    expect(rewriteMdLinks('[ref]:   /about', BASE, SKIP))
      .toBe('[ref]:   /md/about');
  });
});
