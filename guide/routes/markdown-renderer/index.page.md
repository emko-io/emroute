<!--==chunk:hero==-->

# Markdown Renderers

`.page.md` files need a markdown renderer to become HTML. Configure one on
the server (`markdownRenderer` on `Emroute.create()`) and the matching one
on the client (`MarkdownElement.setRenderer()`) — same module on both sides
gives identical output everywhere.

<!--==chunk:card==-->

## emkoma

Built for emroute. Handles `` ```router-slot `` and `` ```widget:name ``
fences natively — no custom renderer code. Pre-release but stable.

[Setting up emkoma →](markdown-renderer/emkoma)

<!--==chunk:card==-->

## marked

Fast and lightweight (~129KB). Custom renderer API lets you intercept fence
blocks and convert them into the elements emroute expects.

[Setting up marked →](markdown-renderer/marked)

<!--==chunk:card==-->

## markdown-it

Full CommonMark, large plugin ecosystem (~362KB). Use when you want a
mature parser and you don't mind writing the fence adapter.

[Setting up markdown-it →](markdown-renderer/markdown-it)

<!--==chunk:detail==-->

## Interface

```ts
interface MarkdownRenderer {
  render(markdown: string): string;
}
```

Any function that takes a markdown string and returns an HTML string works.
Other parsers (micromark, unified/remark, showdown) also work — you just
need to implement the fenced block conventions below.

## Fenced block conventions

emroute uses fenced code blocks with special language identifiers:

**Router slots** — `` ```router-slot `` :

````md
```router-slot
```
````

Must render as `<router-slot></router-slot>`. Without this, pages using
only `.page.md` can't nest child routes.

**Widgets** — `` ```widget:<name> `` with optional JSON body:

````md
```widget:counter
{"start": "42"}
```
````

Must render as `<widget-counter start="42"></widget-counter>`. The JSON
body becomes HTML attributes on the custom element.

## Why both client and server?

```table
{
  "head": [
    "Context",
    "What renders markdown",
    "When it runs"
  ],
  "body": [
    [
      "SPA (`/app/*`)",
      "`MarkdownElement` in the browser",
      "Client navigates to a `.page.md` route"
    ],
    [
      "SSR HTML (`/html/*`)",
      "`markdownRenderer` on the server",
      "Server handles an `/html/*` request"
    ],
    [
      "SSR Markdown (`/md/*`)",
      "Nothing — returns raw markdown",
      "Server returns plain text as-is"
    ]
  ]
}
```

Without the client-side renderer, SPA navigation to a markdown page shows
raw text. Without the server-side renderer, `/html/*` routes wrap markdown
in `<mark-down>` tags instead of rendering it to HTML. Use one shared
module from both `server.ts` and `main.ts` so output stays identical.

## Security

The output of `render()` is assigned to `innerHTML` in the browser and
served as HTML from the server. Your renderer is responsible for
sanitizing its output.

```table
{
  "head": [
    "Scenario",
    "Recommendation"
  ],
  "body": [
    [
      "Trusted content (your own `.page.md` files)",
      "Enable HTML passthrough for full flexibility"
    ],
    [
      "Untrusted content (user-submitted markdown)",
      "Keep raw HTML escaping enabled (parser default)"
    ],
    [
      "Mixed",
      "Sanitize the output of `render()` before returning it"
    ]
  ]
}
```

Most markdown parsers escape raw HTML by default. Only enable HTML
passthrough when you control the markdown source.

<!--==chunk:outro==-->

Next: [Runtime](runtime)
