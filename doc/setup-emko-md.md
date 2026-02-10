# Setting Up emko-md with emroute

emroute uses `.page.md` files for markdown-driven routes. For these to render
as HTML, you need a markdown renderer configured in two places:

- **Client (SPA)** — `MarkdownElement.setRenderer()` so the `<mark-down>`
  custom element can convert markdown to HTML in the browser.
- **Server (SSR HTML)** — `markdownRenderer` option on the dev server so
  `/html/*` routes render markdown server-side.

The built-in CLI (`jsr:@emkodev/emroute/server/cli`) from the
[Quick Start](./quick-start.md) doesn't accept a markdown renderer — it starts
a bare dev server. To wire in a renderer, you replace the CLI task with a
custom `dev.ts` that calls `createDevServer` directly. Steps 3 and 4 below
walk through this.

This guide uses `@emkodev/emko-md`, a lightweight WASM-based markdown parser
with zero JS dependencies.

## 1. Install the packages

```bash
deno add jsr:@emkodev/emko-md@^0.1.0-beta.2/parser
```

Your `deno.json` imports should now include both emroute and emko-md. You also
need the server sub-exports for the custom dev script:

```json
{
  "imports": {
    "@emkodev/emroute": "jsr:@emkodev/emroute@^1.0.0",
    "@emkodev/emroute/spa": "jsr:@emkodev/emroute/spa",
    "@emkodev/emroute/server": "jsr:@emkodev/emroute/server",
    "@emkodev/emroute/server/deno": "jsr:@emkodev/emroute/server/deno",
    "@emkodev/emko-md/parser": "jsr:@emkodev/emko-md@0.1.0-beta.2/parser"
  }
}
```

> `deno add` may only add the root import. Add the `/spa`, `/server`, and
> `/server/deno` sub-exports manually if they're missing — your application
> code and dev script import from these paths.

## 2. Vendor the WASM binary

The parser uses a ~50KB WASM binary that must be loaded at runtime. JSR
packages don't bundle binary assets, so you need to vendor the file into your
project.

Download it from JSR and place it in your assets directory:

```bash
mkdir -p assets
curl -o assets/hypertext_parser_bg.0.1.0-beta.2.wasm \
  https://jsr.io/@emkodev/emko-md/0.1.0-beta.2/hypertext-parser/pkg/hypertext_parser_bg.wasm
```

Include the version in the filename so you know when it's stale.

The dev server serves files from `appRoot` automatically, so
`/assets/hypertext_parser_bg.0.1.0-beta.2.wasm` will resolve without any
extra configuration.

## 3. Client-side renderer

Create a renderer module that configures `MarkdownElement` for SPA use:

```ts
// src/emko.renderer.ts
import { AstRenderer, initParser, MarkdownParser } from '@emkodev/emko-md/parser';
import { MarkdownElement } from '@emkodev/emroute/spa';
import type { MarkdownRenderer } from '@emkodev/emroute';

const renderer = new AstRenderer();
let parser: MarkdownParser;

MarkdownElement.setRenderer(
  {
    async init() {
      await initParser({
        module_or_path: new URL(
          '/assets/hypertext_parser_bg.0.1.0-beta.2.wasm',
          location.origin,
        ),
      });
      parser = new MarkdownParser();
    },
    render(markdown: string): string {
      parser.set_text(markdown);
      const ast = JSON.parse(parser.parse_to_json());
      return renderer.render(ast);
    },
  } satisfies MarkdownRenderer,
);
```

Import this module at the top of your SPA entry point, **before** the router
is created:

```ts
// main.ts
import './src/emko.renderer.ts';
import { createSpaHtmlRouter } from '@emkodev/emroute/spa';
import { routesManifest } from './routes.manifest.ts';

const router = await createSpaHtmlRouter(routesManifest);
```

The `init()` method runs once — it fetches and compiles the WASM binary before
the first render. Subsequent calls to `render()` are synchronous.

## 4. Server-side renderer

The built-in CLI doesn't support custom renderers, so you need a `dev.ts`
script that calls `createDevServer` with the `markdownRenderer` option. This
replaces the `jsr:@emkodev/emroute/server/cli` task from the Quick Start.

````ts
// dev.ts
import { AstRenderer, initParser, MarkdownParser } from '@emkodev/emko-md/parser';
import { createDevServer } from '@emkodev/emroute/server';
import { denoServerRuntime } from '@emkodev/emroute/server/deno';
import { WidgetRegistry } from '@emkodev/emroute';

const wasmPath = new URL(
  './assets/hypertext_parser_bg.0.1.0-beta.2.wasm',
  import.meta.url,
);

await initParser({ module_or_path: wasmPath });
const parser = new MarkdownParser();
const astRenderer = new AstRenderer();

// Register widgets so SSR can render them server-side.
// Without this, <widget-*> tags in HTML and ```widget:*``` blocks in Markdown
// are left unresolved.
const widgets = new WidgetRegistry();
// widgets.add(myWidget);

await createDevServer(
  {
    port: 1420,
    entryPoint: 'main.ts',
    routesDir: './routes',
    watch: true,
    appRoot: '.',
    widgets,
    markdownRenderer: {
      render(markdown: string): string {
        parser.set_text(markdown);
        const ast = JSON.parse(parser.parse_to_json());
        return astRenderer.render(ast);
      },
    },
  },
  denoServerRuntime,
);
````

Update the `dev` task in your `deno.json` to run this script instead of the
CLI:

```jsonc
{
  "tasks": {
    "dev": "deno run --allow-net --allow-read --allow-write --allow-run --allow-env dev.ts"
  }
}
```

On the server, `import.meta.url` resolves to a `file://` URL, so the WASM
loads from disk without a network request.

## Why both?

| Context                | What renders markdown            | When it runs                           |
| ---------------------- | -------------------------------- | -------------------------------------- |
| SPA (`/`)              | `MarkdownElement` in the browser | Client navigates to a `.page.md` route |
| SSR HTML (`/html/*`)   | `markdownRenderer` on the server | Server handles an `/html/*` request    |
| SSR Markdown (`/md/*`) | Nothing — returns raw markdown   | Server returns plain text as-is        |

Without the client-side renderer, SPA navigation to a markdown page will show
raw text. Without the server-side renderer, `/html/*` routes will return
`<mark-down>` tags instead of rendered HTML.
