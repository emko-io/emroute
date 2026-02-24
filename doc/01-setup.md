# Project Setup

## Prerequisites

- [Bun](https://bun.sh) v1.1+

## Create a new project

```bash
mkdir my-app && cd my-app
bun init -y
```

## Install emroute

```bash
bun add @emkodev/emroute
```

You'll also need a markdown renderer for `.page.md` files. See
[Markdown Renderers](./08-markdown-renderer.md) for setup — [marked](./08a-setup-marked.md)
and [markdown-it](./08b-setup-markdown-it.md) both work well.

## Configure TypeScript

Bun's default `tsconfig.json` only includes `"lib": ["ESNext"]`. emroute
components use DOM APIs (custom elements, URLPattern), so add DOM types:

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true
  }
}
```

## Install esbuild (optional)

If you plan to use SPA mode (client-side navigation), install esbuild. It's
used to bundle the browser entry point:

```bash
bun add -d esbuild
```

Skip this if you only need server-side rendering (`spa: 'none'`).

## Project structure

By the end of this guide, your project will look like this:

```
my-app/
  package.json
  tsconfig.json
  server.ts            # Server entry point
  main.ts              # SPA entry point (auto-generated if absent)
  renderer.ts          # Shared markdown renderer
  routes/              # File-based routes
    index.page.md      # Root page (provides slot for children)
    about.page.html    # Static page
    projects.page.ts   # TypeScript page component
    projects/
      [id].page.ts     # Dynamic route
  widgets/             # Interactive components (optional)
    counter/
      counter.widget.ts
```

Next: [First Route](./02-first-route.md)
