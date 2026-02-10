# Error Handling

emroute handles errors at three levels. Each level catches what the level below
it cannot. When something breaks, the most specific handler wins.

## Layer 1 — Widget Errors (inline)

Every **widget** has built-in error rendering. When a widget's `getData()` or
render method throws, the error is caught and rendered inline. The rest of the
page continues rendering normally.

**HTML context** — renders a `<div class="c-error">`:

```html
<div class="c-error" data-component="crypto-price">Error: fetch failed</div>
```

**Markdown context** — renders a blockquote:

```md
> **Error** (`crypto-price`): fetch failed
```

Override `renderError()` or `renderMarkdownError()` on any widget to customize
the output:

```ts
class MyWidget extends WidgetComponent {
  override readonly name = 'my-widget';

  override renderError({ error }: { error: unknown }) {
    const msg = error instanceof Error ? error.message : String(error);
    return `<div class="widget-error"><p>Could not load widget: ${msg}</p></div>`;
  }

  override renderMarkdownError(error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return `*Widget unavailable: ${msg}*`;
  }
}
```

Widget errors are fully contained — a failing widget never takes down the page.

**Page component** errors are **not** caught inline. When a page's `getData()`
or render method throws, the error bubbles up to the next layer (error
boundary or root handler).

## Layer 2 — Error Boundaries (scoped)

An `.error.ts` file catches runtime errors for all routes under a URL prefix.
Place it next to the routes it should protect:

```
routes/
  projects/
    [id].page.ts           →  /projects/:id
    [id]/
      tasks.page.ts        →  /projects/:id/tasks
    [id].error.ts          →  catches errors for /projects/*
```

The boundary file exports a `PageComponent`:

```ts
// routes/projects/[id].error.ts
import { PageComponent } from '@emkodev/emroute';

class ProjectErrorBoundary extends PageComponent {
  override readonly name = 'project-error';

  override renderHTML() {
    return '<h1>Project Error</h1><p>Something went wrong loading this project.</p>';
  }

  override renderMarkdown() {
    return '# Project Error\n\nSomething went wrong loading this project.';
  }
}

export default new ProjectErrorBoundary();
```

**Pattern matching:** the file path determines the scope. `[id].error.ts` inside
`projects/` produces the pattern `/projects`. Any error thrown while rendering a
route that starts with `/projects` (or `/projects/...`) is caught by this
boundary. When multiple boundaries match, the most specific one (longest pattern)
wins.

Error boundaries are `.ts` only — they are components with rendering logic, not
static content files.

## Layer 3 — Root Error Handler (global fallback)

An `index.error.ts` at the routes root catches everything not caught by a scoped
boundary:

```
routes/
  index.error.ts           →  catches all unhandled errors
  projects/
    [id].error.ts          →  catches /projects/* errors first
```

```ts
// routes/index.error.ts
import { PageComponent } from '@emkodev/emroute';

class RootError extends PageComponent {
  override readonly name = 'root-error';

  override renderHTML() {
    return '<h1>Something Went Wrong</h1><p>Please try again later.</p>';
  }

  override renderMarkdown() {
    return '# Something Went Wrong\n\nPlease try again later.';
  }
}

export default new RootError();
```

If even the root error handler throws, the router falls back to a minimal inline
message: `<h1>Error</h1><p>{escaped message}</p>`.

## Status Pages (HTTP status codes)

Status pages are normal page files named by HTTP status code. They handle known
HTTP conditions (not-found, unauthorized, forbidden) — as opposed to error
boundaries which catch unexpected runtime failures.

```
routes/
  404.page.html            →  shown when no route matches
  401.page.ts              →  shown on 401 responses
  403.page.md              →  shown on 403 responses
```

Status pages support all three content types (`.ts`, `.html`, `.md`) and go
through the standard `PageComponent` rendering pipeline. They are registered in
the manifest as `statusPages` keyed by status code.

**Triggering a status page from a component:** throw a `Response` object with
the desired status code. The router catches it and renders the matching status
page:

```ts
override async getData({ params }) {
  const res = await fetch(`/api/projects/${params.id}`);
  if (!res.ok) throw new Response(null, { status: res.status });
  return res.json();
}
```

If no status page is defined for that code, the router renders a built-in
fallback with the status message.

## Resolution Order

When something goes wrong during navigation or rendering:

```
Widgets:
1. Widget.renderError()           →  inline error, page keeps rendering

Pages:
1. Scoped error boundary          →  replaces page content for that URL prefix
2. Root error handler             →  replaces page content globally
3. Built-in inline fallback       →  <h1>Error</h1><p>{message}</p>
```

For HTTP status conditions (thrown `Response` objects):

```
1. Status page (e.g., 404.page.html)
2. Built-in inline status message
```

## File Naming Summary

| File pattern             | Role               | Scope                     |
| ------------------------ | ------------------ | ------------------------- |
| `index.error.ts`         | Root error handler | All routes (global)       |
| `*.error.ts`             | Error boundary     | Routes under matched path |
| `{code}.page.ts/html/md` | Status page        | Specific HTTP status code |

Error boundaries and the root error handler are always `.ts`. Status pages
support `.ts`, `.html`, and `.md` like regular pages.

## Across Rendering Contexts

All three layers work identically in SPA, SSR HTML, and SSR Markdown modes:

- **SPA** — errors caught during client-side navigation; error boundary or
  status page HTML injected into the `<router-slot>`
- **SSR HTML** — errors caught during server-side rendering; the response
  includes the error/status page HTML with the appropriate HTTP status code
- **SSR Markdown** — same as SSR HTML but components render via
  `renderMarkdown()` instead of `renderHTML()`
