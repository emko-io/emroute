# emroute

A **framework-agnostic routing and component architecture** designed for triple-context rendering from a single codebase.

## Overview

| Endpoint  | Output          | Use Case                           |
| --------- | --------------- | ---------------------------------- |
| `/md/*`   | Pure Markdown   | LLMs, text clients, curl           |
| `/html/*` | SSR HTML        | Pre-rendered with embedded data    |
| SPA       | Custom Elements | Browser-native hydrated components |

## Installation

```typescript
import { createRouter } from '@emkodev/emroute';
```

## Quick Start

### SPA (Browser)

```typescript
import { createSpaHtmlRouter, MarkdownElement } from '@emkodev/emroute/spa';
import { marked } from 'marked';
import manifest from './routes.manifest.ts';

// Setup markdown renderer (required for <mark-down> elements)
// See doc/markdown-renderer.md for all options
MarkdownElement.setRenderer({
  render: (md) => marked.parse(md, { async: false }) as string,
});

// Initialize router
const router = await createRouter(manifest);
```

### SSR HTML (Server)

```typescript
import { createSsrHtmlRouter } from '@emkodev/emroute';
import manifest from './routes.manifest.ts';

const router = createSsrHtmlRouter(manifest);
const { html, status } = await router.render('/about');

// Serve HTML with status code
```

### SSR Markdown (Server)

```typescript
import { createSsrMdRouter } from '@emkodev/emroute';
import manifest from './routes.manifest.ts';

const router = createSsrMdRouter(manifest);
const { markdown, status } = await router.render('/md/about');

// Return plain markdown for LLMs, text clients
```

## Directory Structure

```
emroute/
├── src/
│   ├── index.ts                 # Main exports
│   ├── route.type.ts            # Route/param types
│   ├── route.core.ts            # Shared routing logic
│   ├── route.matcher.ts         # RouteMatcher (URLPattern API)
│   ├── router.ts                # Backwards-compat (re-exports SPA)
│   │
│   ├── spa/
│   │   └── html.renderer.ts     # SPA browser rendering
│   │
│   ├── ssr/
│   │   ├── html.renderer.ts     # Server HTML generation
│   │   └── md.renderer.ts       # Server Markdown generation
│   │
│   ├── slot.component.ts         # <router-slot> custom element
│   ├── markdown.element.ts      # <mark-down> element
│   │
│   ├── abstract.component.ts    # Component, PageComponent, PageContext
│   ├── widget.component.ts      # Widget (extends Component, widget- tag prefix)
│   ├── component.element.ts     # ComponentElement custom element (unified, with AbortSignal)
│   ├── component.renderer.ts    # Component rendering utilities
│   ├── page.component.ts        # DefaultPageComponent
│   │
│   ├── widget.type.ts           # Widget parsing/manifest types
│   ├── widget.parser.ts         # Widget block parser
│   │
│   └── html.util.ts             # Shared utilities
│
├── tool/
│   └── route.generator.ts       # Routes manifest generator
│
└── test/
    └── unit/                    # 536 unit tests
```

## API

### Routers

```typescript
// SPA (default)
import { createRouter, Router } from '@emkodev/emroute';

// Explicit imports
import { createSpaHtmlRouter, SpaHtmlRouter } from '@emkodev/emroute';
import { createSsrHtmlRouter, SsrHtmlRouter } from '@emkodev/emroute';
import { createSsrMdRouter, SsrMdRouter } from '@emkodev/emroute';
```

### Components

```typescript
import {
  Component, // Abstract base class
  ComponentElement, // Browser custom element (unified, with AbortSignal)
  PageComponent, // For route pages
  Widget, // Extends Component with widget- tag prefix
} from '@emkodev/emroute';

// Example component — all methods take a single args object
class MyComponent extends Component<MyParams, MyData> {
  readonly name = 'my-component';

  async getData({ params, signal }: { params: MyParams; signal?: AbortSignal }): Promise<MyData> {
    return fetch(`/api/data?id=${params.id}`, { signal }).then((r) => r.json());
  }

  renderMarkdown({ data, params }: { data: MyData; params: MyParams }): string {
    return `# ${data.title}\n\n${data.content}`;
  }

  override renderHTML({ data, params }: { data: MyData | null; params: MyParams }): string {
    if (!data) return '<div class="loading">Loading...</div>';
    return `<article><h1>${data.title}</h1><p>${data.content}</p></article>`;
  }
}

// Register as custom element: <c-my-component>
ComponentElement.register(new MyComponent());
```

### Widgets

Widgets extend Component with a `widget-` tag prefix. Same interface, same
lifecycle — the distinction is audience (developer vs content author).

```typescript
import { ComponentElement, Widget } from '@emkodev/emroute';

class StockWidget extends Widget<{ symbol: string }, { price: number }> {
  readonly name = 'stock-price';

  async getData({ params, signal }: { params: { symbol: string }; signal?: AbortSignal }) {
    return { price: await fetchStockPrice(params.symbol, signal) };
  }

  renderMarkdown({ data, params }: { data: { price: number }; params: { symbol: string } }) {
    return `**${params.symbol}**: $${data.price}`;
  }

  override renderHTML(
    { data, params }: { data: { price: number } | null; params: { symbol: string } },
  ) {
    if (!data) return '<span>Loading...</span>';
    return `<span class="stock">${params.symbol}: $${data.price}</span>`;
  }
}

// Register as custom element: <widget-stock-price>
ComponentElement.register(new StockWidget());
```

In markdown:

````markdown
```widget:stock-price
{"symbol": "AAPL"}
```
````

### Markdown Renderer

The `<mark-down>` element requires a renderer. Bring your own markdown parser:

```typescript
import { MarkdownElement } from '@emkodev/emroute/spa';
import { marked } from 'marked';

MarkdownElement.setRenderer({
  render: (md) => marked.parse(md, { async: false }) as string,
});
```

See **[doc/markdown-renderer.md](doc/markdown-renderer.md)** for integration guides with:

- @emkodev/emko-md (WASM)
- marked
- markdown-it
- micromark
- unified/remark
- showdown

### Route Generator

Generate route manifests automatically from your `routes/` directory:

```bash
# CLI usage
deno run --allow-read --allow-write \
  jsr:@emkodev/emroute/generator \
  routes routes.manifest.ts

# Or add to your deno.json tasks
{
  "tasks": {
    "routes:generate": "deno run --allow-read --allow-write jsr:@emkodev/emroute/generator routes routes.manifest.ts"
  }
}
```

**File naming conventions:**

| Pattern         | Type             | Example                                   |
| --------------- | ---------------- | ----------------------------------------- |
| `*.page.ts`     | TypeScript page  | `about.page.ts`                           |
| `*.page.html`   | HTML template    | `about.page.html`                         |
| `*.page.md`     | Markdown content | `about.page.md`                           |
| `*.error.ts`    | Error boundary   | `projects/[id].error.ts`                  |
| `*.redirect.ts` | Redirect         | `old-blog.redirect.ts`                    |
| `[param]`       | Dynamic segment  | `projects/[id].page.ts` → `/projects/:id` |
| `404.page.md`   | Status page      | Auto-registered for 404                   |

**File precedence:** `.ts` > `.html` > `.md`

**Templates:** A `.page.ts` can access its companion `.html` and `.md` files
via `context.files`. This works in all three rendering contexts (SPA, SSR HTML,
SSR Markdown). Use it for template-style string replacement — the router loads
the files, your component decides what to do with them:

```typescript
class ProjectPage extends PageComponent<{ id: string }> {
  override readonly name = 'project';

  override renderHTML(
    { params, context }: Parameters<PageComponent<{ id: string }>['renderHTML']>[0],
  ) {
    const template = context?.files?.html ?? '<router-slot></router-slot>';
    return template.replaceAll('{{id}}', params.id);
  }
}
```

### Flat files vs directory index (wildcards)

A flat file is an exact-match route. A directory index is a wildcard catch-all:

| File                   | Pattern          | Matches                                   |
| ---------------------- | ---------------- | ----------------------------------------- |
| `crypto.page.ts`       | `/crypto`        | `/crypto` only                            |
| `crypto/index.page.ts` | `/crypto/:rest*` | `/crypto`, `/crypto/eth`, `/crypto/a/b/c` |
| `crypto/eth.page.ts`   | `/crypto/eth`    | `/crypto/eth` only (wins by specificity)  |

The directory index catches its own path and any deeper unmatched path. The
remaining segments are available in `params.rest`. Specific children always
win — `crypto/eth.page.ts` matches before the catch-all.

**Both can coexist.** A flat file and a directory index produce _different_
routes. `crypto.page.html` → `/crypto` (exact layout page), while
`crypto/index.page.md` → `/crypto/:rest*` (catch-all for unmatched children).
The flat file acts as a landing page for the exact path; the directory index
handles everything the specific children don't match. This is useful when
the landing page and the catch-all need different templates.

See [ADR-0002](doc/architecture/ADR-0002-wildcard-routes-via-directory-index.md)
for full rationale and alternatives considered.

**Programmatic usage:**

```typescript
import { generateManifestCode, generateRoutesManifest } from '@emkodev/emroute';

const manifest = await generateRoutesManifest('./routes');
const code = generateManifestCode(manifest);
```

## Roadmap

### Future

**SSR widget prefetch** — Server-side `getData()` for widgets in SSR HTML mode.
Currently widgets are client-only islands (option A). Option B would inject
`data-ssr` with pre-fetched data for instant first paint. Per-usage `ssr` flag
in markdown. See `doc/widget-data-prefetch.md`.

**Lazy widget loading** — Defer `getData()` until the widget scrolls into view
via `IntersectionObserver`. SPA mode only. See `doc/widget-data-fetching.md`.

### Not Planned

**Optional params** — The router matches what's in the URL, nothing more.
`/crypto` is `["/", "crypto"]`, not a degraded `/crypto/:id?`. The
router-slot default content pattern covers "nothing selected" states at the
template level. See `doc/architecture/ADR-0001-no-optional-params.md`.

**Route guards** — Unclear how `enter()` callbacks compose with SSR (no JS on
server) and file-based routing (no central config to attach guards to). Error
boundaries and redirects cover the current use cases.

**Memory routing** — The router internals are tested directly. Page components
are testable without a router (they're classes with render methods). No gap
to fill.

**Active link styling** — Navigation components can implement this internally
(compare `location.pathname` to link `href`). Same code, opt-in per nav
component. No router-level API needed.

**Data caching** — The router is not a state management tool. Components own
their data lifecycle via `getData()` — they decide what to fetch, when to
refetch, and how to cache. See
[ADR-0008](doc/architecture/ADR-0008-no-data-caching.md).

## Key Architectural Decisions

Detailed rationale in `doc/architecture/ADR-*.md`:

1. **No Optional Params** ([ADR-0001](doc/architecture/ADR-0001-no-optional-params.md)) — Router-slot default content instead
2. **Wildcard Routes via Directory Index** ([ADR-0002](doc/architecture/ADR-0002-wildcard-routes-via-directory-index.md)) — Flat file = leaf, directory index = catch-all
3. **Triple Rendering Context** ([ADR-0003](doc/architecture/ADR-0003-triple-rendering-context.md)) — SPA, SSR HTML, SSR Markdown from one component
4. **File-Based Routing** ([ADR-0004](doc/architecture/ADR-0004-file-based-routing.md)) — Filesystem convention, `.ts` > `.html` > `.md` precedence
5. **Unified Component-Widget Model** ([ADR-0005](doc/architecture/ADR-0005-unified-component-widget-model.md)) — Widget extends Component, single custom element
6. **Native APIs, Zero Dependencies** ([ADR-0006](doc/architecture/ADR-0006-native-apis-zero-dependencies.md)) — URLPattern, Custom Elements, History API
7. **Content-First Pages** ([ADR-0007](doc/architecture/ADR-0007-content-first-pages.md)) — `.md` or `.html` with no JavaScript
8. **No Data Caching** ([ADR-0008](doc/architecture/ADR-0008-no-data-caching.md)) — Router routes, components own data

## Testing

```bash
# Run all unit tests
deno task test

# Watch mode
deno task test:watch

# Type checking
deno task check

# Format code
deno task fmt

# Lint
deno task lint
```

## Technologies

- TypeScript (strict mode)
- Deno runtime
- URLPattern API (native browser)
- Custom Elements (Web Components)
- `@emkodev/emko-md` WASM for markdown (optional)
- Zero external UI dependencies

## Compatibility

| Context       | Deno | Node | Bun | Vite/esbuild |
| ------------- | ---- | ---- | --- | ------------ |
| SPA (browser) | ✅   | ✅   | ✅  | ✅           |
| SSR HTML      | ✅   | ⚠️   | ✅  | ✅           |
| SSR Markdown  | ✅   | ⚠️   | ✅  | ✅           |

⚠️ = requires `urlpattern-polyfill`

### Browser (SPA)

Works in all modern browsers with native URLPattern and Custom Elements support. No polyfills needed.

### Deno

Full native support. URLPattern and Web APIs are built-in.

### Bun

Full native support. URLPattern is available globally.

### Node.js

For SSR usage, install the URLPattern polyfill:

```bash
npm install urlpattern-polyfill
```

```typescript
import 'urlpattern-polyfill';
import { createSsrHtmlRouter } from '@emkodev/emroute';

// Now URLPattern is available globally
const router = createSsrHtmlRouter(manifest);
```

### Vite / esbuild

Works out of the box for browser builds. For SSR builds targeting Node.js, include the polyfill in your server entry point.
