// @ts-types="../../../server/vendor/emko-md.vendor.d.ts"
import { createMarkdownRender } from '../../../server/vendor/emko-md.vendor.js';
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
