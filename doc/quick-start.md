# Quick Start

Three files, one command.

## 1. Create your project

```bash
mkdir my-app && cd my-app
deno init
deno add jsr:@emkodev/emroute@^1.0.0-beta.5
```

## 2. Create the files

**`routes/index.page.md`** — your first page:

```md
# Hello emroute

This page renders as SPA, HTML, and Markdown — from one file.
```

**`index.html`** — SPA shell:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>My App</title>
  </head>
  <body>
    <router-slot></router-slot>
    <script type="module" src="/main.js"></script>
  </body>
</html>
```

**`main.ts`** — SPA entry point:

```ts
import { createSpaHtmlRouter } from '@emkodev/emroute/spa';
import { routesManifest } from './routes.manifest.ts';

await createSpaHtmlRouter(routesManifest);
```

## 3. Run it

```bash
deno run --allow-net --allow-read --allow-write --allow-run --allow-env \
  jsr:@emkodev/emroute@^1.0.0-beta.5/server/cli.deno.ts
```

Or add a task to `deno.json`:

```jsonc
{
  "tasks": {
    "dev": "deno run --allow-net --allow-read --allow-write --allow-run --allow-env -c deno.json main.ts"
  }
}
```

## 4. Open it

- `http://localhost:1420/` — SPA (browser)
- `http://localhost:1420/html/` — server-rendered HTML
- `http://localhost:1420/md/` — plain markdown

## Next steps

- Add more routes: create `routes/about.page.md`, `routes/blog.page.html`, or
  `routes/projects/[id].page.ts`
- Set up a markdown renderer for SPA mode:
  [Setting up emko-md](./setup-emko-md.md)
- Read the full [Consumer guide](./guide.md) — routing rules, components,
  widgets, error handling, SSR, and the dev server
