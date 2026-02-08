# Markdown Renderers

The `<mark-down>` element requires a markdown renderer to convert markdown to HTML. emroute provides a pluggable `MarkdownRenderer` interface - bring your own parser.

## Interface

```typescript
interface MarkdownRenderer {
  /** Optional async initialization (e.g., load WASM) */
  init?(): Promise<void>;

  /** Convert markdown string to HTML string */
  render(markdown: string): string;
}
```

## Setup

Call `MarkdownIsland.setRenderer()` **before** any `<mark-down>` elements are connected:

```typescript
import { MarkdownIsland } from '@emkodev/emroute';

MarkdownIsland.setRenderer({
  render(markdown: string): string {
    return yourMarkdownParser(markdown);
  },
});
```

---

## Renderers

### @emkodev/hypertext (Recommended)

WASM-based parser with custom widget support.

```typescript
import { MarkdownIsland } from '@emkodev/emroute';
import { WasmCore, WasmMarkdownRenderer } from '@emkodev/hypertext';

let core: WasmCore;
let renderer: WasmMarkdownRenderer;

MarkdownIsland.setRenderer({
  async init() {
    core = new WasmCore({ wasmPath: '/wasm/hypertext_core_bg.wasm' });
    await core.init();
    renderer = new WasmMarkdownRenderer();
  },
  render(markdown: string): string {
    core.setText(markdown);
    const ast = core.parse();
    return renderer.render(ast);
  },
});
```

**Pros:** Fast (WASM), supports fenced widgets, same parser for all contexts
**Cons:** Requires WASM file hosting

---

### marked

Popular, fast, lightweight markdown parser.

```bash
# Deno
deno add npm:marked

# Node
npm install marked
```

```typescript
import { MarkdownIsland } from '@emkodev/emroute';
import { marked } from 'marked';

MarkdownIsland.setRenderer({
  render(markdown: string): string {
    return marked.parse(markdown, { async: false }) as string;
  },
});
```

**With syntax highlighting (highlight.js):**

```typescript
import { marked } from 'marked';
import hljs from 'highlight.js';

marked.setOptions({
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return code;
  },
});

MarkdownIsland.setRenderer({
  render: (md) => marked.parse(md, { async: false }) as string,
});
```

**Pros:** Well-maintained, fast, many plugins
**Cons:** No built-in widget support

---

### markdown-it

Feature-rich with extensive plugin ecosystem.

```bash
deno add npm:markdown-it
```

```typescript
import { MarkdownIsland } from '@emkodev/emroute';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: true, // Enable HTML tags in source
  linkify: true, // Auto-convert URLs to links
  typographer: true, // Smart quotes, dashes
});

MarkdownIsland.setRenderer({
  render: (markdown) => md.render(markdown),
});
```

**With plugins:**

```typescript
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import toc from 'markdown-it-toc-done-right';

const md = new MarkdownIt()
  .use(anchor, { permalink: true })
  .use(toc);

MarkdownIsland.setRenderer({
  render: (markdown) => md.render(markdown),
});
```

**Pros:** Highly extensible, CommonMark compliant, large plugin ecosystem
**Cons:** Slightly larger bundle

---

### micromark

Small, fast, CommonMark compliant.

```bash
deno add npm:micromark
```

```typescript
import { MarkdownIsland } from '@emkodev/emroute';
import { micromark } from 'micromark';

MarkdownIsland.setRenderer({
  render: (markdown) => micromark(markdown),
});
```

**With GFM (GitHub Flavored Markdown):**

```typescript
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';

MarkdownIsland.setRenderer({
  render(markdown: string): string {
    return micromark(markdown, {
      extensions: [gfm()],
      htmlExtensions: [gfmHtml()],
    });
  },
});
```

**Pros:** Tiny bundle, very fast, modular
**Cons:** Extensions required for common features

---

### unified / remark

AST-based with powerful transformation pipeline.

```bash
deno add npm:unified npm:remark-parse npm:remark-html
```

```typescript
import { MarkdownIsland } from '@emkodev/emroute';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkHtml from 'remark-html';

const processor = unified()
  .use(remarkParse)
  .use(remarkHtml);

MarkdownIsland.setRenderer({
  render(markdown: string): string {
    return processor.processSync(markdown).toString();
  },
});
```

**Pros:** AST transformations, huge plugin ecosystem
**Cons:** More complex, larger bundle

---

### showdown

Browser-friendly, two-way conversion.

```bash
deno add npm:showdown
```

```typescript
import { MarkdownIsland } from '@emkodev/emroute';
import showdown from 'showdown';

const converter = new showdown.Converter({
  tables: true,
  ghCodeBlocks: true,
  tasklists: true,
});

MarkdownIsland.setRenderer({
  render: (markdown) => converter.makeHtml(markdown),
});
```

**Pros:** Browser-native, bidirectional (HTML↔MD)
**Cons:** Slower than alternatives

---

## Custom Widget Support

If you need fenced widget blocks (`` ```widget:name ``) to work with non-emko parsers, the `<mark-down>` element handles post-processing automatically. The HTML output just needs to preserve fenced code blocks as:

```html
<pre><code class="language-widget:name">{"key": "value"}</code></pre>
```

Most parsers do this by default for fenced code blocks.

---

## SSR Considerations

For server-side rendering, use the same renderer on both server and client:

```typescript
// shared/markdown.ts
import { marked } from 'marked';

export const markdownRenderer = {
  render: (md: string) => marked.parse(md, { async: false }) as string,
};

// server
import { createSsrHtmlRouter } from '@emkodev/emroute';
// Renderer used internally by components

// client
import { MarkdownIsland } from '@emkodev/emroute';
import { markdownRenderer } from './shared/markdown.ts';
MarkdownIsland.setRenderer(markdownRenderer);
```

---

## Performance Tips

1. **Reuse parser instances** - Don't create new instances per render
2. **Disable unused features** - Most parsers have options to disable features you don't use
3. **Consider WASM** - For heavy markdown processing, WASM parsers (like @emkodev/hypertext) are faster
4. **Lazy load** - Use dynamic imports if markdown isn't needed immediately

```typescript
// Lazy load renderer
MarkdownIsland.setRenderer({
  async init() {
    const { marked } = await import('marked');
    this._marked = marked;
  },
  render(markdown: string): string {
    return this._marked.parse(markdown, { async: false });
  },
});
```
