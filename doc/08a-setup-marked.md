# Setting Up marked

This guide uses [marked](https://marked.js.org), a fast and lightweight
markdown parser with a custom renderer API.

## 1. Install

```bash
bun add marked
```

## 2. Create a shared renderer module

Create a single module shared by both client and server:

````ts
// renderer.ts
import { marked } from 'marked';

/**
 * Convert a JSON string to HTML attributes.
 * Used by widget and router-slot fenced blocks.
 */
function jsonToAttrs(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    return Object.entries(obj)
      .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`)
      .join('');
  } catch {
    return '';
  }
}

marked.use({
  renderer: {
    // Pass through raw HTML unchanged (default escapes it).
    // Only enable this if you trust your markdown content source.
    html: ({ text }) => text,

    code: ({ text, lang }) => {
      // ```widget:counter → <widget-counter start="42">
      if (lang?.startsWith('widget:')) {
        const name = lang.slice('widget:'.length);
        const attrs = jsonToAttrs(text);
        return `<widget-${name}${attrs}></widget-${name}>`;
      }

      // ```router-slot → <router-slot>
      if (lang === 'router-slot') {
        const attrs = jsonToAttrs(text);
        return `<router-slot${attrs}></router-slot>`;
      }

      // Regular code blocks
      const cls = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${cls}>${text}</code></pre>`;
    },
  },
});

export function render(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}
````

The `code` override intercepts fenced blocks: ```` ```router-slot ```` becomes
`<router-slot>`, and ```` ```widget:counter ```` becomes `<widget-counter>`.
The JSON body (if present) is parsed into HTML attributes.

## 3. Server setup

```ts
// server.ts
import { createEmrouteServer } from '@emkodev/emroute/server';
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';
import { render } from './renderer.ts';

const appRoot = import.meta.dirname!;

const runtime = new BunFsRuntime(appRoot, {
  routesDir: '/routes',
});

const emroute = await createEmrouteServer({
  markdownRenderer: { render },
}, runtime);

Bun.serve({
  port: 1420,
  async fetch(req) {
    const response = await emroute.handleRequest(req);
    if (response) return response;
    return new Response('Not Found', { status: 404 });
  },
});
```

## 4. Client setup

```ts
// main.ts
import { bootEmrouteApp, MarkdownElement } from '@emkodev/emroute/spa';
import { render } from './renderer.ts';

MarkdownElement.setRenderer({ render });

await bootEmrouteApp();
```

`setRenderer()` must be called **before** any `<mark-down>` elements are
connected to the DOM.

## 5. HTML passthrough

The `html` renderer override controls how raw HTML tags in markdown are handled:

```ts
// Pass through raw HTML (trusted content only)
html: ({ text }) => text,

// Escape raw HTML (safe for untrusted content — marked's default)
// Simply remove the html override
```

When passthrough is enabled, any HTML in the markdown source is included
verbatim. This is useful for embedding custom elements in `.page.md` files,
but is a security risk with untrusted content.
