# Markdown Renderers

emroute uses `.page.md` files for markdown-driven routes. For these to render
as HTML, you need a markdown renderer configured in two places:

- **Server (SSR HTML)** — `markdownRenderer` option on `createEmrouteServer()`
  so `/html/*` routes render markdown server-side.
- **Client (SPA)** — `MarkdownElement.setRenderer()` so the `<mark-down>`
  custom element can convert markdown to HTML in the browser.

## Interface

```ts
interface MarkdownRenderer {
  render(markdown: string): string;
}
```

Any function that takes a markdown string and returns an HTML string works.

## Fenced block conventions

emroute uses fenced code blocks with special language identifiers:

**Router slots** — `` ```router-slot `` :

````md
```router-slot
```
````

Must render as `<router-slot></router-slot>`. Without this, pages using only
`.page.md` can't nest child routes.

**Widgets** — `` ```widget:<name> `` with optional JSON body:

````md
```widget:counter
{"start": "42"}
```
````

Must render as `<widget-counter start="42"></widget-counter>`. The JSON body
becomes HTML attributes on the custom element.

Your renderer must handle these conventions. The setup guides below show how.

## Renderers

| Renderer        | Bundle size | Notes                                       |
|-----------------|-------------|---------------------------------------------|
| **marked**      | ~129KB      | Fast, lightweight, custom renderer API      |
| **markdown-it** | ~362KB      | CommonMark, large plugin ecosystem          |
| **emkoma**      | —           | Built for emroute, handles conventions natively (pre-release) |

Setup guides:

- [Setting up marked](./08a-setup-marked.md)
- [Setting up markdown-it](./08b-setup-markdown-it.md)
- [Setting up emkoma](./08c-setup-emkoma.md)

Other parsers (micromark, unified/remark, showdown) also work — you just need
to implement the fenced block conventions above.

## Why both client and server?

| Context                | What renders markdown            | When it runs                           |
|------------------------|----------------------------------|----------------------------------------|
| SPA (`/`)              | `MarkdownElement` in the browser | Client navigates to a `.page.md` route |
| SSR HTML (`/html/*`)   | `markdownRenderer` on the server | Server handles an `/html/*` request    |
| SSR Markdown (`/md/*`) | Nothing — returns raw markdown   | Server returns plain text as-is        |

Without the client-side renderer, SPA navigation to a markdown page shows raw
text. Without the server-side renderer, `/html/*` routes wrap markdown in
`<mark-down>` tags instead of rendering it to HTML.

Create a single shared renderer module used by both `server.ts` and `main.ts`
to ensure identical output in both contexts.

## Security

The output of `render()` is assigned to `innerHTML` in the browser and served
as HTML from the server. Your renderer is responsible for sanitizing its output.

| Scenario                                    | Recommendation                                        |
|---------------------------------------------|-------------------------------------------------------|
| Trusted content (your own `.page.md` files) | Enable HTML passthrough for full flexibility          |
| Untrusted content (user-submitted markdown) | Keep raw HTML escaping enabled (parser default)       |
| Mixed                                       | Sanitize the output of `render()` before returning it |

Most markdown parsers escape raw HTML by default. Only enable HTML passthrough
when you control the markdown source.

Next: [Runtime](./09-runtime.md)
