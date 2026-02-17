import { createMarkdownRender } from 'jsr:@emkodev/emko-md@^0.3.0/render';
import { MarkdownElement } from '@emkodev/emroute/spa';
import type { MarkdownRenderer } from '@emkodev/emroute';

let render: (markdown: string) => string;

MarkdownElement.setRenderer(
  {
    init() {
      render = createMarkdownRender();
      return Promise.resolve();
    },
    render(markdown: string): string {
      return render(markdown);
    },
  } satisfies MarkdownRenderer,
);
