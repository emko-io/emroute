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

```ts
override renderMarkdown(args: this['RenderArgs']): string {
  return '# Layout\n\n```router-slot\n```';
}
```

> **You must provide a slot in every non-leaf page.** If a parent page has no
> slot, the router has nowhere to put child content — children will not appear.

## What Happens Without Files

When a page has no `.html` or `.md` file and no render overrides, the base
`PageComponent` uses a fallback chain:

| Files present   | `renderHTML()` produces              | `renderMarkdown()` produces |
| --------------- | ------------------------------------ | --------------------------- |
| `.html` + `.md` | HTML file content                    | Markdown file content       |
| `.html` only    | HTML file content                    | `router-slot` placeholder   |
| `.md` only      | `<mark-down>` wrapper + `router-slot`| Markdown file content       |
| Neither         | Bare `<router-slot>`                 | `router-slot` placeholder   |

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

| Page files      | SSR HTML | SSR Markdown | SPA |
| --------------- | -------- | ------------ | --- |
| `.html` + `.md` | visible  | visible      | visible |
| `.html` only    | visible  | **invisible** | visible |
| `.md` only      | visible  | visible      | visible |
| `.ts` only      | passthrough | passthrough | passthrough |

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
