# First Route

If you followed one of the [setup guides](setup), you already have a
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

```table
{
  "head": [
    "URL prefix",
    "Mode",
    "Output",
    "Audience"
  ],
  "body": [
    [
      "`/html/`",
      "SSR HTML",
      "HTML document",
      "Browsers, crawlers"
    ],
    [
      "`/md/`",
      "SSR Markdown",
      "Plain text",
      "LLMs, `curl`, scripts"
    ],
    [
      "`/app/`",
      "SPA",
      "JS app shell",
      "Interactive browser app"
    ]
  ]
}
```

With `spa: 'none'`, bare paths redirect to `/html/`. Try it:

```bash
curl http://localhost:1420/html/
# → HTML page with your content

curl http://localhost:1420/md/
# → Raw markdown / plain text
```

The same route serves both endpoints, but the file type matters:

- A `.page.md` file gives meaningful output on both endpoints — rendered to
  HTML at `/html/` (via your markdown renderer) and served as raw markdown at
  `/md/`.
- A `.page.html` file renders HTML at `/html/` and returns an empty body at
  `/md/` (HTML has no automatic markdown representation). To populate `/md/`,
  add a `.page.md` companion alongside.

Next: [Page Types](pages)
