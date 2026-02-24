# Setting Up markdown-it

This guide uses [markdown-it](https://github.com/markdown-it/markdown-it), a
CommonMark-compliant parser with a large plugin ecosystem.

## 1. Install

```bash
bun add markdown-it
bun add -d @types/markdown-it
```

## 2. Create a shared renderer module

Create a single module shared by both client and server:

````ts
// renderer.ts
import MarkdownIt from 'markdown-it';

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

const md = new MarkdownIt({
  html: false, // Escape raw HTML tags (safe for untrusted content)
});

// Override the fence rule to handle widget and router-slot blocks.
const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const lang = token.info.trim();
  const content = token.content;

  // ```widget:counter → <widget-counter start="42">
  if (lang.startsWith('widget:')) {
    const name = lang.slice('widget:'.length);
    const attrs = jsonToAttrs(content);
    return `<widget-${name}${attrs}></widget-${name}>`;
  }

  // ```router-slot → <router-slot>
  if (lang === 'router-slot') {
    const attrs = jsonToAttrs(content);
    return `<router-slot${attrs}></router-slot>`;
  }

  return defaultFence(tokens, idx, options, env, self);
};

export function render(markdown: string): string {
  return md.render(markdown);
}
````

The fence rule override intercepts fenced blocks: ```` ```router-slot ````
becomes `<router-slot>`, and ```` ```widget:counter ```` becomes
`<widget-counter>`. The JSON body (if present) is parsed into HTML attributes.

## 3. Server setup

```ts
// server.ts
import { createEmrouteServer } from '@emkodev/emroute/server';
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';
import { render } from './renderer.ts';

const appRoot = import.meta.dirname!;

const runtime = new BunFsRuntime(appRoot, {
  routesDir: '/routes',
  entryPoint: '/main.ts',
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
import { createSpaHtmlRouter, MarkdownElement } from '@emkodev/emroute/spa';
import { routesManifest } from 'emroute:routes';
import { render } from './renderer.ts';

MarkdownElement.setRenderer({ render });

await createSpaHtmlRouter(routesManifest);
```

`setRenderer()` must be called **before** any `<mark-down>` elements are
connected to the DOM.

## 5. HTML passthrough

markdown-it controls raw HTML via the `html` option:

```ts
// Escape raw HTML tags (default, safe for untrusted content)
const md = new MarkdownIt({ html: false });

// Pass through raw HTML (trusted content only)
const md = new MarkdownIt({ html: true });
```

When `html: true`, any HTML in the markdown source is included verbatim. This
is useful for embedding custom elements in `.page.md` files, but is a security
risk with untrusted content.

## 6. Bundle size

markdown-it has a larger footprint than marked (~362KB vs ~129KB bundled). If
bundle size is a concern and you don't need the plugin ecosystem, consider
[marked](./08a-setup-marked.md) instead.
