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

### Companion Files per Route

A single route can have up to four companion files. The framework resolves the
primary module in order of precedence: `.ts` > `.html` > `.md`. A `.css` file
is always a companion — it never creates a route on its own.

| File             | Purpose                                 |
| ---------------- | --------------------------------------- |
| `name.page.ts`   | Component with data lifecycle           |
| `name.page.html` | HTML template (available in context)    |
| `name.page.md`   | Markdown content (available in context) |
| `name.page.css`  | CSS styles (injected as `<style>` tag)  |

`.page.html` files are **fragments**, not full documents. They must not contain
`<!DOCTYPE>`, `<html>`, `<head>`, or `<body>` tags — the app's `index.html`
provides the document shell, and page content is injected into its
`<router-slot>`. Including document-level markup produces invalid nested HTML in
SSR output.

When a `.ts` component exists, it is the entry point. It receives companion
file content via `context.files`:

```ts
override renderHTML({ data, context }: this['RenderArgs']) {
  const template = context.files?.html ?? '<h1>Fallback</h1>';
  return template.replaceAll('{{name}}', data.name);
}
```

When all three files exist, the `.ts` component can combine them — use the
`.html` as a layout shell and embed the `.md` via `<mark-down>`:

```ts
override renderHTML({ data, context }: this['RenderArgs']) {
  const html = context.files?.html ?? '';
  const md = context.files?.md ?? '';
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

  override async getData({ params }: this['DataArgs']) {
    return { name: `Project ${params.id}` };
  }

  override renderHTML({ data, params }: this['RenderArgs']) {
    if (!data) return '<p>Loading...</p>';
    return `<h1>${data.name}</h1><p>ID: ${params.id}</p><router-slot></router-slot>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']) {
    if (!data) return '';
    return `# ${data.name}`;
  }

  override getTitle({ data }: this['RenderArgs']) {
    return data?.name ?? 'Project';
  }
}

export default new ProjectPage();
```

**Lifecycle:** `getData()` runs first, then the appropriate render method based
on context. Both `getData` and render methods receive typed `params` extracted
from the URL.

**Default fallbacks** (if you don't override):

| Method             | Default behavior                                                        |
| ------------------ | ----------------------------------------------------------------------- |
| `getData()`        | Returns `null`                                                          |
| `renderHTML()`     | css `<style>` + `.html` file → `.md` in `<mark-down>` → `<router-slot>` |
| `renderMarkdown()` | `.md` file → slot placeholder                                           |
| `getTitle()`       | `undefined` (no title change)                                           |
| `renderError()`    | `<div class="c-error">Error: {message}</div>`                           |

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

  override getTitle({ data }: this['RenderArgs']) {
    return data ? `${data.name} — Profile` : 'Profile';
  }

  override renderHTML({ data, context }: this['RenderArgs']) {
    const template = context.files?.html ?? '<h1>Profile</h1>';
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

  override renderHTML({ context }: this['RenderArgs']) {
    const md = context.files?.md ?? '';
    return `<mark-down>${md}</mark-down>\n<p class="blog-footer">Posts: 0</p>`;
  }

  override renderMarkdown({ context }: this['RenderArgs']) {
    return context.files?.md ?? '';
  }
}

export default new BlogPage();
```

## Nested Routes

> For a full guide covering slot syntax, fallback chains, visibility across
> modes, passthrough pages, catch-all vs dynamic segments, and more — see
> [Nested Routes](./nesting.md).

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
override renderHTML({ data, params }: this['RenderArgs']) {
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
> ````md
> <!-- routes/index.page.md — renders on every page as a layout -->
>
> # My App
>
> [Home](/) | [About](/about) | [Projects](/projects)
>
> ---
>
> ```router-slot
> ```
> ````
>
> The markdown/HTML above the slot acts as a persistent layout. The child
> route's content fills the slot. To keep the root index as just a homepage
> with no layout wrapping, don't use a directory `index.page.*` — use a flat
> `index.page.md` at the root instead, which matches `/` exactly without
> becoming a catch-all parent.

## Widgets

Widgets are self-contained components embedded in page content. They extend
`WidgetComponent` instead of `PageComponent`:

```ts
import { WidgetComponent } from '@emkodev/emroute';

class CryptoPrice extends WidgetComponent<{ coin: string }, { price: number }> {
  override readonly name = 'crypto-price';

  override async getData({ params, signal }: this['DataArgs']) {
    const res = await fetch(`/api/crypto/${params.coin}`, { signal });
    return res.json();
  }

  override renderMarkdown({ data, params }: this['RenderArgs']) {
    return data ? `**${params.coin}**: $${data.price}` : '';
  }

  override renderHTML({ data, params }: this['RenderArgs']) {
    return data
      ? `<span class="price">${params.coin}: $${data.price}</span>`
      : `<span>Loading...</span>`;
  }
}

export default new CryptoPrice();
```

Widgets register as `<widget-{name}>` custom elements. They can be
auto-discovered from a `widgets/` directory or registered manually via
`WidgetRegistry`. Use widgets in HTML or Markdown:

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

The JSON body is optional — omit it when the widget takes no parameters:

````md
```widget:nav
```
````

JSON keys become HTML attributes: `{"coin": "bitcoin"}` is equivalent to
`<widget-crypto-price coin="bitcoin">`.

### Registering Widgets

#### File-based discovery (recommended)

Place widgets in a `widgets/` directory following the convention
`widgets/{name}/{name}.widget.ts`. The dev server auto-discovers them when you
set `widgetsDir`:

```
widgets/
  crypto-price/
    crypto-price.widget.ts     ← discovered automatically
    crypto-price.widget.css    ← companion file (optional)
  nav/
    nav.widget.ts
    nav.widget.html
```

The server handles both sides:

- **SSR**: imports each widget module, populates a `WidgetRegistry` for
  server-side rendering
- **SPA**: generates a `widgets.manifest.ts` with module loaders, and the
  generated (or consumer-provided) `main.ts` registers `<widget-*>` custom
  elements from it

No manual imports needed. Add a widget directory, restart the server (or let
`watch` mode pick it up), and it's available in all three rendering contexts.

#### Manual registration

For widgets that live outside the `widgets/` directory (vendor packages,
generated code, etc.), register them manually via `WidgetRegistry`:

```ts
import { WidgetRegistry } from '@emkodev/emroute';
import myVendorWidget from './vendor/some-widget.ts';

const widgets = new WidgetRegistry();
widgets.add(myVendorWidget);

await createDevServer({ widgetsDir: 'widgets', widgets }, denoServerRuntime);
```

When both `widgetsDir` and `widgets` are provided, they are merged — manual
registrations take priority on name collision.

For the SPA side, manually registered widgets need explicit registration in your
`main.ts`:

```ts
import { ComponentElement, createSpaHtmlRouter } from '@emkodev/emroute/spa';
import { routesManifest } from './routes.manifest.ts';
import myVendorWidget from './vendor/some-widget.ts';

ComponentElement.register(myVendorWidget);

await createSpaHtmlRouter(routesManifest);
```

### Widget Files

Widgets support companion files (`.html`, `.md`, `.css`) that are loaded by the
SSR infrastructure and passed through `context.files`, mirroring how page
files work.

With file-based discovery (`widgetsDir`), companion files are detected
automatically — just place them next to the widget module:

```
widgets/nav/
  nav.widget.ts      ← widget module
  nav.widget.html    ← auto-discovered companion
  nav.widget.css     ← auto-discovered companion
```

For manually registered widgets, declare file paths explicitly:

```ts
class NavWidget extends WidgetComponent<Record<string, unknown>, NavData> {
  override readonly name = 'nav';
  override readonly files = {
    html: 'widgets/nav/nav.widget.html',
    css: 'widgets/nav/nav.widget.css',
  };

  override renderHTML({ data, context }: this['RenderArgs']) {
    const style = context.files?.css ? `<style>${context.files.css}</style>` : '';
    const html = context.files?.html ?? '<nav>Loading...</nav>';
    return style + html;
  }
}
```

File paths are relative to the app root. Absolute URLs (e.g.,
`https://cdn.example.com/widget.css`) are also supported — fetched at render
time with caching. The default `WidgetComponent.renderHTML()` automatically
prepends `<style>` tags when a CSS file is declared.

**CSS auto-scoping:** Companion `.widget.css` files are automatically wrapped in
`@scope (widget-{name}) { ... }` by the default `renderHTML()`. This scopes
styles to the widget's custom element without Shadow DOM or manual class
prefixes. Write plain CSS in your companion file — scoping happens at render
time:

```css
/* nav.widget.css — no manual scoping needed */
a {
  text-decoration: none;
  color: #64748b;
}
a:hover {
  color: #334155;
}
a.active {
  color: #2563eb;
  font-weight: 600;
}
```

The rendered output becomes:

```html
<style>
  @scope (widget-nav) {
    a {
      text-decoration: none;
      color: #64748b;
    }
    a:hover {
      color: #334155;
    }
    a.active {
      color: #2563eb;
      font-weight: 600;
    }
  }
</style>
```

Widgets that override `renderHTML()` and handle CSS themselves can use the
exported `scopeWidgetCss(css, widgetName)` utility for the same effect.

**`content-visibility: auto`:** All widget custom elements have
`content-visibility: auto` set by default. Off-screen widgets skip layout and
paint entirely; visible widgets render normally. Override per-widget with CSS
if needed (`widget-nav { content-visibility: visible; }`).

Widget errors are contained — a failing widget renders its error state inline
without breaking the surrounding page.

### Host Element Reference

In the browser, `this.element` gives a widget access to its host custom element
(`<widget-{name}>`). The reference is set before `getData()` and available
throughout the component's lifecycle. On the server, `this.element` is
`undefined`.

```ts
class CounterWidget extends WidgetComponent<{ start?: string }, { count: number }> {
  override readonly name = 'counter';

  override getData({ params }: this['DataArgs']) {
    return Promise.resolve({ count: parseInt(params.start ?? '0', 10) });
  }

  override renderHTML({ data }: this['RenderArgs']) {
    if (!data) return '';
    return `<button class="dec">-</button>
<span class="count">${data.count}</span>
<button class="inc">+</button>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']) {
    return data ? `Counter: ${data.count}` : '';
  }

  override destroy() {
    // Cleanup: this.element is still available here
  }
}
```

Use `this.element` to attach event listeners, query rendered children (via
`this.element.shadowRoot`), integrate third-party libraries, or perform any
imperative DOM work after rendering. Components that don't need DOM access
simply ignore the property — it's opt-in by nature.

### Hydration Lifecycle

When widgets are server-side rendered, the browser can adopt the pre-rendered
HTML without re-rendering. The `hydrate()` lifecycle hook provides a way to
attach event listeners and enable interactivity after the DOM is ready,
regardless of whether the widget came from SSR adoption or fresh SPA rendering.

```ts
class InteractiveWidget extends WidgetComponent<{ start?: string }, { initial: number }> {
  override readonly name = 'interactive';
  private clickCount = 0;

  // Store method reference for proper cleanup
  private handleClick = () => {
    this.clickCount++;
    const display = this.element?.shadowRoot?.querySelector('#count');
    if (display) display.textContent = String(this.clickCount);
  };

  override getData({ params }: this['DataArgs']) {
    return Promise.resolve({ initial: parseInt(params.start ?? '0', 10) });
  }

  override renderHTML({ data }: this['RenderArgs']) {
    if (!data) return '<p>Loading...</p>';
    return `<div>
      <button id="btn">Click me</button>
      <span id="count">0</span>
    </div>`;
  }

  // Called after SSR adoption AND after fresh SPA rendering
  override hydrate({ data }: this['RenderArgs']) {
    this.clickCount = data?.initial ?? 0;
    const button = this.element?.shadowRoot?.querySelector('#btn');
    if (button) {
      button.addEventListener('click', this.handleClick);
    }
  }

  // Remove listeners to prevent memory leaks
  override destroy() {
    const button = this.element?.shadowRoot?.querySelector('#btn');
    if (button) {
      button.removeEventListener('click', this.handleClick);
    }
  }
}
```

**Lifecycle flow:**

- **SSR mode (`/html/*`)**: Server renders HTML → Browser adopts via `data-ssr`
  → `hydrate(args)` called with `{ data, params, context }` → widget is interactive
- **SPA mode (`/*`)**: `getData()` → `renderHTML()` → `hydrate(args)` called →
  widget is interactive

The `hydrate(args)` hook is called after rendering in both modes, receiving the
same `{ data, params, context }` as render methods. This makes it the single
place to attach all event listeners and access widget state.

**Key patterns:**

- **Separation of concerns**: `renderHTML()` returns markup, `hydrate()` adds
  interactivity
- **Memory safety**: Use method references (`this.handleClick = () => {}`) so
  `removeEventListener` in `destroy()` works correctly
- **Framework widgets**: If loading a third-party library (React, Preact, etc.),
  load it in `hydrate()` if not already available, since `getData()` may be
  skipped in SSR mode
- **Pages don't hydrate**: Only widgets (custom elements) receive the `hydrate()`
  call. Pages are rendered directly via `innerHTML` without lifecycle hooks

### Lazy Loading

Add the `lazy` attribute to defer a widget's `loadData()` until it scrolls into
the viewport — same pattern as `<img loading="lazy">`:

```html
<widget-crypto-price lazy coin="bitcoin"></widget-crypto-price>
```

The widget's `connectedCallback` sets up an `IntersectionObserver` instead of
calling `loadData()` immediately. Once the element becomes visible, the observer
disconnects and data loading begins.

**Key behaviors:**

- Laziness is decided at the usage site, not the widget definition — the same
  widget can be lazy in one place and eager in another.
- SSR ignores `lazy` — lazy widgets are still pre-rendered server-side. On the
  client, the SSR hydration path fires first (restores from `data-ssr`, skips
  `loadData`), so `lazy` has no effect on SSR-hydrated widgets.
- `reload()` always fetches immediately, regardless of `lazy`.
- The `lazy` attribute is not parsed as a widget parameter.

## Extending Context

By default, `ComponentContext` carries route info, pre-loaded files, and an
abort signal. You can inject app-level services (RPC clients, auth, feature
flags) so every component can access them from `getData` and render methods.

### 1. Register a context provider

Pass `extendContext` when creating any router. The callback receives the base
context and returns an enriched version. Always spread `base` to preserve
routing, file, and signal data:

```ts
// Browser (SPA)
import { createSpaHtmlRouter } from '@emkodev/emroute/spa';

await createSpaHtmlRouter(routesManifest, {
  extendContext: (base) => ({ ...base, rpc: myRpcClient }),
});

// Server (SSR)
import { createSsrHtmlRouter } from '@emkodev/emroute/ssr/html';

const htmlRouter = createSsrHtmlRouter(manifest, {
  widgets,
  extendContext: (base) => ({ ...base, rpc: myRpcClient }),
});
```

The provider runs synchronously for every context construction — pages and
widgets alike.

### 2. Access custom properties in components

TypeScript needs to know about the extra properties. Two options:

**Module augmentation** (app-wide, zero per-component boilerplate):

```ts
declare module '@emkodev/emroute' {
  interface ComponentContext {
    rpc: RpcClient;
  }
}
```

**Third generic** (explicit per-component):

```ts
interface AppContext extends ComponentContext {
  rpc: RpcClient;
}

class ProjectPage extends PageComponent<{ id: string }, ProjectData, AppContext> {
  override async getData({ context }: this['DataArgs']) {
    return context!.rpc.getProject(this.params.id);
  }
}
```

Both approaches work with `PageComponent`, `WidgetComponent`, and the base
`Component` class. The third generic defaults to `ComponentContext`, so existing
code is unaffected.

## Error Handling

Three layers, from most specific to least:

### 1. Widget Errors (inline)

When a widget's `getData()` or rendering throws, the widget's `renderError()`
method handles it inline. The rest of the page continues rendering. Page
component errors skip this layer and bubble up to error boundaries.

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

An `index.error.ts` at the routes root catches everything not caught by a
boundary:

```ts
// routes/index.error.ts
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

In the SPA, this navigates client-side. In SSR HTML, it returns a
`<meta http-equiv="refresh">` tag with the configured status code. In SSR
Markdown, it returns a plain-text `Redirect to: {url}` message with the status
code. The SSR renderers set the HTTP status (301/302) but do not emit a
`Location` header — your server layer can add one if needed.

## SPA Setup

### Zero-config (default)

When you don't provide `main.ts` or `index.html`, the dev server generates
both. The generated entry point registers auto-discovered widgets and
initializes the SPA router. The generated HTML shell contains a `<router-slot>`
with the bundled script injected before `</body>`.

This is the recommended starting point. You only need custom files when you
have specific requirements (markdown renderer, vendor widgets, custom `<head>`
content).

### Custom entry point

Create a `main.ts` when you need to configure a markdown renderer, register
vendor widgets, or run other client-side setup:

```ts
// main.ts
import { createSpaHtmlRouter, MarkdownElement } from '@emkodev/emroute/spa';
import { routesManifest } from './routes.manifest.ts';

MarkdownElement.setRenderer({
  render: (md) => myMarkdownLib.render(md),
});

await createSpaHtmlRouter(routesManifest, {
  // extendContext: (base) => ({ ...base, rpc: myRpcClient }),
});
```

> **When do you need a markdown renderer?** Only in the SPA (browser). SSR
> markdown mode (`/md/*`) outputs raw markdown text and never invokes the
> `<mark-down>` element. SSR HTML mode (`/html/*`) renders components
> server-side without custom elements. But in the SPA, navigating to a
> `.page.md` route renders it through the `<mark-down>` custom element, which
> requires a renderer. If your app has no `.page.md` routes, you can skip
> `setRenderer()` entirely. See [Markdown Renderers](./markdown-renderer.md)
> for available options.

### Custom HTML shell

Create an `index.html` when you need custom `<head>` content, fonts, or meta
tags. The server injects the `<script>` tag automatically before `</body>` —
don't add your own:

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>My App</title>
    <link rel="icon" href="/favicon.ico">
  </head>
  <body>
    <router-slot></router-slot>
  </body>
</html>
```

If a `main.css` file exists in your app root, the server injects a
`<link rel="stylesheet" href="/main.css">` before `</head>` automatically.

### SPA router

The router is stored on `globalThis.__emroute_router` after initialization,
giving consumer scripts programmatic access without needing a module reference.
Calling `createSpaHtmlRouter()` twice returns the existing instance with a
console warning.

The SPA router:

- Uses the Navigation API for client-side navigation (intercepts link clicks, form GETs, and back/forward)
- Matches the URL against the routes manifest
- Builds the route hierarchy and renders parent → child into nested `<router-slot>` elements
- Intercepts `/html/` links for client-side navigation (SSR links work transparently in SPA context)
- Passes `/md/` links through to the server for plain text output
- Fires `navigate`, `load`, and `error` events
- Wraps route changes in `document.startViewTransition()` for animated
  cross-fades (progressive enhancement — instant fallback in older browsers)

**View Transitions:** Route changes are animated via the View Transitions API by
default. The browser cross-fades between old and new page content with no
configuration needed. Customize or disable via CSS:

```css
/* Custom slide animation */
::view-transition-old(root) {
  animation: slide-out 0.2s ease-in;
}
::view-transition-new(root) {
  animation: slide-in 0.2s ease-out;
}

/* Disable transitions entirely */
::view-transition-group(*) {
  animation-duration: 0s;
}
```

```ts
// From the return value:
const router = await createSpaHtmlRouter(routesManifest);

// Or from globalThis (e.g. in a separate script):
const router = globalThis.__emroute_router;

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

Route patterns in the manifest include the base path prefix (e.g. `/html/projects/:id`), so the SSR renderers match against the full pathname.

**SSR HTML renders widgets server-side.** The HTML renderer calls each
component's `renderHTML()` and assembles the route hierarchy. When a
`WidgetRegistry` is provided, `<widget-*>` tags are resolved: the renderer
calls `getData()` + `renderHTML()` on each widget, fills the tag with rendered
content, and adds a `data-ssr` attribute with serialized data. In the browser,
the SPA adopts this content without re-rendering — it detects `data-ssr`,
restores state, calls `hydrate()` to attach event listeners, and the widget is
fully interactive.

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
  errorHandler: { pattern: '/', type: 'error', modulePath: 'routes/index.error.ts' },
  moduleLoaders: {
    'routes/projects/[id].page.ts': () => import('./routes/projects/[id].page.ts'),
    'routes/index.error.ts': () => import('./routes/index.error.ts'),
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
and handles SSR routes. At minimum, you need a `routes/` directory — everything
else is auto-generated:

```ts
import { createDevServer } from '@emkodev/emroute/server';
import { denoServerRuntime } from '@emkodev/emroute/server/deno';

const server = await createDevServer({
  port: 3000,
  routesDir: 'routes',
}, denoServerRuntime);
```

With more options:

```ts
const server = await createDevServer({
  port: 3000,
  routesDir: 'routes', // Auto-generates routes.manifest.ts
  widgetsDir: 'widgets', // Auto-discovers widgets
  entryPoint: 'main.ts', // Optional — generated when absent
  appRoot: '.', // Root for file resolution
  watch: true, // Rebuild on changes
  title: 'My App', // HTML <title> for generated shell
  spa: 'root', // SPA mode (see below)
}, denoServerRuntime);
```

### Auto-generated files

The server detects which files you provide and generates the rest:

| File         | Provided | Generated behavior                                                  |
| ------------ | -------- | ------------------------------------------------------------------- |
| `main.ts`    | yes      | Bundled as-is                                                       |
| `main.ts`    | no       | `_main.generated.ts` created with widget registration + router init |
| `index.html` | yes      | Used as shell, `<script>` and `<link>` tags injected                |
| `index.html` | no       | Minimal HTML shell generated with `<router-slot>`                   |
| `main.css`   | yes      | `<link rel="stylesheet">` auto-injected into `<head>`               |
| `main.css`   | no       | No stylesheet injected                                              |

### SPA modes

The `spa` option controls how the server handles non-file requests:

| Mode     | `GET /`        | `GET /about`        | `/html/*` | `/md/*`   |
| -------- | -------------- | ------------------- | --------- | --------- |
| `'root'` | SPA shell      | SPA shell           | SSR HTML  | SSR MD    |
| `'leaf'` | 302 → `/html/` | SPA shell           | SSR HTML  | SSR MD    |
| `'none'` | 302 → `/html/` | 302 → `/html/about` | SSR HTML  | SSR MD    |
| `'only'` | SPA shell      | SPA shell           | SPA shell | SPA shell |

- **`'root'`** (default) — full SPA with SSR fallback endpoints
- **`'leaf'`** — SSR landing page at `/`, SPA for deeper routes
- **`'none'`** — pure SSR, no client-side routing
- **`'only'`** — pure SPA, no SSR endpoints

In `'root'`, `'leaf'`, and `'none'` modes, the SPA shell includes an HTML
comment hinting at the SSR endpoints for LLMs and text clients.

**Required permissions** (Deno):

```bash
deno run --allow-net --allow-read --allow-write --allow-run --allow-env dev.ts
```

- `--allow-net` — HTTP server
- `--allow-read` — read route files, templates, static assets
- `--allow-write` — write generated manifests and `.build/` output
- `--allow-run` — spawn `deno bundle --watch` for bundling
- `--allow-env` — read `PORT`, `ENTRY_POINT`, etc. (optional, only if using env vars)

## Design Principles

1. **Native APIs only.** URLPattern for routing, custom elements for rendering,
   Navigation API for client-side navigation. No framework runtime.

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
