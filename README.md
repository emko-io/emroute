<p align="center">
  <img src="https://raw.githubusercontent.com/emko-io/emroute/main/doc/logo-full.png" alt="emroute" width="197" height="40">
</p>

<p align="center">
  File-based (but storage-agnostic) router with triple rendering. Zero dependencies.
</p>

---

Every route renders three ways from the same component: as a **Single Page App**
in the browser, as **server-rendered HTML**, and as **plain Markdown**. No
separate API layer needed — prefix any route with `/md/` and get text that LLMs,
scripts, and `curl` can consume directly.

```
GET /projects/42          → SPA (hydrated in browser)
GET /html/projects/42     → pre-rendered HTML
GET /md/projects/42       → plain Markdown
```

## Install

```bash
npm add @emkodev/emroute    # or bun add, pnpm add, yarn add
```

Works on **Node**, **Bun**, and **Deno**. Node uses compiled JS; Bun and Deno
use TypeScript source directly.

For markdown rendering, add [@emkodev/emkoma](doc/08c-setup-emkoma.md) (built
for emroute) or bring your own — [marked](doc/08a-setup-marked.md) and
[markdown-it](doc/08b-setup-markdown-it.md) both work.

## How It Works

<p align="center">
  <img src="https://raw.githubusercontent.com/emko-io/emroute/main/doc/diagram-full.png" alt="emroute architecture" width="480" height="480">
</p>

One component, three rendering paths:

<p align="center">
  <img src="https://raw.githubusercontent.com/emko-io/emroute/main/doc/diagram-flow-spa.png" alt="SPA flow" width="320" height="320">
  <img src="https://raw.githubusercontent.com/emko-io/emroute/main/doc/diagram-flow-ssr-html.png" alt="SSR HTML flow" width="320" height="320">
  <img src="https://raw.githubusercontent.com/emko-io/emroute/main/doc/diagram-flow-ssr-md.png" alt="SSR Markdown flow" width="320" height="320">
</p>

The SPA and SSR HTML flows both call `renderHTML()` — same output, different
delivery. The SSR Markdown flow calls `renderMarkdown()` instead, bypassing
HTML entirely for plain text output.

Routes are files. The filesystem is the config.

```
routes/
  index.page.md              → /
  about.page.html            → /about
  projects.page.md           → /projects
  projects/
    [id].page.ts             → /projects/:id
    [id]/
      tasks.page.ts          → /projects/:id/tasks
  404.page.html              → not found
  index.error.ts             → root error handler
```

A route can be a `.md` file, an `.html` template, a `.ts` component, or a
combination. When a `.page.ts` exists, it controls data fetching and rendering.
When it doesn't, the framework renders the `.html` or `.md` file directly.

```ts
import { PageComponent } from '@emkodev/emroute';

class ProjectPage extends PageComponent<{ id: string }, ProjectData> {
  override readonly name = 'project';

  override async getData({ params }: this['DataArgs']) {
    const res = await fetch(`/api/projects/${params.id}`);
    return res.json();
  }

  override renderHTML({ data, params, context }: this['RenderArgs']) {
    // context.files.html has the companion .page.html template if it exists
    const template = context.files?.html ?? `<h1>${data.name}</h1>`;
    return template.replaceAll('{{id}}', params.id) + '<router-slot></router-slot>';
  }

  override renderMarkdown({ data, context }: this['RenderArgs']) {
    // context.files.md has the companion .page.md content if it exists
    return context.files?.md ?? `# ${data.name}\n\nStatus: ${data.status}`;
  }
}

export default new ProjectPage();
```

## Features

- **File-based routing** with dynamic segments (`[id]`), catch-all directories, and nested layouts via `<router-slot>`. Routes follow REST conventions: exact routes are terminal resources, catch-all directories own their namespace
- **Triple rendering** — SPA, SSR HTML, SSR Markdown from one component
- **Companion files** — `.page.html`, `.page.md`, `.page.css` loaded automatically and passed through context
- **Widgets** — interactive islands with their own data lifecycle, error handling, and optional file companions (`.html`, `.md`, `.css`). Auto-discovered from a `widgets/` directory or registered manually. `this.element` gives opt-in DOM access in the browser. `<widget-foo lazy>` defers loading until visible via `IntersectionObserver`
- **View Transitions** — SPA route changes animate via `document.startViewTransition()`. Progressive enhancement with CSS-only customization
- **Scoped CSS** — companion `.widget.css` files auto-wrapped in `@scope (widget-{name}) { ... }`
- **Shadow DOM** — unified Declarative Shadow DOM architecture for SSR and SPA. Widgets render into shadow roots for true CSS encapsulation and Web Components spec compliance
- **SSR hydration** — server-rendered HTML adopted by the SPA without re-rendering. Widgets can implement `hydrate(args)` to attach event listeners after SSR adoption, receiving `{ data, params, context }`
- **Error boundaries** — scoped error handlers per route prefix, plus status pages (`404.page.html`) and a root fallback
- **Extensible context** — inject app-level services (RPC clients, auth, feature flags) into every component via `extendContext` on the router. Type-safe access through module augmentation or a per-component generic
- **Declarative overlays** — popovers, modals, and toasts with zero JS via Invoker Commands API and CSS keyframe animations. Programmatic API available for dynamic content
- **Zero dependencies** — native APIs only (URLPattern, custom elements, Navigation API). No framework runtime, no virtual DOM, no build-time magic
- **Pluggable markdown** — `<mark-down>` custom element with a swappable parser interface; bring your own renderer
- **Redirects** — declarative `.redirect.ts` files with 301/302 support
- **Configurable base paths** — `/html/` and `/md/` prefixes are configurable via `BasePath`
- **SPA modes** — `'root'` (default), `'leaf'`, `'none'`, or `'only'` to control how the server handles non-file requests and SSR endpoints
- **Sitemap generation** — opt-in `sitemap.xml` from the routes manifest with support for dynamic route enumerators
- **Dev server** — zero-config: auto-generates `main.ts`, `index.html`, and route/widget manifests. File watcher with hot reload and bundle serving

## Runtimes

The router is storage-agnostic — it reads routes through a `Runtime` abstraction,
not the filesystem directly. emroute ships four runtimes:

- **`BunFsRuntime`** — Bun-native APIs (`Bun.file()`, `Bun.write()`,
  `Bun.Transpiler`). The default choice for Bun projects.
- **`UniversalFsRuntime`** — `node:` APIs only. Works on Node, Deno, and Bun.
- **`BunSqliteRuntime`** — stores routes in a SQLite database. Proves the
  storage-agnostic design: no filesystem needed.
- **`FetchRuntime`** — browser runtime that fetches files from a remote server.
  Powers the SPA in `root` and `only` modes.

Bun runs TypeScript source directly. Node and Deno use the compiled JS from
`dist/`. See [ADR-0017](doc/architecture/ADR-0017-move-to-bun-ecosystem.md) for
the full analysis.

## Getting Started

Pick your runtime: [Bun](doc/01a-setup-bun.md) | [Node](doc/01b-setup-node.md) | [Deno](doc/01c-setup-deno.md)

## Documentation

- Setup — [Bun](doc/01a-setup-bun.md), [Node](doc/01b-setup-node.md), [Deno](doc/01c-setup-deno.md)
- [First route](doc/02-first-route.md) — route files and rendering modes
- [Pages](doc/03-pages.md) — page components, companion files, data fetching
- [Routing](doc/04-routing.md) — dynamic segments, catch-all, redirects
- [Nesting](doc/05-nesting.md) — layouts, slots, passthrough pages, tips and tricks
- [Widgets](doc/06-widgets.md) — interactive islands with data lifecycle
- [Server](doc/07-server.md) — `createEmrouteServer`, composition, static files
- [Markdown renderers](doc/08-markdown-renderer.md) — pluggable parser interface and setup
- [Runtime](doc/09-runtime.md) — abstract runtime, UniversalFsRuntime, BunFsRuntime, BunSqliteRuntime
- [SPA modes](doc/10-spa-mode.md) — none, leaf, root, only
- [Error handling](doc/11-error-handling.md) — widget errors, boundaries, status pages
- [Shadow DOM](doc/12-shadow-dom.md) — unified architecture, SSR hydration
- [Hono integration](doc/13-hono.md) — using emroute with Hono

### For contributors and architects

- [Architectural decisions](doc/architecture/) — ADR-0001 through ADR-0017

<img src="https://raw.githubusercontent.com/emko-io/emroute/main/doc/logo-full.png" alt="emroute" width="197" height="40">
