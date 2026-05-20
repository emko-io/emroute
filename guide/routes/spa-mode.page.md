# SPA Mode

## What is SPA mode?

SPA mode controls what the server bundles and serves to the browser. It's a
single configuration option on `Emroute.create` that determines whether
your app ships JavaScript, and if so, how much.

```typescript
const emroute = await Emroute.create({
  spa: 'root',  // 'none' | 'leaf' | 'root' | 'only'
}, runtime);
```

All four modes use the same routes, the same pages, the same widgets. The
difference is purely about what reaches the browser.

## The four modes

### `none` — Zero JavaScript

The server renders HTML via SSR. No JavaScript bundles are produced or served.
The browser gets plain HTML and CSS.

This mode is for exploring what's possible with native browser capabilities:
forms, GET navigation, redirects, CSS animations — all without a single line
of JavaScript. Pages work in browsers with JS disabled. Links trigger full
page loads.

**Use when:** static sites, documentation, content pages, progressive
enhancement baseline, accessibility-first projects.

### `leaf` — SSR + JavaScript, no router

The server renders HTML via SSR and also serves JavaScript bundles. But emroute's
client-side router is **not** included. Links trigger full page loads (SSR).

Widgets hydrate and become interactive. You can embed any client-side framework
(React, Preact, Vue) inside widgets or directly in page HTML via `<script>` tags.
emroute doesn't care what you do with the JS — it just delivers it.

**Use when:** server-rendered pages with interactive islands, embedded apps that
use their own routing (e.g. hash routing), pages where you want SSR for SEO but
need JS for interactivity.

### `root` — Full SPA with SSR

The server renders HTML via SSR **and** includes emroute's client-side router.
This is the full progressive enhancement story:

1. First page load: server returns fully rendered HTML (fast, SEO-friendly)
2. Browser loads JS bundles and hydrates widgets
3. SPA router activates — subsequent navigations are client-side (fast, no
   full page reload)
4. Links use `/html/` base path, which works as full page loads without JS
   and as client-side transitions with JS

The SPA router intercepts link clicks and uses the Navigation API for
client-side transitions with view transitions.

**Use when:** most web applications. You get the best of both worlds — SSR for
first load and SEO, SPA for fast navigation after hydration.

### `only` — SPA shell, no SSR content

The server serves a minimal HTML shell with JavaScript bundles. No server-side
content rendering. The SPA router handles everything client-side.

The shell contains `<router-slot></router-slot>` and the script tags. The
router fetches page data and renders in the browser.

**Use when:** dashboard-style apps behind authentication where SEO doesn't
matter, rapid prototyping, apps where you want full client-side control.

## Server and client are independent

The SSR server and the SPA client are two separate applications that share
the same content. The server reads routes, widgets, and companion files from
a Runtime and renders HTML. The SPA client does the same — it fetches the
route, widget, and element manifests as JSON, loads `.js` modules on demand
via `FetchRuntime`, and renders in the browser.

Neither depends on the other at runtime. The server does not build the client.
The client does not require the server to be aware of it.

This means:

- **`buildClientBundles()` is an optional production optimization**, not a
  requirement for `BunFsRuntime`. The runtime serves `.ts` as transpiled
  JavaScript on the fly. Pre-building avoids per-request transpilation overhead
  in production.
- **The consumer owns `index.html` and `main.ts`.** If you provide your own,
  emroute uses them as-is. The generated defaults are just a convenience.
- **Frameworks wrapping emroute (like emkoord) don't need to know about
  client bundles.** The wrapper sets up SSR. The client is a separate concern
  the consumer handles directly.
- **The SPA is just another Runtime consumer.** It points `FetchRuntime` at
  the same server and reads the same files. Swapping the runtime (e.g. to
  `UniversalBrowserRuntime` for offline) changes nothing about the server.

## How it works

### Server behavior by mode

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
    [
      "`none`",
      "SSR rendered",
      "No",
      "No",
      "No"
    ],
    [
      "`leaf`",
      "SSR rendered",
      "Yes",
      "No",
      "Yes"
    ],
    [
      "`root`",
      "SSR rendered",
      "Yes",
      "Yes",
      "Yes"
    ],
    [
      "`only`",
      "Empty shell",
      "Yes",
      "Yes",
      "Yes"
    ]
  ]
}
```

### What gets served

`BunFsRuntime` serves `.ts` files as transpiled JavaScript on the fly, with
companion files (`.html`, `.md`, `.css`) inlined as `export const __files`.
Manifests reference `.ts` paths and the browser loads them directly.

For SPA modes, `buildClientBundles()` produces the SPA shell assets:

- **`emroute.js`** — the framework (router, component element, widget system,
  `bootEmrouteApp`), copied from the published package's `dist/`
- **`app.js`** — your `main.ts` entry point, transpiled via `runtime.transpile()`
  (`Bun.Transpiler` on Bun runtimes)

These are connected via browser import maps. The build step writes
`importmap.json`; the server inlines it into the HTML shell at request time.
Route tree and widget manifest are fetched as JSON at boot time by
`bootEmrouteApp()` — they are not compiled into `app.js`.

### Navigation

In `none` and `leaf` modes, every link click triggers a full page load. The
server renders fresh HTML each time.

In `root` and `only` modes, the SPA router intercepts link clicks. It uses the
browser's Navigation API for client-side transitions. Browsers without the
Navigation API gracefully fall back to full page loads.

Links use the HTML base path (`/html` by default, configurable via `basePath`).
In `root` and `only` modes, bare paths (e.g. `/`, `/about`) redirect to `/app/*`
(the SPA endpoint). In `none` and `leaf` modes, they redirect to `/html/*`.

- Without JS: `/html/about` is a real server endpoint that returns rendered HTML
- With JS: the router intercepts the click, fetches data, and renders client-side

This is progressive enhancement — the same links and URLs work in every mode.

## Configuration

### Server setup

The server doesn't need to know about client bundles:

```typescript filepath=server.ts
import { Emroute } from '@emkodev/emroute/server';
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';

const runtime = new BunFsRuntime('my-app');

const emroute = await Emroute.create({
  spa: 'root',
}, runtime);
```

### Build step (separate)

For `leaf`, `root`, or `only` modes, run the build step before starting the
server — from a build script, not from server init:

```typescript filepath=build.ts
// build.ts — run separately, e.g. `bun run build.ts`
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

### Custom main.ts

If your entry point file exists, the build step uses it as-is. If it doesn't
exist, a default one is generated that calls `bootEmrouteApp()`.

Write your own `main.ts` for full control:

```typescript filepath=main.ts
import { bootEmrouteApp, MarkdownElement } from '@emkodev/emroute/spa';
import { renderMarkdown } from '@emkodev/emkoma/render';

// Set up markdown renderer for client-side rendering of .md pages
MarkdownElement.setRenderer({ render: renderMarkdown });

// Boot the app — fetches manifests, registers widgets, creates router
await bootEmrouteApp();

// Your custom code here — analytics, service workers, theme switching, etc.
```

`bootEmrouteApp()` handles everything:
1. Fetches the route, widget, and element manifests as JSON from the runtime
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

You can change modes at any time. Your routes, pages, and widgets stay the same.
Only the delivery mechanism changes.

Next: [Error Handling](error-handling)
