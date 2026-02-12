# Widget Expansion in Renderers

## Problem

Widget expansion currently lives in `html.util.ts` (`processFencedWidgets`). It
works by post-processing rendered HTML with regex: find `<code data-language=
"widget:xxx">` blocks, unescape the HTML content, parse JSON, then build
`<widget-xxx>` tags. This is fragile:

- Depends on specific HTML output format (`data-language` attribute)
- Escapes JSON to HTML entities, then unescapes and reparses
- Regex-on-HTML is inherently brittle
- Couples emroute to the specific renderer's output format

## Decision

Move widget expansion into the markdown renderers themselves. Each renderer has
structured data (AST or token stream) available _before_ HTML serialization —
the right place to do this transformation.

### emko-md (AstRenderer)

Already done in `@emkodev/emko-md@0.1.0-beta.3`. The `AstRenderer` detects
`widget:name` code blocks from the AST and emits `<widget-name attr="value">`
directly. No post-processing needed.

### marked

Override the `code` renderer:

```ts
import { marked } from 'marked';

marked.use({
  renderer: {
    code({ text, lang }) {
      if (lang?.startsWith('widget:')) {
        const name = lang.slice(7);
        const tag = `widget-${name}`;
        try {
          const params = JSON.parse(text);
          const attrs = Object.entries(params)
            .map(([k, v]) => {
              const attr = k.replace(/([A-Z])/g, '-$1').toLowerCase();
              const val = typeof v === 'string' ? v : JSON.stringify(v);
              return `${attr}="${val.replace(/"/g, '&quot;')}"`;
            })
            .join(' ');
          return attrs ? `<${tag} ${attrs}></${tag}>` : `<${tag}></${tag}>`;
        } catch {
          return `<${tag}></${tag}>`;
        }
      }
      return false; // fall through to default
    },
  },
});
```

### markdown-it

Override the `fence` rule:

```ts
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt();
const defaultFence = md.renderer.rules.fence!;

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const lang = token.info.trim();

  if (lang.startsWith('widget:')) {
    const name = lang.slice(7);
    const tag = `widget-${name}`;
    const content = token.content.trim();

    if (!content) return `<${tag}></${tag}>`;

    try {
      const params = JSON.parse(content);
      const attrs = Object.entries(params)
        .map(([k, v]) => {
          const attr = k.replace(/([A-Z])/g, '-$1').toLowerCase();
          const val = typeof v === 'string' ? v : JSON.stringify(v);
          return `${attr}="${md.utils.escapeHtml(val)}"`;
        })
        .join(' ');
      return attrs ? `<${tag} ${attrs}></${tag}>` : `<${tag}></${tag}>`;
    } catch {
      return `<${tag}></${tag}>`;
    }
  }

  return defaultFence(tokens, idx, options, env, self);
};
```

## Follow-up

Once renderers handle widget expansion natively:

1. Deprecate `processFencedWidgets` in `html.util.ts`
2. Remove it after one major version
3. Update `MarkdownElement` and SSR renderers to stop calling it
4. Document the renderer-side approach in the emroute guide
