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

Call `MarkdownElement.setRenderer()` **before** any `<mark-down>` elements are connected:

```typescript
import { MarkdownElement } from '@emkodev/emroute/spa';

MarkdownElement.setRenderer({
  render(markdown: string): string {
    return yourMarkdownParser(markdown);
  },
});
```

---

## Renderers

### @emkodev/emko-md (Recommended)

WASM-based parser with widget support. Zero JS dependencies. An editor built
on the same parser is in development.

```bash
deno add jsr:@emkodev/emko-md@^0.1.0-beta.2/parser
```

Requires vendoring the WASM binary (~50KB) into your project. See
[Setting Up emko-md](./setup-emko-md.md) for the full setup guide covering
both client-side and server-side configuration.

**Pros:** Fast (WASM), supports fenced widgets, same parser for all contexts
**Cons:** Requires WASM file hosting, pre-release

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
import { MarkdownElement } from '@emkodev/emroute/spa';
import { marked } from 'marked';

MarkdownElement.setRenderer({
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

MarkdownElement.setRenderer({
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
import { MarkdownElement } from '@emkodev/emroute/spa';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: true, // Enable HTML tags in source
  linkify: true, // Auto-convert URLs to links
  typographer: true, // Smart quotes, dashes
});

MarkdownElement.setRenderer({
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

MarkdownElement.setRenderer({
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
import { MarkdownElement } from '@emkodev/emroute/spa';
import { micromark } from 'micromark';

MarkdownElement.setRenderer({
  render: (markdown) => micromark(markdown),
});
```

**With GFM (GitHub Flavored Markdown):**

```typescript
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';

MarkdownElement.setRenderer({
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
import { MarkdownElement } from '@emkodev/emroute/spa';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkHtml from 'remark-html';

const processor = unified()
  .use(remarkParse)
  .use(remarkHtml);

MarkdownElement.setRenderer({
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
import { MarkdownElement } from '@emkodev/emroute/spa';
import showdown from 'showdown';

const converter = new showdown.Converter({
  tables: true,
  ghCodeBlocks: true,
  tasklists: true,
});

MarkdownElement.setRenderer({
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
import { createSsrHtmlRouter } from '@emkodev/emroute/ssr/html';
// Renderer used internally by components

// client
import { MarkdownElement } from '@emkodev/emroute/spa';
import { markdownRenderer } from './shared/markdown.ts';
MarkdownElement.setRenderer(markdownRenderer);
```

---

## Performance Tips

1. **Reuse parser instances** - Don't create new instances per render
2. **Disable unused features** - Most parsers have options to disable features you don't use
3. **Consider WASM** - For heavy markdown processing, WASM parsers (like @emkodev/emko-md) are significantly faster
4. **Lazy load** - Use dynamic imports if markdown isn't needed immediately

```typescript
// Lazy load renderer
MarkdownElement.setRenderer({
  async init() {
    const { marked } = await import('marked');
    this._marked = marked;
  },
  render(markdown: string): string {
    return this._marked.parse(markdown, { async: false });
  },
});
```
