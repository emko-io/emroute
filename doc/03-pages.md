# Page Types

Every route is defined by one or more files in the `routes/` directory. There
are three file types, in order of precedence: `.page.ts` > `.page.html` >
`.page.md`.

## Markdown pages (`.page.md`)

The simplest page type. Write markdown, get HTML and markdown output:

**`routes/about.page.md`**

```md
# About

Built with emroute.
```

- SSR HTML: markdown is converted to HTML automatically
- SSR Markdown: raw markdown is returned as-is

## HTML pages (`.page.html`)

HTML fragments for static content. No `<!DOCTYPE>`, `<html>`, or `<body>` — the
server wraps your content in a full document:

**`routes/about.page.html`**

```html
<h1>About</h1>
<p>Built with emroute.</p>
```

- SSR HTML: the fragment is injected into the page shell
- SSR Markdown: nothing renders (there is no markdown companion)

## TypeScript components (`.page.ts`)

Full components with data fetching, custom rendering, and titles. Extend
`PageComponent`:

**`routes/projects.page.ts`**

```ts
import { PageComponent } from '@emkodev/emroute';

interface ProjectData {
  count: number;
}

class ProjectsPage extends PageComponent<Record<string, string>, ProjectData> {
  override readonly name = 'projects';

  override async getData() {
    return { count: 3 };
  }

  override renderHTML({ data }: this['RenderArgs']) {
    return `<h1>Projects (${data?.count ?? 0})</h1>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']) {
    return `# Projects (${data?.count ?? 0})`;
  }

  override getTitle({ data }: this['RenderArgs']) {
    return `Projects (${data?.count ?? 0})`;
  }
}

export default new ProjectsPage();
```

**Key points:**

- The file must `export default` a component **instance** (not the class).
  emroute imports the module and uses the default export directly — it does not
  instantiate classes itself.
- `PageComponent<TParams, TData>` — first generic is URL params, second is
  data shape
- `getData()` runs first, its return value is passed to render methods as `data`
- `renderHTML()` returns an HTML fragment string
- `renderMarkdown()` returns a markdown string
- `getTitle()` sets the page `<title>` (optional)
- All render methods receive `{ data, params, context }` via `this['RenderArgs']`

**Default fallbacks** when you don't override a method:

| Method             | Default                                         |
|--------------------|--------------------------------------------------|
| `getData()`        | Returns `null`                                   |
| `renderHTML()`     | Renders companion `.html` or `.md` file, or slot |
| `renderMarkdown()` | Renders companion `.md` file, or slot            |
| `getTitle()`       | Returns `undefined` (no title change)            |

## Companion files

A single route can have multiple companion files. The framework loads them and
makes them available via `context.files`:

| File              | Purpose                              |
|-------------------|--------------------------------------|
| `name.page.ts`   | Component with data lifecycle        |
| `name.page.html` | HTML template (in `context.files.html`) |
| `name.page.md`   | Markdown content (in `context.files.md`) |
| `name.page.css`  | Styles (in `context.files.css`)      |

A `.page.css` file alone does **not** create a route — it's always a companion.

**Example: `.page.ts` using a `.page.html` template**

```html
<!-- profile.page.html -->
<h1>{{name}}</h1>
<p>{{role}}</p>
```

```ts
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
[Nesting](./05-nesting.md)).

Next: [Routing](./04-routing.md)
