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
