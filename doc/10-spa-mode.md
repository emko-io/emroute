# SPA Mode

## What is SPA mode?

SPA mode controls what the server bundles and serves to the browser. It's a
single configuration option on `createEmrouteServer` that determines whether
your app ships JavaScript, and if so, how much.

```typescript
const emroute = await createEmrouteServer({
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

The server serves a minimal HTML shell at `/html/*` with JavaScript bundles.
No server-side content rendering. The SPA router handles everything client-side.

The shell contains `<router-slot></router-slot>` and the script tags. The
router fetches page data and renders in the browser. Bare paths redirect to
`/html/*` like all other modes.

**Use when:** dashboard-style apps behind authentication where SEO doesn't
matter, rapid prototyping, apps where you want full client-side control.

## How it works

### Server behavior by mode

| | HTML response | JS bundles | SPA router | Widgets hydrate |
|---|---|---|---|---|
| `none` | SSR rendered | No | No | No |
| `leaf` | SSR rendered | Yes | No | Yes |
| `root` | SSR rendered | Yes | Yes | Yes |
| `only` | Empty shell | Yes | Yes | Yes |

### What gets bundled

When SPA mode is not `none`, the runtime's `bundle()` produces:

- **`emroute.js`** — the framework (router, component element, widget system)
- **`app.js`** — your `main.ts` entry point with route manifests and widget
  registration
- **`widgets.js`** (optional) — separate widget bundle if configured

These are connected via browser import maps in the generated `index.html` shell.

### Navigation

In `none` and `leaf` modes, every link click triggers a full page load. The
server renders fresh HTML each time.

In `root` and `only` modes, the SPA router intercepts link clicks. It uses the
browser's Navigation API for client-side transitions. Browsers without the
Navigation API gracefully fall back to full page loads.

Links use the HTML base path (`/html` by default, configurable via `basePath`).
Bare paths (e.g. `/`, `/about`) redirect to their base path equivalent in all
modes. This means:
- Without JS: `/html/about` is a real server endpoint that returns rendered HTML
- With JS: the router intercepts the click, fetches data, and renders client-side

This is progressive enhancement — the same links and URLs work in every mode.

## Configuration

### Basic setup

```typescript
import { createEmrouteServer } from '@emkodev/emroute/server';
import { BunFsRuntime } from '@emkodev/emroute/runtime/bun/fs';

const runtime = new BunFsRuntime('my-app', {
  entryPoint: '/main.ts',  // enables bundling (required for leaf/root/only)
});

const emroute = await createEmrouteServer({
  spa: 'root',
}, runtime);
```

### Without bundling

For `none` mode, no entry point or bundling is needed:

```typescript
const runtime = new BunFsRuntime('my-app');

const emroute = await createEmrouteServer({
  spa: 'none',
}, runtime);
```

### Custom main.ts

If your entry point file exists, emroute uses it as-is. If it doesn't exist,
`bundle()` generates a default one that:

1. Imports route and widget manifests from `emroute:routes` / `emroute:widgets`
2. Registers all discovered widgets
3. Creates the SPA router (in `root`/`only` modes)

You can write your own `main.ts` for full control:

```typescript
import { routesManifest } from 'emroute:routes';
import { widgetsManifest } from 'emroute:widgets';
import { ComponentElement, createSpaHtmlRouter } from '@emkodev/emroute/spa';

// Register widgets
for (const widget of widgetsManifest.widgets) {
  ComponentElement.register(widget, widgetsManifest.moduleLoaders);
}

// Create router
createSpaHtmlRouter(routesManifest);

// Your custom code here — analytics, service workers, theme switching, etc.
```

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
