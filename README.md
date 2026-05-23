<p align="center">
  <img src="https://raw.githubusercontent.com/emko-io/emroute/main/doc/logo-full.png" alt="emroute" width="197" height="40">
</p>

<p align="center">
  File-based, storage-agnostic router with triple rendering. Zero dependencies.
</p>

<p align="center">
  <a href="https://emroute.emko.dev"><strong>emroute.emko.dev →</strong></a>
</p>

---

Every route renders three ways from the same component: a **Single Page App**
in the browser, **server-rendered HTML**, and **plain Markdown**. No separate
API layer — prefix any route with `/md/` and get text that LLMs, scripts, and
`curl` can consume directly.

```
GET /projects/42          → SPA (hydrated in browser)
GET /html/projects/42     → pre-rendered HTML
GET /md/projects/42       → plain Markdown
```

## Install

```bash
npm add @emkodev/emroute    # or bun add, pnpm add, yarn add
```

Works on **Node**, **Bun**, and **Deno**.

## Quick taste

Routes are files. The filesystem is the config.

```
routes/
  index.page.md              → /
  projects.page.md           → /projects
  projects/[id].page.ts      → /projects/:id
```

A route can be a `.md` file, an `.html` template, a `.ts` component, or any
combination. When a `.page.ts` exists, it controls data fetching and
rendering. When it doesn't, the framework renders the companion file
directly.

## Documentation

Everything else — setup, routing, widgets, SSR, hydration, the runtime
abstraction, design decisions — lives at **[emroute.emko.dev](https://emroute.emko.dev)**.

## License

MIT
