<p align="center">
  <img src="https://jsr.io/@emkodev/emroute/1.0.0/doc/logo-full.svg" alt="emroute" width="394" height="80">
</p>

<p align="center">
  File-based router with triple rendering. Zero dependencies.
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

## How It Works

<p align="center">
  <img src="https://jsr.io/@emkodev/emroute/1.0.0/doc/diagram-tp.svg" alt="emroute architecture" width="480" height="480">
</p>

One component, three rendering paths:

<p align="center">
  <img src="https://jsr.io/@emkodev/emroute/1.0.0/doc/diagram-flow-spa.svg" alt="SPA flow" width="320" height="320">
  <img src="https://jsr.io/@emkodev/emroute/1.0.0/doc/diagram-flow-ssr-html.svg" alt="SSR HTML flow" width="320" height="320">
  <img src="https://jsr.io/@emkodev/emroute/1.0.0/doc/diagram-flow-ssr-md.svg" alt="SSR Markdown flow" width="320" height="320">
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

  override async getData({ params }) {
    const res = await fetch(`/api/projects/${params.id}`);
    return res.json();
  }

  override renderHTML({ data, params, context }) {
    // context.files.html has the companion .page.html template if it exists
    const template = context?.files?.html ?? `<h1>\${data.name}</h1>`;
    return template.replaceAll('{{id}}', params.id) + '<router-slot></router-slot>';
  }

  override renderMarkdown({ data, context }) {
    // context.files.md has the companion .page.md content if it exists
    return context?.files?.md ?? `# ${data.name}\n\nStatus: ${data.status}`;
  }
}

export default new ProjectPage();
```

## Features

- **File-based routing** with dynamic segments (`[id]`), catch-all directories, and nested layouts via `<router-slot>`
- **Triple rendering** — SPA, SSR HTML, SSR Markdown from one component
- **Companion files** — `.page.html`, `.page.md`, `.page.css` loaded automatically and passed through context
- **Widgets** — interactive islands with their own data lifecycle, error handling, and optional file companions (`.html`, `.md`, `.css`)
- **SSR hydration** — server-rendered HTML adopted by the SPA without re-rendering
- **Error boundaries** — scoped error handlers per route prefix, plus status pages (`404.page.html`) and a root fallback
- **Native APIs only** — URLPattern, custom elements, History API. No framework runtime, no virtual DOM, no build-time magic
- **Redirects** — declarative `.redirect.ts` files with 301/302 support

## Getting Started

See the [Quick Start](doc/quick-start.md) — three files, one command.

```bash
deno task dev             # start dev server
deno task test            # run tests
```

## Documentation

- [Quick start](doc/quick-start.md) — three files, one command
- [Consumer guide](doc/guide.md) — routing, components, widgets, error handling, SSR, dev server
- [Markdown renderers](doc/markdown-renderer.md) — pluggable parser interface and setup examples
- [Setting up emko-md](doc/setup-emko-md.md) — WASM markdown renderer with client + server config

### For contributors and architects

- [Architecture overview](doc/architecture.md) — design philosophy, component model, rendering pipeline
- [Architectural decisions](doc/architecture/) — ADR-0001 through ADR-0011
