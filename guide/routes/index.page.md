<!--==chunk:hero==-->

# emroute

A file-based, storage-agnostic TypeScript router with **triple rendering** —
SPA, SSR HTML, and SSR Markdown — and zero external dependencies.

[Get Started](setup) · [Pages](pages) · [Architecture](architecture)

<!--==chunk:feature==-->

## Triple rendering

One component, three views. `/html/*` for browsers, `/md/*` for LLMs and
shell scripts, `/app/*` for the SPA. Same content, three audiences, no
duplication.

<!--==chunk:feature==-->

## Zero dependencies

Native platform APIs only — Custom Elements, Shadow DOM, Navigation API,
URLPattern, `setHTMLUnsafe`. No virtual DOM, no transpilation runtime, no
framework runtime. Just a router.

<!--==chunk:feature==-->

## File-based routing

The filesystem **is** the router. `routes/about.page.md` → `/about`. Add a
file, get a route. Dynamic segments via `[id]`. Nested layouts via
directory index. No config file.

<!--==chunk:demo==-->

## See it for yourself

The same emroute widget renders differently depending on the SPA mode it
runs in. Open this page at `/html/` and `/app/` side-by-side — the clock
below is the same component, but only one of them ticks.

```widget:clock
```

In `none` (`/html/`) the server captures the time at request and ships a
static `<time>` snapshot — refresh to update. In `only` (`/app/`) the client
runs `getData()` and a `setInterval` started by `hydrate()` makes it tick
live. In `leaf` and `root` modes the server renders the snapshot and the
client hydrates: SSR-fast first paint, then live.

Same widget contract, anything inside. The counter below is rendered by
Preact loaded on-demand from a CDN — the widget itself only owns the
mount point and the `hydrate()` boundary:

```widget:preact-counter
{ "start": "0", "label": "clicks" }
```

<!--==chunk:showcase==-->

## Markdown is content

Drop a markdown file in `routes/` and serve it three ways at once:

```md filepath=routes/about.page.md
# About

Built with emroute.
```

```sh
curl http://localhost:1420/html/about    # rendered HTML
curl http://localhost:1420/md/about      # raw markdown
open  http://localhost:1420/app/about    # SPA navigation
```

The same `.md` file drives every endpoint. Throw a `PageComponent` at it
when you need data fetching; otherwise it's just markdown.

<!--==chunk:cta==-->

## Get started in 60 seconds

- [Setup with **Bun**](setup/bun) — native TypeScript, `Bun.serve`
- [Setup with **Deno**](setup/deno) — `Deno.serve`, npm-compatible
- [Setup with **Node**](setup/node) — `node:http`, works with tsx

Or jump straight to the [Pages](pages) reference, [Widgets](widgets) for
interactive units, or the [Architecture](architecture) overview.
