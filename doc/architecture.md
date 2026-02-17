# emroute Architecture

## The Idea

One set of routes, three ways to consume them:

1. **SPA** (`/`) — browser renders into a live DOM, with client-side navigation via Navigation API, hydrated widgets in Shadow DOM
2. **SSR HTML** (`/html/*`) — server renders routes to HTML, expanding markdown server-side, with widgets hydrating as islands
3. **SSR Markdown** (`/md/*`) — server renders routes to plain markdown, readable by LLMs, curl, text clients

The same page component produces all three outputs. The router decides which renderer to call based on the request path prefix.

## Why Markdown as a First-Class Output

HTML is for browsers. But not every consumer is a browser:

- An LLM reading your site doesn't need `<div class="flex gap-4">`, it needs `## Projects`
- A CLI tool piping your docs doesn't need a DOM, it needs text
- A search indexer wants structure, not presentation

Markdown is the universal content format. If your page can express itself as markdown, it can be consumed anywhere. HTML is just one rendering of that markdown.

## File-Based Routing

Routes are defined by filesystem convention, not configuration:

```
routes/
  index.page.md          # / (content only, no logic)
  about.page.html        # /about (static HTML)
  projects.page.ts       # /projects (dynamic)
  projects/
    [id].page.ts         # /projects/:id
    [id].page.html       # /projects/:id (HTML template)
    [id]/
      tasks.page.ts      # /projects/:id/tasks
    [id].error.ts        # error boundary for /projects/:id/*
  404.page.html          # status page (not found)
  index.error.ts         # root error handler
  old-url.redirect.ts    # redirect
```

A route is defined by one or more files sharing the same stem:

- `.page.ts` — logic (data fetching, custom rendering)
- `.page.html` — HTML template
- `.page.md` — markdown content
- `.page.css` — styles (injected as `<style>` tag in HTML rendering)

These combine. A route can have all four, or just one. A `.page.css` file alone does not create a route — it's always a companion.

## The Component

Every route is a `PageComponent`. Either you write one (`.page.ts`), or the router uses a `DefaultPageComponent` that does the obvious thing with whatever files exist.

A `PageComponent` has two rendering methods:

```
renderHTML({ data, params, context })  → string (HTML)
renderMarkdown({ data, params, context })  → string (Markdown)
```

The SPA and SSR HTML routers call `renderHTML`. The SSR Markdown router calls `renderMarkdown`. Same component, different output.

## The Fallback Chain

When you don't override the render methods, `PageComponent` follows a fallback chain based on what files exist:

| Files present   | `renderHTML()`                                     | `renderMarkdown()`        |
| --------------- | -------------------------------------------------- | ------------------------- |
| `.html` + `.md` | `<style>` (if css) + HTML file content             | Markdown file content     |
| `.html` only    | `<style>` (if css) + HTML file content             | `router-slot` placeholder |
| `.md` only      | `<style>` (if css) + `<mark-down>` markdown + slot | Markdown file content     |
| Neither         | Bare `<router-slot>`                               | `router-slot` placeholder |

When a `.page.css` file exists alongside other files, its content is prepended as a `<style>` tag in `renderHTML()`. CSS alone (no `.html`/`.md`) does not inject — the slot fallback returns bare `<router-slot>`.

The `<router-slot>` is where child routes get injected. A route with no content of its own is a layout — it just passes through to its children.

This table describes the **defaults**. When a `.page.ts` file exists and exports a `PageComponent` subclass, that component can override `renderHTML` and `renderMarkdown` to do whatever it wants — the fallback chain only applies to methods that aren't overridden. A `.page.ts` with no companion `.html`/`.md` files is the fully custom case: the component is entirely responsible for producing its own output, with no file content in context to fall back on.

## Route Hierarchy and Nesting

Routes nest by filesystem path. Navigating to `/projects/123/tasks` builds a hierarchy:

```
/                     → root layout (slot)
/projects/:id         → project page
/projects/:id/tasks   → tasks page
```

Each level renders its content, and the next level's output replaces the `<router-slot>` in the previous level. This works differently per renderer:

- **SPA**: DOM injection — set content on the slot element via `setHTMLUnsafe()`, recurse
- **SSR HTML**: string replacement — replace `<router-slot></router-slot>` in the parent string
- **SSR Markdown**: string replacement — replace `` ```router-slot\n``` `` fenced block in the parent string

## RouteInfo and ComponentContext

Every navigation produces a `RouteInfo` — an immutable snapshot of the matched route, built once and shared across the entire render pipeline:

```typescript
type RouteParams = Readonly<Record<string, string>>;

interface RouteInfo {
  readonly pathname: string; // actual URL path: /projects/123
  readonly pattern: string; // route pattern: /projects/:id
  readonly params: RouteParams;
  readonly searchParams: URLSearchParams;
}
```

The router loads file content before calling the component. The component receives a `ComponentContext` that extends `RouteInfo` with pre-loaded file content:

```typescript
interface ComponentContext extends RouteInfo {
  readonly files?: Readonly<{ html?: string; md?: string; css?: string }>;
  readonly signal?: AbortSignal;
  readonly isLeaf?: boolean;
}
```

The component never fetches its own files. The router does that once, passes the context, and the component decides how to use it. This keeps components pure and testable.

`isLeaf` tells the component whether it is the matched (leaf) route or a layout parent rendering on behalf of a child. A page that serves as both a content page and a layout can use this to skip expensive data fetching and render a bare `<router-slot>` when it's just passing through. See [Nested Routes — Leaf vs Layout](nesting.md#leaf-vs-layout-contextisleaf) for the full pattern.

### Extending ComponentContext

Consumers can inject app-level services into every `ComponentContext` via the `extendContext` option on any router. The router calls this callback after building the base context (route info + files + signal), and the enriched context flows to all `getData` and render methods — both pages and widgets. See the [Extending Context](../doc/guide.md#extending-context) section of the consumer guide for usage.

## Markdown Rendering

Markdown content flows through different paths depending on the renderer:

- **SPA**: `renderHTML` produces `<mark-down>content</mark-down>`. The `MarkdownElement` custom element renders it client-side using a pluggable `MarkdownRenderer` set via `MarkdownElement.setRenderer()`.
- **SSR HTML**: `renderHTML` produces the same `<mark-down>` tags, but `SsrHtmlRouter` expands them server-side before sending the response. It unescapes HTML entities, runs the markdown through the renderer, and processes fenced blocks (router-slots and widgets). The result is plain HTML — no `<mark-down>` elements reach the browser.
- **SSR Markdown**: `renderMarkdown` returns raw markdown. No rendering step.

The `MarkdownRenderer` interface is shared between browser and server:

```typescript
interface MarkdownRenderer {
  init?(): Promise<void>;
  render(markdown: string): string;
}
```

The renderer is pluggable — the router doesn't know or care what parses the markdown. The app provides the implementation (e.g., emko-md with WASM) at setup time.

## Page Titles

A component can declare its page title via `getTitle({ data, params, context })`. This returns a string or `undefined`.

Each renderer handles it differently:

- **SPA**: Sets `document.title`. Falls back to extracting a `<title>` element from the rendered HTML if `getTitle` returns nothing.
- **SSR HTML**: Returns the title alongside the HTML, so the server can set `<title>` in the document shell.
- **SSR Markdown**: Ignores it. Markdown has no concept of document title.

This lets a `.page.ts` control the browser tab title without touching the HTML template.

## Status Pages and Error Boundaries

Status-code pages follow the same file convention, prefixed with the code:

```
routes/
  404.page.md     # not found
  401.page.md     # unauthorized
  403.page.md     # forbidden
```

These are regular page files — markdown, HTML, or TypeScript. The router renders them through the same `PageComponent` pipeline. A `404.page.md` gets a `DefaultPageComponent`, a `404.page.ts` gets its custom component.

Error boundaries catch rendering failures within a route subtree:

```
routes/
  projects/
    [id].error.ts   # catches errors in /projects/:id and children
  index.error.ts    # root-level catch-all
```

An error boundary receives the error and the route that failed, and produces an error page. The root `index.error.ts` is the last resort.

## Widgets (Islands)

Interactive pieces that live inside markdown content:

````markdown
## Dashboard

Here are your project stats:

```widget:project-stats
{"projectId": "123"}
```
````

The fenced block is processed differently per renderer:

- **SPA**: `MarkdownElement` converts it to `<widget-project-stats project-id="123">` during client-side markdown rendering. The custom element hydrates.
- **SSR HTML**: `SsrHtmlRouter` expands the `<mark-down>` tag server-side, converting the fenced block to a `<widget-project-stats>` element. If a `WidgetRegistry` is provided, the renderer calls `getData()` + `renderHTML()` on the widget, fills the tag with rendered content, and adds `data-ssr` with serialized data. The SPA adopts this content without re-rendering.
- **SSR Markdown**: If a `WidgetRegistry` is provided, the fenced block is replaced with the widget's `renderMarkdown()` output. Otherwise it passes through as-is.

Widgets are embeddable units within page content. Pages live in the routes manifest; widgets live in the `WidgetRegistry`. Everything reusable that is not a page is a widget.

Widgets can declare companion files (`.html`, `.md`, `.css`) via a `files` property. These are loaded by the SSR infrastructure and passed through `ComponentContext.files`, the same way page files work. File paths are relative to the app root; absolute URLs are also supported for remote assets.

## No Framework

- No virtual DOM. `setHTMLUnsafe()` for the SPA, string concatenation for SSR.
- No build-time JSX transform. Templates are template literals.
- No client-side state management. URL is the state.
- No hydration mismatch problem. SPA detects SSR content via `data-ssr-route` and adopts it.
- Shadow DOM custom elements for widgets. Declarative Shadow DOM for SSR, real Shadow DOM in the browser.

The router is ~500 lines across three renderers sharing a core. Pages are classes with two render methods. That's the whole framework.

---

<img src="./logo-full.png" alt="emroute" width="197" height="40">
