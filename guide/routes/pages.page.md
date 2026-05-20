# Page Types

Every route is defined by one or more files in the `routes/` directory. There
are three file types: `.page.ts` for components, `.page.html` for HTML
templates, and `.page.md` for markdown. When a `.page.ts` exists, it controls
the route entirely. When it doesn't, the framework's default component
renders the `.page.html` or `.page.md` directly.

## Markdown pages (`.page.md`)

The simplest page type. Write markdown, get HTML and markdown output:

```md filepath=routes/about.page.md
# About

Built with emroute.
```

- SSR HTML: markdown is converted to HTML via your configured markdown renderer
- SSR Markdown: raw markdown is returned as-is

## HTML pages (`.page.html`)

HTML fragments for static content. No `<!DOCTYPE>`, `<html>`, or `<body>` — the
server wraps your content in a full document:

```html filepath=routes/about.page.html
<h1>About</h1>
<p>Built with emroute.</p>
```

- SSR HTML: the fragment is injected into the page shell
- SSR Markdown: empty body (no markdown companion)

## TypeScript components (`.page.ts`)

Full components with data fetching, custom rendering, and titles. Extend
`PageComponent`:

```ts filepath=routes/projects.page.ts
import { PageComponent, escapeHtml } from '@emkodev/emroute';

interface ProjectData {
  count: number;
}

class ProjectsPage extends PageComponent<Record<string, string>, ProjectData> {
  override readonly name = 'projects';

  override async getData() {
    return { count: 3 };
  }

  override renderMarkdown({ data }: this['RenderArgs']) {
    return `# Projects (${data?.count ?? 0})`;
  }

  override renderHTML(args: this['RenderArgs']) {
    return `<mark-down>${escapeHtml(this.renderMarkdown(args))}</mark-down>`;
  }

  override getTitle({ data }: this['RenderArgs']) {
    return `Projects (${data?.count ?? 0})`;
  }
}

export default new ProjectsPage();
```

**Markdown is the source of truth.** `renderMarkdown()` produces the canonical
content; `renderHTML()` wraps it in `<mark-down>` so the same content is rendered
to HTML by the configured markdown renderer. This is exactly what the framework's
built-in `.md`-companion fallback does — duplicating the content as two different
strings causes the `/html/*` and `/md/*` endpoints to drift over time.

If your page has no dynamic data, you don't need a `.page.ts` at all — drop a
`.page.md` companion and inherit the default `renderHTML()`/`renderMarkdown()`
behavior.

**Key points:**

- The file must `export default` a component **instance** (not the class).
  emroute imports the module and uses the default export directly — it does not
  instantiate classes itself.
- `PageComponent<TParams, TData>` — first generic is URL params, second is
  data shape
- `getData()` runs first, its return value is passed to render methods as `data`
- `renderMarkdown()` returns a markdown string — the source of truth
- `renderHTML()` wraps the same markdown in `<mark-down>` (escape with
  `escapeHtml`) so the same content renders through your markdown renderer
- `getTitle()` sets the page `<title>` (optional)
- All render methods receive `{ data, params, context }` via `this['RenderArgs']`

**Default fallbacks** (used by the framework's built-in component when no
`.page.ts` exists):

```table
{
  "head": [
    "Method",
    "Default"
  ],
  "body": [
    [
      "`getData()`",
      "Returns `null`"
    ],
    [
      "`renderHTML()`",
      "Companion `.html` (with embedded `<mark-down></mark-down>` filled from `.md` when both exist) → otherwise `.md` wrapped in `<mark-down>` (with a `<router-slot>` appended for non-leaf pages that don't already include one) → otherwise `<router-slot>` for non-leaf pages, `''` for leaves"
    ],
    [
      "`renderMarkdown()`",
      "Companion `.md` → `` ```router-slot\\n``` `` for non-leaf pages, `''` for leaves"
    ],
    [
      "`getTitle()`",
      "Returns `undefined` (no title change)"
    ]
  ]
}
```

The leaf-vs-layout distinction matters: a leaf page with no files renders
nothing, while a layout-position page with no files renders only the slot
so its children can fill it. `context.isLeaf` carries this flag — see
[Nesting](nesting) for the full rendering matrix.

## Companion files

A single route can have multiple companion files. The framework loads them and
makes them available via `context.files`:

```table
{
  "head": [
    "File",
    "Purpose"
  ],
  "body": [
    [
      "`name.page.ts`",
      "Component with data lifecycle"
    ],
    [
      "`name.page.html`",
      "HTML template (in `context.files.html`)"
    ],
    [
      "`name.page.md`",
      "Markdown content (in `context.files.md`)"
    ],
    [
      "`name.page.css`",
      "Styles (in `context.files.css`)"
    ]
  ]
}
```

A `.page.css` file alone serves an empty page — CSS is meant to accompany
a content file (`.html`, `.md`, or `.ts`), not stand alone.

**Example: `.page.ts` using a `.page.html` template**

```html filepath=routes/profile.page.html
<!-- profile.page.html -->
<h1>{{name}}</h1>
<p>{{role}}</p>
```

```ts filepath=routes/profile.page.ts
// profile.page.ts
class ProfilePage extends PageComponent<Record<string, string>, ProfileData> {
  override readonly name = 'profile';

  override async getData() {
    return { name: 'Alice', role: 'Engineer' };
  }

  override renderHTML({ data, context }: this['RenderArgs']) {
    const template = context.files?.html ?? '<h1>Profile</h1>';
    if (!data) return template;
    return template
      .replaceAll('{{name}}', data.name)
      .replaceAll('{{role}}', data.role);
  }
}

export default new ProfilePage();
```

**Example: `.page.html` + `.page.md` without `.page.ts`**

When both `.html` and `.md` exist but no `.ts`, the default component uses
`.html` for `renderHTML()` and `.md` for `renderMarkdown()` automatically.
This is the recommended pattern for pages that act as parents (see
[Nesting](nesting)).

Next: [Routing](routing)
