# First Route

If you followed one of the [setup guides](./01-setup.md), you already have a
running server with a route. This page covers what happened.

## Route files

A route is a file in your `routes/` directory. The filename determines the URL
pattern:

```
routes/
  index.page.md      → /
  about.page.html    → /about
  projects.page.ts   → /projects
```

A route can be a `.md` file, an `.html` template, a `.ts` component, or a
combination. When a `.page.ts` exists, it controls data fetching and rendering.
When it doesn't, the framework renders the `.html` or `.md` file directly.

## Three rendering modes

emroute serves every page in three formats from the same source:

| URL prefix | Mode         | Output        | Audience                |
|------------|--------------|---------------|-------------------------|
| `/html`    | SSR HTML     | HTML document | Browsers, crawlers      |
| `/md`      | SSR Markdown | Plain text    | LLMs, `curl`, scripts   |
| `/`        | SPA          | JS app shell  | Interactive browser app  |

With `spa: 'none'`, bare paths redirect to `/html`. Try it:

```bash
curl http://localhost:1420/html
# → HTML page with your content

curl http://localhost:1420/md
# → Raw markdown text
```

The same `index.page.md` file produced both outputs.

Next: [Page Types](./03-pages.md)
