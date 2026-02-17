# Quick Start

One file, one command.

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
    "@emkodev/emroute": "jsr:@emkodev/emroute@^1.5.0"
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
> application code, while the task invokes the dev server as a standalone tool.

## 2. Create a route

**`routes/index.page.md`** — your first page:

```md
# Hello emroute

This page renders as SPA, HTML, and Markdown — from one file.
```

That's it. No `main.ts`, no `index.html` — the dev server generates both
automatically.

## 3. Run it

```bash
deno task dev
```

The dev server will:

1. Scan your `routes/` directory and generate `routes.manifest.ts`
2. Generate a `_main.generated.ts` entry point (since you have no `main.ts`)
3. Bundle it with `deno bundle --watch`
4. Serve a generated HTML shell with `<router-slot>` and the bundled script
5. Start an HTTP server on port 1420
6. Watch for route changes and regenerate automatically

## 4. Open it

Once the dev server starts (look for `Scanned ./routes/` in the console), visit:

- `http://localhost:1420/` — SPA (interactive, client-side navigation)
- `http://localhost:1420/html/` — pre-rendered server HTML
- `http://localhost:1420/md/` — plain markdown (great for curl, LLMs, scripts)

## 5. Customize (optional)

When you need more control, create your own files — the server detects them and
uses yours instead of generating:

**`index.html`** — custom SPA shell (the server injects the `<script>` tag
automatically):

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>My App</title>
  </head>
  <body>
    <router-slot></router-slot>
  </body>
</html>
```

**`main.ts`** — custom SPA entry point (for markdown renderers, manual widget
registration, or other setup):

```ts
import { createSpaHtmlRouter } from '@emkodev/emroute/spa';
import { routesManifest } from './routes.manifest.ts';

await createSpaHtmlRouter(routesManifest);
```

**`main.css`** — auto-injected as `<link rel="stylesheet">` if present.

> **Note:** `routes.manifest.ts` is auto-generated — don't create it yourself.

## Next steps

- Add more routes: create `routes/about.page.md`, `routes/blog.page.html`, or
  `routes/projects/[id].page.ts`
- Add widgets: create `widgets/my-widget/my-widget.widget.ts` — auto-discovered
  by the dev server
- Set up a markdown renderer for SPA mode:
  [Setting up emko-md](./setup-emko-md.md)
- Read the full [Consumer guide](./guide.md) — routing rules, components,
  widgets, error handling, SPA modes, and the dev server
