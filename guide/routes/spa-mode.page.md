<!--==chunk:hero==-->

# SPA Mode

A single configuration option on `Emroute.create()` that determines whether
your app ships JavaScript, and if so, how much. All four modes use the same
routes, the same pages, the same widgets — only what reaches the browser
changes.

```typescript
const emroute = await Emroute.create({
  spa: 'root',  // 'none' | 'leaf' | 'root' | 'only'
}, runtime);
```

<!--==chunk:card==-->

## `none` — zero JavaScript

Server renders HTML via SSR. No JS bundles produced or served. Pages work
in browsers with JS disabled; links trigger full page loads.

**Use when:** static sites, documentation, accessibility-first projects.

<!--==chunk:card==-->

## `leaf` — SSR + JS islands

SSR HTML plus JS bundles, but no emroute client-side router. Widgets
hydrate; you can embed React/Preact/Vue inside widgets or via `<script>`.

**Use when:** server-rendered pages with interactive islands, embedded
apps that use their own routing.

<!--==chunk:card==-->

## `root` — SPA with SSR (default)

SSR HTML plus full SPA client. First load is server-rendered; subsequent
navigations go through the Navigation API client-side. Progressive
enhancement: links work both with and without JS.

**Use when:** most web applications.

<!--==chunk:card==-->

## `only` — SPA shell, no SSR

Minimal HTML shell plus JS bundles. No server-side content rendering — the
SPA router fetches and renders everything client-side.

**Use when:** dashboards behind authentication where SEO doesn't matter.

<!--==chunk:detail==-->

## Server and client are independent

The SSR server and the SPA client are two separate applications that share
the same content. The server reads routes, widgets, and companion files
from a Runtime and renders HTML. The SPA client does the same — it fetches
the route, widget, and element manifests as JSON, loads `.js` modules on
demand via `FetchRuntime`, and renders in the browser.

Neither depends on the other at runtime. The server does not build the
client. The client does not require the server to be aware of it.

This means:

- **`buildClientBundles()` is an optional production optimization**, not a
  requirement for `BunFsRuntime`. The runtime serves `.ts` as transpiled
  JavaScript on the fly. Pre-building avoids per-request transpilation
  overhead in production.
- **The consumer owns `index.html` and `main.ts`.** If you provide your
  own, emroute uses them as-is. The generated defaults are just a
  convenience.
- **Frameworks wrapping emroute don't need to know about client bundles.**
  The wrapper sets up SSR. The client is a separate concern the consumer
  handles directly.
- **The SPA is just another Runtime consumer.** It points `FetchRuntime`
  at the same server and reads the same files. Swapping the runtime
  changes nothing about the server.

## Server behavior by mode

```table
{
  "head": [
    "",
    "HTML response",
    "JS bundles",
    "SPA router",
    "Widgets hydrate"
  ],
  "body": [
    [ "`none`", "SSR rendered", "No", "No", "No" ],
    [ "`leaf`", "SSR rendered", "Yes", "No", "Yes" ],
    [ "`root`", "SSR rendered", "Yes", "Yes", "Yes" ],
    [ "`only`", "Empty shell", "Yes", "Yes", "Yes" ]
  ]
}
```

## What gets served

`BunFsRuntime` serves `.ts` files as transpiled JavaScript on the fly, with
companion files (`.html`, `.md`, `.css`) inlined as `export const __files`.
Manifests reference `.ts` paths and the browser loads them directly.

For SPA modes, `buildClientBundles()` produces the SPA shell assets:

- **`emroute.js`** — the framework (router, component element, widget
  system, `bootEmrouteApp`), copied from the published package's `dist/`
- **`app.js`** — your `main.ts` entry point, transpiled via
  `runtime.transpile()` (`Bun.Transpiler` on Bun runtimes)

These are connected via browser import maps. The build step writes
`importmap.json`; the server inlines it into the HTML shell at request
time. The route, widget, and element manifests are fetched as JSON at boot
time by `bootEmrouteApp()` — they are not compiled into `app.js`.

## Navigation

In `none` and `leaf` modes, every link click triggers a full page load.
The server renders fresh HTML each time.

In `root` and `only` modes, the SPA router intercepts link clicks. It uses
the browser's Navigation API for client-side transitions. Browsers without
the Navigation API gracefully fall back to full page loads.

Links use the HTML base path (`/html` by default, configurable via
`basePath`). In `root` and `only` modes, bare paths (e.g. `/`, `/about`)
redirect to `/app/*` (the SPA endpoint). In `none` and `leaf` modes, they
redirect to `/html/*`.

- Without JS: `/html/about` is a real server endpoint that returns
  rendered HTML
- With JS: the router intercepts the click, fetches data, and renders
  client-side

This is progressive enhancement — the same links and URLs work in every
mode.

## Configuration

The server doesn't need to know about client bundles:

```typescript filepath=server.ts
import { Emroute } from '@emkodev/emroute/server';
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';

const runtime = new BunFsRuntime('my-app');

const emroute = await Emroute.create({
  spa: 'root',
}, runtime);
```

For `leaf`, `root`, or `only` modes, run the build step before starting
the server — from a build script, not from server init:

```typescript filepath=build.ts
import { buildClientBundles } from '@emkodev/emroute/server/build';
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';

const runtime = new BunFsRuntime('my-app');

await buildClientBundles({
  runtime,
  root: 'my-app',
  spa: 'root',
});
```

For `none` mode, no build step is needed.

## Custom main.ts

If your entry point file exists, the build step uses it as-is. If it
doesn't exist, a default one is generated that calls `bootEmrouteApp()`.
Write your own for full control:

```typescript filepath=main.ts
import { bootEmrouteApp, MarkdownElement } from '@emkodev/emroute/spa';
import { renderMarkdown } from '@emkodev/emkoma/render';

MarkdownElement.setRenderer({ render: renderMarkdown });

await bootEmrouteApp();

// Your custom code here — analytics, service workers, theme switching, etc.
```

`bootEmrouteApp()` handles everything:

1. Fetches the route, widget, and element manifests as JSON from the
   runtime
2. Registers all discovered widgets with lazy module loading
3. Imports and registers discovered elements
4. Creates the SPA router and wires client-side navigation

## Choosing a mode

Start with `none`. Add JavaScript only when you need it.

```
Do you need any JavaScript?
├── No  → none
└── Yes
    ├── Do you need client-side routing?
    │   ├── No  → leaf
    │   └── Yes
    │       ├── Do you need SSR for first load / SEO?
    │       │   ├── Yes → root
    │       │   └── No  → only
    │       └──
    └──
```

You can change modes at any time. Your routes, pages, and widgets stay the
same. Only the delivery mechanism changes.

<!--==chunk:outro==-->

Next: [Error Handling](error-handling)
