# Setting Up marked with emroute

emroute uses `.page.md` files for markdown-driven routes. For these to render
as HTML, you need a markdown renderer configured in two places:

- **Client (SPA)** — `MarkdownElement.setRenderer()` so the `<mark-down>`
  custom element can convert markdown to HTML in the browser.
- **Server (SSR HTML)** — `markdownRenderer` option on the dev server so
  `/html/*` routes render markdown server-side.

This guide uses [marked](https://marked.js.org), a fast and widely-used
markdown parser with a custom renderer API that integrates well with emroute's
widget and slot conventions.

## 1. Install

```bash
# Deno
deno add npm:marked

# Node
npm install marked
```

Your `deno.json` imports should include both emroute and marked:

```json
{
  "imports": {
    "@emkodev/emroute": "jsr:@emkodev/emroute@^1.4.0",
    "@emkodev/emroute/spa": "jsr:@emkodev/emroute@^1.4.0/spa",
    "@emkodev/emroute/server": "jsr:@emkodev/emroute@^1.4.0/server",
    "@emkodev/emroute/server/deno": "jsr:@emkodev/emroute@^1.4.0/server/deno",
    "marked": "npm:marked@15"
  }
}
```

## 2. Create a shared renderer module

Create a single renderer module shared by both client and server. This ensures
identical markdown output in both contexts.

```ts
// renderer.ts
import { marked } from "marked";

/**
 * Convert a JSON string to HTML attributes.
 * Used by widget and router-slot fenced blocks.
 */
function jsonToAttrs(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    return Object.entries(obj)
      .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, "&quot;")}"`)
      .join("");
  } catch {
    return "";
  }
}

marked.use({
  renderer: {
    // Pass through raw HTML unchanged (default escapes it).
    // Only enable this if you trust your markdown content source.
    // For untrusted content, remove this override or sanitize the output.
    html: ({ text }) => text,

    code: ({ text, lang }) => {
      // ```widget:counter → <widget-counter label="Clicks" start="0">
      if (lang?.startsWith("widget:")) {
        const name = lang.slice("widget:".length);
        const attrs = jsonToAttrs(text);
        return `<widget-${name}${attrs}></widget-${name}>`;
      }

      // ```router-slot → <router-slot name="sidebar">
      if (lang === "router-slot") {
        const attrs = jsonToAttrs(text);
        return `<router-slot${attrs}></router-slot>`;
      }

      // Regular code blocks
      const cls = lang ? ` class="language-${lang}"` : "";
      return `<pre><code${cls}>${text}</code></pre>`;
    },
  },
});

export function render(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}
```

### Fenced block conventions

emroute uses fenced code blocks with special language identifiers for widgets
and router slots:

**Widgets** — `` ```widget:<name> `` with optional JSON body:

````markdown
```widget:counter
{"label": "Clicks", "start": 0}
```
````

Renders as:

```html
<widget-counter label="Clicks" start="0"></widget-counter>
```

The JSON body is parsed and each key-value pair becomes an HTML attribute on the
custom element. The JSON is optional — a widget block with no body produces a
tag with no attributes.

**Router slots** — `` ```router-slot `` with optional JSON body:

````markdown
```router-slot
{"name": "sidebar"}
```
````

Renders as:

```html
<router-slot name="sidebar"></router-slot>
```

### HTML passthrough

The `html` renderer override controls how raw HTML tags in markdown are handled:

```ts
// Pass through raw HTML (trusted content only)
html: ({ text }) => text

// Escape raw HTML (safe for untrusted content — marked's default)
// Simply remove the html override
```

When `html` passthrough is enabled, any HTML tag in the markdown source is
included verbatim in the output. This is useful for embedding custom elements
or rich HTML in your `.page.md` files, but is a security risk with untrusted
content.

## 3. Client-side setup

Import the shared renderer in your SPA entry point and register it with
`MarkdownElement`:

```ts
// main.ts
import { MarkdownElement, createSpaHtmlRouter } from "@emkodev/emroute/spa";
import { routesManifest } from "./routes.manifest.ts";
import { render } from "./renderer.ts";

MarkdownElement.setRenderer({ render });

await createSpaHtmlRouter(routesManifest);
```

`setRenderer()` must be called **before** any `<mark-down>` elements are
connected to the DOM.

## 4. Server-side setup

Pass the same renderer to `createDevServer`:

```ts
// dev.ts
import { createDevServer } from "@emkodev/emroute/server";
import { denoServerRuntime } from "@emkodev/emroute/server/deno";
import { render } from "./renderer.ts";

await createDevServer(
  {
    port: 1420,
    entryPoint: "main.ts",
    routesDir: "./routes",
    widgetsDir: "./widgets",
    appRoot: ".",
    markdownRenderer: { render },
  },
  denoServerRuntime,
);
```

Update the `dev` task in `deno.json`:

```jsonc
{
  "tasks": {
    "dev": "deno run --allow-net --allow-read --allow-write --allow-run --allow-env dev.ts"
  }
}
```

## 5. Security

The output of `render()` is assigned to `innerHTML` in the browser and served
as HTML from the server. Your renderer is responsible for sanitizing its output.

| Scenario | Recommendation |
|---|---|
| Trusted content (your own `.page.md` files) | Enable HTML passthrough for full flexibility |
| Untrusted content (user-submitted markdown) | Remove the `html` override so marked escapes raw HTML |
| Mixed | Sanitize the output of `render()` before returning it |

marked escapes raw HTML by default. The `html: ({ text }) => text` override
disables this — only use it when you control the markdown source.

## Why both client and server?

| Context | What renders markdown | When it runs |
|---|---|---|
| SPA (`/`) | `MarkdownElement` in the browser | Client navigates to a `.page.md` route |
| SSR HTML (`/html/*`) | `markdownRenderer` on the server | Server handles an `/html/*` request |
| SSR Markdown (`/md/*`) | Nothing — returns raw markdown | Server returns plain text as-is |

Without the client-side renderer, SPA navigation to a markdown page shows raw
text. Without the server-side renderer, `/html/*` routes return `<mark-down>`
tags instead of rendered HTML.
