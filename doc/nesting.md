# Nested Routes

Nested routes let a parent page wrap child pages. A layout page renders a
header, sidebar, or any shared markup — and a **slot** marks where the child
content goes.

## How It Works

Given this file structure:

```
routes/
  dashboard.page.html      →  /dashboard
  dashboard/
    settings.page.html     →  /dashboard/settings
    profile.page.html      →  /dashboard/profile
```

When a user visits `/dashboard/settings`, the router builds a hierarchy:

1. `/` (root)
2. `/dashboard` (parent)
3. `/dashboard/settings` (leaf)

Each level renders its content. The parent's slot gets filled with the child.
The result is the dashboard layout wrapping the settings page.

## Providing a Slot

A slot is a marker that says "put child content here." Each rendering mode has
its own slot syntax.

### In `.html` files

```html
<div class="dashboard-layout">
  <nav>...</nav>
  <router-slot></router-slot>
</div>
```

### In `.md` files

````markdown
# Dashboard

Some content before the child.

```router-slot
```

Some content after the child.
````

### In `.ts` files (renderHTML override)

```ts
override renderHTML(args: this['RenderArgs']): string {
  return `<div class="layout"><router-slot></router-slot></div>`;
}
```

### In `.ts` files (renderMarkdown override)

````ts
override renderMarkdown(args: this['RenderArgs']): string {
  return '# Layout\n\n```router-slot\n```';
}
````

> **You must provide a slot in every non-leaf page.** If a parent page has no
> slot, the router has nowhere to put child content — children will not appear.

## What Happens Without Files

When a page has no `.html` or `.md` file and no render overrides, the base
`PageComponent` uses a fallback chain:

| Files present   | `renderHTML()` produces               | `renderMarkdown()` produces |
| --------------- | ------------------------------------- | --------------------------- |
| `.html` + `.md` | HTML file content                     | Markdown file content       |
| `.html` only    | HTML file content                     | `router-slot` placeholder   |
| `.md` only      | `<mark-down>` wrapper + `router-slot` | Markdown file content       |
| Neither         | Bare `<router-slot>`                  | `router-slot` placeholder   |

Every fallback produces a slot. This means:

- A page with **no files at all** (just a `.ts` with `name`) becomes a
  transparent passthrough — it contributes no visible content but still passes
  children through.
- A page with **only `.html`** has no markdown representation. In SSR Markdown
  mode, it produces an invisible slot placeholder. The page works in SSR HTML
  and SPA, but `curl /md/...` will not show its content.
- A page with **only `.md`** works in all three modes. `renderHTML` wraps it in
  a `<mark-down>` element and appends a `<router-slot>`.

## Example: Full Nesting

```
routes/
  blog.page.html           ← layout with nav + <router-slot>
  blog.page.md             ← same layout as markdown
  blog/
    post-one.page.md       ← leaf, no slot needed
    post-two.page.md       ← leaf, no slot needed
```

`blog.page.html`:

```html
<div class="blog-layout">
  <h1>Blog</h1>
  <nav>
    <a href="/blog/post-one">Post One</a>
    <a href="/blog/post-two">Post Two</a>
  </nav>
  <router-slot></router-slot>
</div>
```

`blog.page.md`:

````markdown
# Blog

[Post One](/blog/post-one) | [Post Two](/blog/post-two)

```router-slot
```
````

Visiting `/blog/post-one` renders the blog layout with post-one inside the slot.

> **Leaf pages do not need a slot.** Only pages that have children need one.

## Example: TypeScript-Only Parents

A `.ts`-only page with no `.html` or `.md` is useful when you need a route node
for data fetching or middleware but no visible wrapper.

```
routes/
  api.page.ts              ← getData fetches auth, no visible content
  api/
    users.page.html        ← renders user list
    orders.page.html       ← renders order list
```

`api.page.ts`:

```ts
class ApiPage extends PageComponent {
  override readonly name = 'api';

  override async getData({ params, context }: this['DataArgs']) {
    // fetch auth token, set up API client, etc.
    return { token: '...' };
  }
}

export default new ApiPage();
```

This page has no `.html` or `.md`, so `renderHTML` falls back to a bare
`<router-slot>` and `renderMarkdown` falls back to a `` ```router-slot``` ``
placeholder. The child page renders directly — no visible wrapper.

## Visibility Across Modes

Not every file combination produces visible content in every mode.

| Page files      | SSR HTML    | SSR Markdown  | SPA         |
| --------------- | ----------- | ------------- | ----------- |
| `.html` + `.md` | visible     | visible       | visible     |
| `.html` only    | visible     | **invisible** | visible     |
| `.md` only      | visible     | visible       | visible     |
| `.ts` only      | passthrough | passthrough   | passthrough |

> **If you want your page visible in all three modes, provide a `.md` file or
> override `renderMarkdown()`.** Pages with only `.html` will not appear in
> SSR Markdown output — the router produces a slot placeholder with no content.

This is not a bug. A `.html` file contains HTML markup. The router does not
convert HTML to markdown. If you need markdown output, provide it explicitly.

## Slot Rules

1. **One slot per page.** The router replaces the first `<router-slot>` (HTML)
   or `` ```router-slot``` `` (Markdown) it finds. Extra slots are left empty.

2. **Non-leaf pages must have a slot.** Without a slot, child content has
   nowhere to go.

3. **Leaf pages should not have a slot.** A slot in a leaf page is harmless
   but pointless — there is no child to fill it.

4. **Both `.html` and `.md` need their own slot.** The HTML slot
   (`<router-slot>`) is used by SSR HTML and SPA. The Markdown slot
   (`` ```router-slot``` ``) is used by SSR Markdown. If you provide both files,
   both need a slot for children to appear in all modes.

## Tips and Tricks

### Split Layouts with a Passthrough Root

A `.ts`-only page is a passthrough — it renders no content, just a slot. You
can use this at the root level to give different groups of routes completely
different layouts.

```
routes/
  index.page.ts              ← passthrough (name only, no files)
  public.page.html           ← public layout: no nav, marketing look
  public.page.md
  public/
    landing.page.md
    pricing.page.md
  app.page.html              ← app layout: sidebar nav, dashboard look
  app.page.md
  app/
    dashboard.page.md
    settings.page.md
```

`index.page.ts`:

```ts
class RootPage extends PageComponent {
  override readonly name = 'root';
}

export default new RootPage();
```

`public.page.html` — no navigation, clean marketing layout:

```html
<div class="public-layout">
  <router-slot></router-slot>
</div>
```

`app.page.html` — navigation, authenticated layout:

```html
<div class="app-layout">
  <widget-nav></widget-nav>
  <router-slot></router-slot>
</div>
```

Now `/public/landing` and `/app/dashboard` use completely different layouts,
but share the same root. The passthrough root is invisible — it contributes
no markup to either branch.

This works because the route hierarchy for `/app/dashboard` is:

1. `/` → passthrough (bare slot)
2. `/app` → app layout with nav
3. `/app/dashboard` → leaf content

And for `/public/landing`:

1. `/` → passthrough (bare slot)
2. `/public` → public layout without nav
3. `/public/landing` → leaf content

The root passes through, the layout wraps, the leaf fills.

> **Any `.ts`-only page can be a passthrough at any level**, not just the root.
> Use this whenever you need a route node that groups children without adding
> visible markup.

### Index Page + Catch-All

A flat file and a directory index can coexist on the same name. The flat file
handles the exact path; the directory index catches everything underneath.

```
routes/
  docs.page.ts               ← /docs (exact match)
  docs/
    index.page.ts             ← /docs/* (catch-all)
```

`docs.page.ts` handles `/docs` — render a table of contents, list all
subpages, show a search bar, whatever you need:

```ts
class DocsPage extends PageComponent {
  override readonly name = 'docs';

  override renderHTML(args: this['RenderArgs']): string {
    return `<div class="docs-layout">
  <nav>
    <a href="/docs/getting-started">Getting Started</a>
    <a href="/docs/api/components">API / Components</a>
  </nav>
  <router-slot></router-slot>
</div>`;
  }
}

export default new DocsPage();
```

`docs/index.page.ts` catches any path under `/docs/` — including deeply nested
ones like `/docs/api/components`. The full sub-path is available in
`params.rest`. The component `name` is just a label for your own use — the
router does not look at it or apply any routing logic based on it:

```ts
class DocsCatchAllPage extends PageComponent {
  override readonly name = 'docs-catch-all';

  override renderHTML(args: this['RenderArgs']): string {
    const path = args.params.rest ?? '';
    return `<h2>Viewing: ${path}</h2>`;
  }
}

export default new DocsCatchAllPage();
```

| URL                     | Matched by           | `params.rest`     |
| ----------------------- | -------------------- | ----------------- |
| `/docs`                 | `docs.page.ts`       | —                 |
| `/docs/getting-started` | `docs/index.page.ts` | `getting-started` |
| `/docs/api/components`  | `docs/index.page.ts` | `api/components`  |

The catch-all nests inside the flat file's `<router-slot>`, so the docs layout
wraps every sub-page automatically.

### Dynamic Segment vs Catch-All

A `[param]` file matches a **single** URL segment. A directory `index` file
matches **any depth**.

```
routes/
  users.page.ts
  users/
    [id].page.ts             ← /users/:id  (single segment)
    index.page.ts            ← /users/*     (any depth)
```

| URL                      | Matched by            | Why                          |
| ------------------------ | --------------------- | ---------------------------- |
| `/users`                 | `users.page.ts`       | exact match                  |
| `/users/42`              | `users/[id].page.ts`  | specific route wins          |
| `/users/42/posts`        | `users/index.page.ts` | no specific match, catch-all |
| `/users/42/posts/drafts` | `users/index.page.ts` | no specific match, catch-all |

Specific routes always win over the catch-all. `/users/42` matches `[id]`
because it is more specific than `index`. Anything that doesn't have a
specific match falls through to the catch-all.

> **Use `[param]` when you know the structure** — one segment, one parameter,
> and you can nest further with files inside `users/[id]/`.
>
> **Use a directory `index` when the structure is open-ended** — you don't know
> how deep the path goes, and you want to handle it all in one component via
> `params.rest`.

### Virtual Pages with a Catch-All

A catch-all `index.page.ts` can use `getData()` to fetch content from a
database, CMS, or any other source based on `params.rest`. This creates
pages that don't exist as files — they live in your data store but get a
real URL.

```
routes/
  wiki.page.html             ← /wiki layout (sidebar, search)
  wiki/
    index.page.ts            ← /wiki/* — loads content from DB
```

`wiki/index.page.ts`:

```ts
interface WikiData {
  path: string;
  md: string;
  html?: string;
}

class WikiPage extends PageComponent<{ rest: string }, WikiData> {
  override readonly name = 'wiki-page';

  override async getData({ params, signal }: this['DataArgs']) {
    const path = params.rest ?? '';
    const res = await fetch(`/api/wiki/${path}`, { signal });
    if (!res.ok) throw new Response(null, { status: 404 });
    return res.json();
  }

  override renderHTML({ data }: this['RenderArgs']): string {
    if (data?.html) return data.html;
    return `<mark-down>${data?.md ?? ''}</mark-down>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']): string {
    return data?.md ?? '';
  }
}

export default new WikiPage();
```

Now `/wiki/setup`, `/wiki/api/auth`, `/wiki/guides/deploy/docker` all resolve
to the same component. `getData()` fetches the content for whatever path was
requested. If the path doesn't exist in the database, throw a `Response` with
status 404 and the router renders your 404 page.

The pages are virtual — no files on disk, no route registration. Add a row
to your database and the URL works immediately.

### Scoped CSS via Layout Companion

A `.page.css` companion file on a layout page scopes styles to that entire
route group. Every child page inherits the styles because the layout wraps
them all.

```
routes/
  admin.page.html
  admin.page.css              ← applies to /admin and all children
  admin/
    users.page.md
    logs.page.md
```

`admin.page.css`:

```css
.admin-layout {
  background: #1e1e2e;
  color: #cdd6f4;
}
.admin-layout a {
  color: #89b4fa;
}
```

`admin.page.html`:

```html
<div class="admin-layout">
  <router-slot></router-slot>
</div>
```

The CSS is injected as a `<style>` tag inside the layout's rendered output.
Both `/admin/users` and `/admin/logs` get the dark theme. Pages outside
`/admin` are unaffected.

### Stacking Layouts

Layouts nest. Each level adds its own wrapper. This is useful when a section
has shared chrome AND sub-sections have their own navigation.

```
routes/
  app.page.html              ← top bar, global nav
  app/
    settings.page.html       ← settings sidebar
    settings/
      profile.page.md        ← actual content
      billing.page.md
    dashboard.page.md        ← no extra wrapper, sits directly in app layout
```

Visiting `/app/settings/profile` builds three layers:

1. `app.page.html` — top bar with global nav
2. `app/settings.page.html` — sidebar with settings links
3. `app/settings/profile.page.md` — profile form

Visiting `/app/dashboard` builds only two:

1. `app.page.html` — top bar
2. `app/dashboard.page.md` — dashboard content (no settings sidebar)

### Static Overrides in a Catch-All

Specific routes always win over a catch-all. You can have a catch-all handle
most paths but carve out individual pages with dedicated files.

```
routes/
  blog.page.html
  blog/
    index.page.ts            ← /blog/* catch-all (loads from CMS)
    featured.page.md         ← /blog/featured (hand-crafted static page)
    archive.page.ts          ← /blog/archive (custom query logic)
```

| URL                | Matched by              | Why                    |
| ------------------ | ----------------------- | ---------------------- |
| `/blog`            | `blog.page.html`        | exact match            |
| `/blog/featured`   | `blog/featured.page.md` | specific wins          |
| `/blog/archive`    | `blog/archive.page.ts`  | specific wins          |
| `/blog/my-post`    | `blog/index.page.ts`    | no specific, catch-all |
| `/blog/2024/01/hi` | `blog/index.page.ts`    | no specific, catch-all |

The catch-all handles the long tail. Static files handle the special cases.
You can add or remove specific overrides at any time without touching the
catch-all logic.
