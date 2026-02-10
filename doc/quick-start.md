# Quick Start

Three files, one command.

## 1. Create your project

```bash
mkdir my-app && cd my-app
deno init
deno add jsr:@emkodev/emroute
```

This adds emroute to your `deno.json` imports:

```json
{
  "imports": {
    "@emkodev/emroute": "jsr:@emkodev/emroute@^1.0.0"
  }
}
```

While you're in `deno.json`, add a dev task:

```jsonc
{
  "imports": { ... },
  "tasks": {
    "dev": "deno run --allow-net --allow-read --allow-write --allow-run --allow-env jsr:@emkodev/emroute/server/cli"
  }
}
```

> The task runs the CLI directly from JSR. The `deno add` import is used by your
> application code (`main.ts`), while the task invokes the dev server as a
> standalone tool.

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

> **Note:** You don't need to create `routes.manifest.ts` — the dev server
> auto-generates it from your `routes/` directory on startup.

## 3. Run it

```bash
deno task dev
```

The dev server will:

1. Scan your `routes/` directory
2. Generate `routes.manifest.ts` (written to your project root)
3. Bundle `main.ts` with `deno bundle --watch`
4. Start an HTTP server on port 1420
5. Watch for route changes and regenerate automatically

## 4. Open it

Once the dev server starts (look for `Scanned ./routes/` in the console), visit:

- `http://localhost:1420/` — SPA (interactive, client-side navigation)
- `http://localhost:1420/html/` — pre-rendered server HTML
- `http://localhost:1420/md/` — plain markdown (great for curl, LLMs, scripts)

## Next steps

- Add more routes: create `routes/about.page.md`, `routes/blog.page.html`, or
  `routes/projects/[id].page.ts`
- Set up a markdown renderer for SPA mode:
  [Setting up emko-md](./setup-emko-md.md)
- Read the full [Consumer guide](./guide.md) — routing rules, components,
  widgets, error handling, SSR, and the dev server
