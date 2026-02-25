# Project Setup

## Prerequisites

A JavaScript runtime that handles `.ts` imports:

- [Bun](https://bun.sh) v1.1+ (native TypeScript)
- [Deno](https://deno.land) v2+ (native TypeScript)
- [Node.js](https://nodejs.org) v22+ with `--experimental-strip-types`, or via [tsx](https://github.com/privatenumber/tsx)

## Create a new project

```bash
mkdir my-app && cd my-app
npm init -y               # or bun init -y
```

## Install emroute

```bash
npm add @emkodev/emroute   # or bun add, pnpm add
```

You'll also need a markdown renderer for `.page.md` files. See
[Markdown Renderers](./08-markdown-renderer.md) for setup — [marked](./08a-setup-marked.md)
and [markdown-it](./08b-setup-markdown-it.md) both work well.

## Configure TypeScript

emroute components use DOM APIs (custom elements, URLPattern), so your
`tsconfig.json` needs DOM types:

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
npm add -D esbuild         # or bun add -d esbuild
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
