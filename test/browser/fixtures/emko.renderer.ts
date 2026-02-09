import { AstRenderer, initParser, MarkdownParser } from 'jsr:@emkodev/emko-md@0.1.0-beta.2/parser';
import { MarkdownElement } from '@emkodev/emroute/spa';
import type { MarkdownRenderer } from '@emkodev/emroute';

const renderer = new AstRenderer();
let parser: MarkdownParser;

MarkdownElement.setRenderer(
  {
    async init() {
      await initParser({
        module_or_path: new URL('/assets/hypertext_parser_bg.0.1.0-beta.2.wasm', location.origin),
      });
      parser = new MarkdownParser();
    },
    render(markdown: string): string {
      parser.set_text(markdown);
      const ast = JSON.parse(parser.parse_to_json());
      return renderer.render(ast);
    },
  } satisfies MarkdownRenderer,
);
