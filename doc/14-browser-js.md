# Browser JavaScript

emroute is isomorphic — the same server, the same renderers, the same pages
and widgets run on both the server (SSR) and in the browser (SPA). This guide
covers how modules are delivered to the browser, how dependencies resolve on
both sides, and how to register custom elements.

> Applies to `leaf`, `root`, and `only` modes. In `none` mode there is no
> browser JavaScript.

## How browser code is delivered

Every `.ts` file — pages, widgets, elements, `main.ts` — is transpiled
(type-stripped) to `.js` and served as an individual ES module. The browser
loads them on demand over HTTP/2. There is no bundling step.

Module resolution in the browser uses a standard
[import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap).
Bare specifiers like `import { something } from 'dayjs'` resolve to URLs
defined in the import map. This works for all modules, including lazily loaded
pages and widgets.

The generated `index.html` shell contains:

```html
<script type="importmap">{ "imports": { ... } }</script>
<script type="module" src="/app.js"></script>
```

emroute provides base import map entries for its own packages. You extend
the map by providing an `importmap.json` in your project root.

## Import map

emroute always maps its own packages:

```json
{
  "imports": {
    "@emkodev/emroute/spa": "/emroute.js",
    "@emkodev/emroute": "/emroute.js"
  }
}
```

To make third-party packages available to your pages and widgets, create an
`importmap.json` in your project root:

```json
{
  "imports": {
    "@emkodev/emkoma/": "https://esm.sh/@emkodev/emkoma/",
    "dayjs": "https://esm.sh/dayjs",
    "my-design-system/": "/vendor/design-system/"
  }
}
```

emroute merges your entries with its base entries (your entries win on
conflict) and writes the combined map into the HTML shell.

Any module in your project — `main.ts`, a page component, a widget — can
then use these imports:

```ts
import { renderMarkdown } from '@emkodev/emkoma/render';
import dayjs from 'dayjs';
```

Dependencies load lazily. If `dayjs` is only imported by a deeply nested
widget, the browser fetches it only when that widget first appears in the DOM.
The import map declares what is *available*, not what is *loaded*.

### How dependencies resolve

The same `import dayjs from 'dayjs'` in a page or widget resolves differently
depending on where it runs:

| | Resolution | Source |
|---|---|---|
| **Server** (Bun/Node) | Native `import()` | `node_modules/dayjs` |
| **Browser** | Import map | `https://esm.sh/dayjs` (or wherever you mapped it) |

On the server, bare specifiers resolve from `node_modules` automatically —
no import map needed. The import map gives the browser the same resolution
capability that server runtimes already have natively.

Install the package with your package manager for the server, and map it in
`importmap.json` for the browser. Both sides use the same `import` statement.

### Where do vendor modules come from?

| Source | Example | Notes |
|--------|---------|-------|
| CDN | `"dayjs": "https://esm.sh/dayjs"` | Zero local files. esm.sh, jspm.io, unpkg, etc. |
| Local vendor dir | `"my-lib/": "/vendor/my-lib/"` | Copy ESM-ready packages into your project |
| Pre-built bundle | `"@emkodev/emroute/spa": "/emroute.js"` | How emroute itself is served |

## `main.ts`

If a `main.ts` file exists in your project root, it is transpiled to `app.js`
and loaded as the page's entry module. If it doesn't exist, emroute generates
a minimal default:

```ts
import { bootEmrouteApp } from '@emkodev/emroute/spa';
await bootEmrouteApp();
```

Write your own `main.ts` when you need to:
- Configure the markdown renderer
- Register third-party custom elements or widgets
- Run code at boot (analytics, service workers, etc.)

### What `bootEmrouteApp()` does

1. Fetches route, widget, and element manifests from the server
2. Registers discovered widgets as `<widget-{name}>` custom elements
   (lazy — module loads on first use)
3. Imports discovered element modules and registers them via
   `customElements.define()`
4. Creates the SPA router and wires the Navigation API

Everything before `bootEmrouteApp()` runs before the router starts. Everything
after runs once the router is ready.

## Widgets

Widgets extend `WidgetComponent` and live in `widgets/{name}/{name}.widget.ts`.
They are discovered automatically — by the server for SSR and by
`bootEmrouteApp()` in the browser. Each widget becomes a `<widget-{name}>`
custom element. You don't register them manually.

```
widgets/
  counter/
    counter.widget.ts
    counter.widget.html    # optional companion
    counter.widget.css     # optional companion
```

Widgets support SSR, data fetching, hydration, companion files, and lazy
loading. See the widget documentation for details.

### External widgets

If you have a widget from an external package, register it in `main.ts`:

```ts
import { ComponentElement } from '@emkodev/emroute/spa';
import { ExternalWidget } from 'some-package';

ComponentElement.register(new ExternalWidget());

import { bootEmrouteApp } from '@emkodev/emroute/spa';
await bootEmrouteApp();
```

## Custom elements

Custom elements are plain `HTMLElement` subclasses. emroute supports two ways
to register them.

### Auto-discovery from `elements/`

Place your element in `elements/{name}/{name}.element.ts` with the class as
the default export. The name must contain a hyphen (web component spec).

```
elements/
  code-editor/
    code-editor.element.ts
```

```ts
// elements/code-editor/code-editor.element.ts
export default class CodeEditor extends HTMLElement {
  connectedCallback() {
    this.innerHTML = '<textarea></textarea>';
  }
}
```

`bootEmrouteApp()` discovers these automatically, imports the modules, and
calls `customElements.define('code-editor', CodeEditor)`. No manual
registration needed.

### Third-party elements in `main.ts`

For elements from external packages, register them before calling
`bootEmrouteApp()`:

```ts
// Side-effect import (recommended when the package provides one)
import '@emkodev/emkoma/element/register';  // defines <emkoma-document>

// Or explicit registration
import { MyElement } from 'some-package';
customElements.define('my-element', MyElement);

import { bootEmrouteApp } from '@emkodev/emroute/spa';
await bootEmrouteApp();
```

### Widgets vs custom elements

| | Widgets | Custom elements |
|---|---|---|
| Base class | `WidgetComponent` | `HTMLElement` |
| Convention | `widgets/{name}/{name}.widget.ts` | `elements/{name}/{name}.element.ts` |
| Tag name | `<widget-{name}>` | `<{name}>` (folder name) |
| SSR | Yes (server renders HTML + markdown) | No (client-side only) |
| Data fetching | `getData()` with abort signal | Your own logic |
| Companion files | `.html`, `.md`, `.css` | None |
| Hydration | `hydrate()` hook | `connectedCallback()` |

Use widgets when you need SSR, server-side data, or companion files. Use
custom elements for client-only interactive components.

## Using third-party packages

Any package mapped in your `importmap.json` can be imported from any `.ts`
file — pages, widgets, elements, and `main.ts` alike:

```ts
// widgets/date-display/date-display.widget.ts
import { WidgetComponent } from '@emkodev/emroute';
import dayjs from 'dayjs';

class DateDisplayWidget extends WidgetComponent<{ date: string }, { formatted: string }> {
  override readonly name = 'date-display';

  override getData({ params }: this['DataArgs']) {
    return Promise.resolve({ formatted: dayjs(params.date).format('MMMM D, YYYY') });
  }

  override renderHTML({ data }: this['RenderArgs']) {
    return `<time>${data?.formatted}</time>`;
  }
}

export default new DateDisplayWidget();
```

This works because:
1. The widget module loads lazily via `import()` when `<widget-date-display>`
   appears in the DOM
2. The browser resolves `dayjs` through the import map
3. `dayjs` is fetched only at that moment — not at page load

### Using frameworks (React, Preact, Vue, Svelte)

Map the framework in `importmap.json`:

```json
{
  "imports": {
    "react": "https://esm.sh/react",
    "react-dom/client": "https://esm.sh/react-dom/client"
  }
}
```

Then use it in a widget or custom element:

```ts
// widgets/react-app/react-app.widget.ts
import { WidgetComponent } from '@emkodev/emroute';

class ReactAppWidget extends WidgetComponent {
  override readonly name = 'react-app';

  override getData() { return Promise.resolve(null); }

  override renderHTML() {
    return '<div id="root"></div>';
  }

  override hydrate() {
    import('react-dom/client').then(({ createRoot }) => {
      const el = this.element?.shadowRoot?.querySelector('#root');
      if (el) createRoot(el).render(/* your JSX */);
    });
  }

  override destroy() {
    // Unmount React
  }
}

export default new ReactAppWidget();
```

Or as a custom element:

```ts
// elements/react-app/react-app.element.ts
export default class ReactApp extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    import('react-dom/client').then(({ createRoot }) => {
      createRoot(shadow).render(/* your React tree */);
    });
  }
}
```

## `leaf` mode

In `leaf` mode there is no SPA router. The generated `main.ts` is:

```ts
import '@emkodev/emroute/spa';
```

This registers `<router-slot>` and `<mark-down>`, but does not call
`bootEmrouteApp()`. Auto-discovery of widgets and elements does not run.

To use widgets or custom elements in leaf mode, write a custom `main.ts`
and register them explicitly:

```ts
import '@emkodev/emroute/spa';
import { ComponentElement } from '@emkodev/emroute/spa';
import MyWidget from './widgets/my-widget/my-widget.widget.ts';

ComponentElement.register(MyWidget);

import './elements/my-element/register.ts';
```

Every link click triggers a full page load (SSR). JavaScript only runs for
widget hydration and your custom elements.

## What emroute auto-registers

| Tag | Source | When |
|-----|--------|------|
| `<router-slot>` | Framework | On `@emkodev/emroute/spa` import |
| `<mark-down>` | Framework | On `@emkodev/emroute/spa` import |
| `<widget-{name}>` | `widgets/` | `bootEmrouteApp()` (lazy per widget) |
| `<{name}>` | `elements/` | `bootEmrouteApp()` (all imported at boot) |

Third-party elements and widgets — register in `main.ts` before
`bootEmrouteApp()`.

## Custom `index.html`

If you place an `index.html` in your project root, emroute uses it as-is.
This lets you add `<meta>` tags, external stylesheets, analytics scripts,
or manage the import map yourself.

Requirements:
- Must contain `<router-slot></router-slot>`
- Must include the import map and `<script>` tag for `app.js`

When providing a custom `index.html`, `importmap.json` is not merged
automatically — you manage the full import map in your HTML.

## `main.css`

If a `main.css` file exists in your project root, it is injected as
`<link rel="stylesheet" href="/main.css">` in the HTML shell.

## Full example

```
my-app/
  importmap.json
  main.ts
  main.css
  routes/
    index.page.md
    about.page.html
    projects/
      [id].page.ts
  widgets/
    counter/
      counter.widget.ts
      counter.widget.html
      counter.widget.css
  elements/
    code-editor/
      code-editor.element.ts
```

`importmap.json`:

```json
{
  "imports": {
    "@emkodev/emkoma/": "https://esm.sh/@emkodev/emkoma/",
    "highlight.js": "https://esm.sh/highlight.js"
  }
}
```

`main.ts`:

```ts
import { bootEmrouteApp, MarkdownElement } from '@emkodev/emroute/spa';
import { renderMarkdown } from '@emkodev/emkoma/render';

MarkdownElement.setRenderer({ render: renderMarkdown });

const app = await bootEmrouteApp();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```
