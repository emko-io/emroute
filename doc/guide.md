# emroute — Consumer Guide

## Philosophy

emroute is a file-based router built on native browser APIs. It has zero runtime
dependencies. Every page is a component that renders in three contexts from the
same code:

| Context      | URL prefix | Output        | Audience                |
| ------------ | ---------- | ------------- | ----------------------- |
| SPA          | `/`        | Hydrated HTML | Browser users           |
| SSR HTML     | `/html/`   | HTML islands  | Crawlers, no-JS clients |
| SSR Markdown | `/md/`     | Plain text    | LLMs, `curl`, scripts   |

One codebase, three outputs. A page component defines `renderHTML()` and
`renderMarkdown()` — the router calls the right one based on how the page is
accessed.

## Quick Start

See the [Quick Start guide](./quick-start.md) — three files, one command.

## Core Concepts

### File-Based Routing

Routes are defined by filesystem convention inside a `routes/` directory. No
configuration file, no route registration.

```
routes/
  index.page.md          →  /
  about.page.html        →  /about
  projects.page.md       →  /projects        (flat file = exact match)
  projects/
    index.page.md        →  /projects/*      (directory index = catch-all)
    [id].page.ts         →  /projects/:id
    [id]/
      tasks.page.ts      →  /projects/:id/tasks
  crypto/
    index.page.md        →  /crypto/*        (catch-all)
    eth.page.ts          →  /crypto/eth      (static wins over dynamic)
    [coin].page.ts       →  /crypto/:coin
```

**Rules:**

- `[param]` in filenames becomes `:param` in URL patterns
- A flat file like `projects.page.md` matches `/projects` exactly
- A directory `index.page.*` catches all unmatched children (`/projects/*`)
- Both can coexist: `projects.page.md` handles `/projects`, while `projects/index.page.md` catches `/projects/unknown/extra` — the flat file wins the exact path, the directory index catches the rest
- Specific routes always win over catch-all: `/projects/42` matches `[id].page.ts`, not `index.page.md`
- Static segments win over dynamic: `eth.page.ts` matches `/crypto/eth` before `[coin].page.ts`
- Root `index.page.*` matches `/` exactly for URL purposes, but still acts as a layout parent — all routes render inside its `<router-slot>`

### Three File Types per Route

A single route can have up to three files. The framework resolves them in
order of precedence: `.ts` > `.html` > `.md`.

| File             | Purpose                                 |
| ---------------- | --------------------------------------- |
| `name.page.ts`   | Component with data lifecycle           |
| `name.page.html` | HTML template (available in context)    |
| `name.page.md`   | Markdown content (available in context) |

When all three exist, the `.ts` component is the entry point. It receives the
`.html` and `.md` content via `context.files`:

```ts
override renderHTML({ data, context }) {
  const template = context?.files?.html ?? '<h1>Fallback</h1>';
  return template.replaceAll('{{name}}', data.name);
}
```

When all three files exist, the `.ts` component can combine them — use the
`.html` as a layout shell and embed the `.md` via `<mark-down>`:

```ts
override renderHTML({ data, context }) {
  const html = context?.files?.html ?? '';
  const md = context?.files?.md ?? '';
  return html.replace('{{content}}', `<mark-down>${md}</mark-down>`);
}
```

When only `.html` or `.md` exists (no `.ts`), the framework uses a
`DefaultPageComponent` that renders the file directly — `.html` as-is, `.md`
wrapped in a `<mark-down>` custom element.

## Page Components

Extend `PageComponent` to add data fetching, custom rendering, or dynamic
titles.

```ts
import { PageComponent } from '@emkodev/emroute';

class ProjectPage extends PageComponent<{ id: string }, { name: string }> {
  override readonly name = 'project';

  override async getData({ params }: { params: { id: string } }) {
    return { name: `Project ${params.id}` };
  }

  override renderHTML({ data, params }: {
    data: { name: string } | null;
    params: { id: string };
  }) {
    if (!data) return '<p>Loading...</p>';
    return `<h1>${data.name}</h1><p>ID: ${params.id}</p><router-slot></router-slot>`;
  }

  override renderMarkdown({ data }: {
    data: { name: string } | null;
    params: { id: string };
  }) {
    if (!data) return '';
    return `# ${data.name}`;
  }

  override getTitle({ data }: { data: { name: string } | null }) {
    return data?.name ?? 'Project';
  }
}

export default new ProjectPage();
```

**Lifecycle:** `getData()` runs first, then the appropriate render method based
on context. Both `getData` and render methods receive typed `params` extracted
from the URL.

**Default fallbacks** (if you don't override):

| Method             | Default behavior                                        |
| ------------------ | ------------------------------------------------------- |
| `getData()`        | Returns `null`                                          |
| `renderHTML()`     | `.html` file → `.md` in `<mark-down>` → `<router-slot>` |
| `renderMarkdown()` | `.md` file → slot placeholder                           |
| `getTitle()`       | `undefined` (no title change)                           |
| `renderError()`    | `<div class="c-error">Error: {message}</div>`           |

### Template Pattern

Pair a `.page.ts` with a `.page.html` to separate layout from logic:

```html
<!-- profile.page.html -->
<title>{{name}} — Profile</title>
<h1>{{name}}</h1>
<p class="role">Role: {{role}}</p>
<p class="bio">{{bio}}</p>
```

```ts
// profile.page.ts
class ProfilePage extends PageComponent<Record<string, string>, ProfileData> {
  override readonly name = 'profile';

  override async getData() {
    return { name: 'Alice', role: 'Engineer', bio: 'Builds things.' };
  }

  override getTitle({ data }: { data: ProfileData | null }) {
    return data ? `${data.name} — Profile` : 'Profile';
  }

  override renderHTML({ data, context }: {
    data: ProfileData | null;
    params: Record<string, string>;
    context?: PageContext;
  }) {
    const template = context?.files?.html ?? '<h1>Profile</h1>';
    if (!data) return template;
    return template
      .replaceAll('{{name}}', data.name)
      .replaceAll('{{role}}', data.role)
      .replaceAll('{{bio}}', data.bio);
  }
}

export default new ProfilePage();
```

### Markdown + Component Pattern

Pair a `.page.ts` with a `.page.md` for markdown-driven pages that need
surrounding logic:

```md
<!-- blog.page.md -->

# Blog

Welcome to the blog.
```

```ts
// blog.page.ts
class BlogPage extends PageComponent {
  override readonly name = 'blog';

  override renderHTML({ context }: {
    data: unknown;
    params: Record<string, string>;
    context?: PageContext;
  }) {
    const md = context?.files?.md ?? '';
    return `<mark-down>${md}</mark-down>\n<p class="blog-footer">Posts: 0</p>`;
  }

  override renderMarkdown({ context }: {
    data: unknown;
    params: Record<string, string>;
    context?: PageContext;
  }) {
    return context?.files?.md ?? '';
  }
}

export default new BlogPage();
```

## Nested Routes

Child routes render inside their parent's `<router-slot>`:

```
routes/
  projects/
    [id].page.ts          →  /projects/:id       (parent)
    [id]/
      tasks.page.ts       →  /projects/:id/tasks (child)
```

The parent component must include a `<router-slot>` for the child to render
into:

```ts
override renderHTML({ data, params }) {
  return `<h1>${data.name}</h1><router-slot></router-slot>`;
}
```

The `parent` field in the route manifest links child → parent. The route
generator handles this automatically based on directory structure.

> **Root index is a layout shell.** A root `index.page.*` matches `/` and
> becomes the parent of all routes — its content renders on every page, with
> child content injected into its `<router-slot>`. If you want a standalone
> homepage, put the homepage content before the slot:
>
> ```md
> <!-- routes/index.page.md — renders on every page as a layout -->
>
> # My App
>
> [Home](/) | [About](/about) | [Projects](/projects)
>
> ---
> ```
>
> router-slot
>
> ```
> ```
>
> The markdown/HTML above the slot acts as a persistent layout. The child
> route's content fills the slot. To keep the root index as just a homepage
> with no layout wrapping, don't use a directory `index.page.*` — use a flat
> `index.page.md` at the root instead, which matches `/` exactly without
> becoming a catch-all parent.

## Widgets

Widgets are self-contained components embedded in page content. They extend
`Widget` instead of `PageComponent`:

```ts
import { Widget } from '@emkodev/emroute';

class CryptoPrice extends Widget<{ coin: string }, { price: number }> {
  override readonly name = 'crypto-price';

  override async getData({ params, signal }) {
    const res = await fetch(`/api/crypto/${params.coin}`, { signal });
    return res.json();
  }

  override renderMarkdown({ data, params }) {
    return data ? `**${params.coin}**: $${data.price}` : '';
  }

  override renderHTML({ data, params }) {
    return data
      ? `<span class="price">${params.coin}: $${data.price}</span>`
      : `<span>Loading...</span>`;
  }
}

export default new CryptoPrice();
```

Widgets register as `<widget-{name}>` custom elements. Add them to a
`WidgetRegistry` so all renderers (SPA, SSR HTML, SSR Markdown) can resolve
them. Use widgets in HTML or Markdown:

**In HTML templates:**

```html
<widget-crypto-price coin="bitcoin"></widget-crypto-price>
```

**In Markdown (fenced block syntax):**

````md
```widget:crypto-price
{"coin": "bitcoin"}
```
````

Widget errors are contained — a failing widget renders its error state inline
without breaking the surrounding page.

## Error Handling

Three layers, from most specific to least:

### 1. Component/Widget Errors

When `getData()` or rendering throws, the component's `renderError()` method
handles it inline. The rest of the page continues rendering.

### 2. Error Boundaries

A `.error.ts` file scopes error handling to a URL prefix:

```ts
// routes/projects/[id].error.ts
class ProjectErrorBoundary extends PageComponent {
  override readonly name = 'project-error';

  override renderHTML() {
    return '<h1>Project Error</h1><p>Something went wrong.</p>';
  }

  override renderMarkdown() {
    return '# Project Error\n\nSomething went wrong.';
  }
}

export default new ProjectErrorBoundary();
```

This catches errors for any route under `/projects/:id/*`.

### 3. Root Error Handler

A `error.ts` at the routes root catches everything not caught by a boundary:

```ts
// routes/error.ts
class RootErrorHandler extends PageComponent {
  override readonly name = 'root-error';

  override renderHTML() {
    return '<h1>Something Went Wrong</h1>';
  }
}

export default new RootErrorHandler();
```

### Status Pages

Name files by HTTP status code for custom error pages:

```
routes/404.page.html    →  Custom "Not Found" page
routes/401.page.ts      →  Custom "Unauthorized" page
routes/403.page.md      →  Custom "Forbidden" page
```

## Redirects

Create a `.redirect.ts` file that exports a `RedirectConfig`:

```ts
// routes/old.redirect.ts
import type { RedirectConfig } from '@emkodev/emroute';

export default { to: '/about', status: 302 } satisfies RedirectConfig;
```

In the SPA, this navigates client-side. In SSR, it returns the appropriate HTTP
status with redirect headers.

## SPA Setup

The minimal SPA entry point:

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>My App</title>
  </head>
  <body>
    <router-slot></router-slot>
    <script type="module" src="/main.js"></script>
  </body>
</html>
```

```ts
// main.ts
import { createSpaHtmlRouter, MarkdownElement } from '@emkodev/emroute/spa';
import { routesManifest } from './routes.manifest.ts';

// Required if any route uses .page.md files — see note below
MarkdownElement.setRenderer({
  render: (md) => myMarkdownLib.render(md),
});

const router = await createSpaHtmlRouter(routesManifest);
```

> **When do you need a markdown renderer?** Only in the SPA (browser). SSR
> markdown mode (`/md/*`) outputs raw markdown text and never invokes the
> `<mark-down>` element. SSR HTML mode (`/html/*`) renders components
> server-side without custom elements. But in the SPA, navigating to a
> `.page.md` route renders it through the `<mark-down>` custom element, which
> requires a renderer. If your app has no `.page.md` routes, you can skip
> `setRenderer()` entirely. See [Markdown Renderers](./markdown-renderer.md)
> for available options.

The SPA router:

- Intercepts same-origin link clicks for client-side navigation
- Uses the History API for back/forward
- Matches the URL against the routes manifest
- Builds the route hierarchy and renders parent → child into nested `<router-slot>` elements
- Strips `/html/` prefix from links (so SSR links work in SPA context)
- Redirects `/md/` links to the server for plain text output
- Fires `navigate`, `load`, and `error` events

```ts
router.addEventListener((event) => {
  if (event.type === 'navigate') console.log('Navigating to', event.pathname);
  if (event.type === 'load') console.log('Loaded', event.pathname);
  if (event.type === 'error') console.error('Error:', event.error);
});

await router.navigate('/projects/42');
const params = router.getParams(); // { id: '42' }
```

## SSR Setup

For server-side rendering, create the appropriate router with the same manifest:

```ts
import { createSsrHtmlRouter } from '@emkodev/emroute/ssr/html';
import { createSsrMdRouter } from '@emkodev/emroute/ssr/md';
import { WidgetRegistry } from '@emkodev/emroute';

// Register widgets so SSR can render them
const widgets = new WidgetRegistry();
widgets.add(myCryptoWidget);

const htmlRouter = createSsrHtmlRouter(manifest, { widgets });
const mdRouter = createSsrMdRouter(manifest, { widgets });

// Handle /html/* requests
const { html, status, title } = await htmlRouter.render('/html/projects/42');

// Handle /md/* requests
const { markdown, status } = await mdRouter.render('/md/projects/42');
```

The SSR renderers strip their prefix (`/html/` or `/md/`) before matching.

**SSR HTML renders widgets server-side.** The HTML renderer calls each
component's `renderHTML()` and assembles the route hierarchy. When a
`WidgetRegistry` is provided, `<widget-*>` tags are resolved: the renderer
calls `getData()` + `renderHTML()` on each widget, fills the tag with rendered
content, and adds a `data-ssr` attribute with serialized data. In the browser,
the SPA adopts this content without re-rendering — it detects `data-ssr`,
restores state, and the widget is live.

**SSR Markdown renders widgets too.** Fenced `widget:name` blocks are resolved
via the registry: `getData()` + `renderMarkdown()` replaces the fenced block
with text output. This is critical for `/md/` routes which have zero
client-side JS — widgets must be fully rendered server-side.

## Routes Manifest

The manifest is a data structure that maps URL patterns to modules. It can be
generated automatically or written by hand.

```ts
import type { RoutesManifest } from '@emkodev/emroute';

const manifest: RoutesManifest = {
  routes: [
    {
      pattern: '/projects/:id',
      type: 'page',
      modulePath: 'routes/projects/[id].page.ts',
      files: { ts: 'routes/projects/[id].page.ts' },
      parent: '/projects',
    },
    {
      pattern: '/',
      type: 'page',
      modulePath: 'routes/index.page.md',
      files: { md: 'routes/index.page.md' },
    },
  ],
  errorBoundaries: [
    { pattern: '/projects', modulePath: 'routes/projects/[id].error.ts' },
  ],
  statusPages: new Map([
    [404, {
      pattern: '/404',
      type: 'page',
      modulePath: 'routes/404.page.html',
      statusCode: 404,
      files: { html: 'routes/404.page.html' },
    }],
  ]),
  errorHandler: { pattern: '/', type: 'error', modulePath: 'routes/error.ts' },
  moduleLoaders: {
    'routes/projects/[id].page.ts': () => import('./routes/projects/[id].page.ts'),
    'routes/error.ts': () => import('./routes/error.ts'),
  },
};
```

### Route Generator

The route generator scans a directory and produces a manifest:

```ts
import { generateManifestCode, generateRoutesManifest } from '@emkodev/emroute/generator';

const result = await generateRoutesManifest('routes/', fs);
const code = generateManifestCode(result, '@emkodev/emroute');
await Deno.writeTextFile('routes.manifest.ts', code);
```

## Development Server

emroute includes a dev server that bundles your entry point, serves the SPA,
and handles SSR routes:

```ts
import { createDevServer } from '@emkodev/emroute/server';
import { denoServerRuntime } from '@emkodev/emroute/server/deno';

const server = await createDevServer({
  port: 3000,
  entryPoint: 'main.ts',
  routesDir: 'routes', // Auto-generates manifest
  appRoot: '.', // Root for file resolution
  watch: true, // Rebuild on changes
}, denoServerRuntime);
```

**Required permissions** (Deno):

```bash
deno run --allow-net --allow-read --allow-write --allow-run --allow-env dev.ts
```

- `--allow-net` — HTTP server
- `--allow-read` — read route files, templates, static assets
- `--allow-write` — write generated `routes.manifest.ts` and `.build/` output
- `--allow-run` — spawn `deno bundle --watch` for bundling
- `--allow-env` — read `PORT`, `ENTRY_POINT`, etc. (optional, only if using env vars)

The server handles:

- `GET /` — SPA fallback (serves `index.html`)
- `GET /html/*` — SSR HTML rendering
- `GET /md/*` — SSR Markdown rendering (returns `text/plain`)
- `GET /*.js` — Bundled JavaScript
- `GET /routes/*.html`, `/routes/*.md` — Static file serving

## Design Principles

1. **Native APIs only.** URLPattern for routing, custom elements for rendering,
   History API for navigation. No framework runtime.

2. **Content-first.** Markdown is the canonical content format. Every page can
   render as markdown, making content inherently portable and machine-readable.

3. **File = Route.** The filesystem is the routing config. No registration, no
   config file, no build step required (the manifest generator is optional).

4. **Pages and Widgets.** Pages are content units resolved by URL via the routes
   manifest. Widgets are embeddable units resolved by name via the
   `WidgetRegistry`. Both share the same lifecycle (`getData` → `render`) and
   render across all three contexts.

5. **Three contexts, one component.** A single component serves browsers (SPA),
   server-rendered HTML, and plain markdown. No separate API layer needed for
   machine consumers.
