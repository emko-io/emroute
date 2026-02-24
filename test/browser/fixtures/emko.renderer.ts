import { MarkdownElement } from '@emkodev/emroute/spa';
import type { MarkdownRenderer } from '@emkodev/emroute';
import { renderMarkdown } from '@emkodev/emkoma/render';

MarkdownElement.setRenderer(
  { render: renderMarkdown } satisfies MarkdownRenderer,
);
