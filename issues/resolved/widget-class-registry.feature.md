# Widget class registry and file-based discovery — 1.1.0

## Summary

Widgets should be file-discovered and class-based, not manually registered
instances. This aligns widgets with the file-based routing philosophy, enables
per-element state, and removes boilerplate registration code.

## Problem

### Shared instance

Widgets are registered as instances (`widgets.add(new CryptoPrice())`). One
instance is shared across all DOM elements of that widget type. This means:

- `this` state is shared — a counter, checkbox, or any interactive widget
  cannot store per-element state on the class.
- `destroy()` runs on the shared instance — one element disconnecting can
  affect all others.
- Interactive widgets (event listeners, DOM manipulation) have no access to
  their own DOM element.

### Manual registration boilerplate

Consumers must manually import and register every widget in both `main.ts`
(SPA) and the server config (SSR):

```ts
import cryptoPrice from './widgets/crypto-price.widget.ts';
import nav from './widgets/nav/nav.widget.ts';
import search from './widgets/search/search.widget.ts';

const widgets = new WidgetRegistry();
widgets.add(cryptoPrice);
widgets.add(nav);
widgets.add(search);

for (const widget of widgets) {
  ComponentElement.register(widget);
}
```

Every new widget requires edits in two places. This also makes CDN/static
deployment harder — consumers need a build step that knows about all widgets.

## Proposal

### File-based widget discovery

Widgets follow the same file convention as pages:

```
widgets/
  crypto-price/
    crypto-price.widget.ts     → exports widget class
    crypto-price.widget.html   → companion HTML (optional)
    crypto-price.widget.md     → companion markdown (optional)
    crypto-price.widget.css    → companion styles (optional)
  nav/
    nav.widget.ts
    nav.widget.css
  checkbox/
    checkbox.widget.ts
```

The route/widget generator scans `widgets/` and produces a widget manifest
alongside the routes manifest. No manual imports or registration needed.

### Widget file exports

Discovered widget files can export a class or a function. The framework
controls instantiation — consumers never call `new Widget(...)` themselves,
so constructors stay parameterless by design. No dependency injection, no
props through constructor — state comes from attributes.

**Class export** — full lifecycle, for stateful/interactive widgets:

```ts
// widgets/crypto-price/crypto-price.widget.ts
export default class CryptoPrice extends WidgetComponent<
  { coin: string },
  { price: number }
> {
  override readonly name = 'crypto-price';

  override async getData({ params, signal }: this['DataArgs']) {
    const res = await fetch(`/api/crypto/${params.coin}`, { signal });
    return res.json();
  }

  override renderHTML({ data, params }: this['RenderArgs']) {
    return data
      ? `<span class="price">${params.coin}: $${data.price}</span>`
      : `<span>Loading...</span>`;
  }
}
```

**Function export** — for simple, stateless widgets that just render:

```ts
// widgets/greeting/greeting.widget.ts
export default function greeting({ params }: { params: { name: string } }) {
  return `<span>Hello, ${params.name}!</span>`;
}
greeting.widgetName = 'greeting';
```

Function widgets are a lighter alternative — no class boilerplate when all
you need is a render function.

### Per-element instantiation

`ComponentElement` creates a new widget instance for each DOM element.
For manually registered widgets (instances), it uses `.constructor`:

```ts
// Before (shared instance)
super(component, files); // same instance for all elements

// After (per-element instance via .constructor)
const WidgetClass = component.constructor as new () => WidgetComponent;
super(new WidgetClass(), files); // fresh instance per element
```

For file-discovered widgets (classes), it instantiates directly:

```ts
super(new WidgetClass(), files);
```

Each `<widget-crypto-price>` gets its own `CryptoPrice` instance with its own
`this` state, its own `destroy()` lifecycle, and no shared mutation risks.

### Unified manifest format

Everything — file-discovered and manually registered — is a manifest entry:

```ts
interface WidgetManifestEntry {
  name: string;
  tagName: string;
  module: () => Promise<{ default: WidgetClass | WidgetFunction }>;
  files?: {
    html?: string;
    css?: string;
    md?: string;
  };
}
```

**File discovery** generates these automatically:

```ts
// widgets.manifest.ts (generated)
export const widgetManifest: WidgetManifestEntry[] = [
  {
    name: 'crypto-price',
    tagName: 'widget-crypto-price',
    module: () => import('./widgets/crypto-price/crypto-price.widget.ts'),
    files: {
      html: 'widgets/crypto-price/crypto-price.widget.html',
      css: 'widgets/crypto-price/crypto-price.widget.css',
    },
  },
];
```

**External widgets** use the same shape via `widgets.add()`:

```ts
widgets.add({
  name: 'chart',
  tagName: 'widget-chart',
  module: () => import('@some-lib/widgets/chart/chart.widget.ts'),
  files: {
    css: '@some-lib/widgets/chart/chart.widget.css',
  },
});
```

Same descriptor, same pipeline. The registry is just an array of manifest
entries — file discovery populates it in bulk, `add()` appends individual
entries. No distinction between internal and external at consumption time.

### Consumer setup

SPA and SSR both consume the manifest:

```ts
// main.ts — SPA
import { createSpaHtmlRouter } from '@emkodev/emroute/spa';
import { routesManifest } from './routes.manifest.ts';
import { widgetManifest } from './widgets.manifest.ts';

const router = await createSpaHtmlRouter(routesManifest, { widgets: widgetManifest });
```

```ts
// dev.ts — SSR
import { widgetManifest } from './widgets.manifest.ts';

await createDevServer({ widgets: widgetManifest, ... }, denoServerRuntime);
```

### Widget state and interactivity (optional follow-up)

Avoid inventing a state management system. Attributes are already state.

Widget params are serialized as HTML attributes (`<widget-counter count="0">`).
These are the widget's state — readable, mutable, and observable via the
native web component API:

```ts
// The element IS the state store.
// attributeChangedCallback gives reactivity for free.
static observedAttributes = ['count'];

attributeChangedCallback(name: string, _old: string, value: string) {
  // re-render on attribute change — no custom rerender() needed
}

mount(element: HTMLElement) {
  element.querySelector('button')?.addEventListener('click', () => {
    const count = Number(element.getAttribute('count') ?? 0);
    element.setAttribute('count', String(count + 1)); // triggers re-render
  });
}
```

This is the web platform's native pattern. No `this.state`, no `setState()`,
no diffing, no custom reactivity. The DOM is the source of truth.

**Principle: do not reinvent React.** No virtual DOM, no state objects, no
reconciliation. Widgets should lean on web component primitives:

- `getAttribute()` / `setAttribute()` — read/write state
- `observedAttributes` + `attributeChangedCallback` — reactivity
- `connectedCallback` / `disconnectedCallback` — lifecycle
- Shadow DOM — scoped styles (optional)
- Slots — content projection (optional)

`ComponentElement` already extends `HTMLElement`. The path forward is to
expose more of the native API, not to build abstractions on top of it.

SSR note: attributes work in SSR too — the server renders them into HTML.
The difference is that `attributeChangedCallback` and `mount()` only run
in the browser. `getData()` and `renderHTML()` remain universal.

This can be a follow-up — per-element instantiation is the prerequisite.

## Migration path

### No breaking changes

`WidgetRegistry.add(instance)` continues to work. The registry converts
an instance into a manifest entry with zero information loss:

```ts
// instance → manifest entry (internal conversion)
{
  name: instance.name,
  tagName: `widget-${instance.name}`,
  module: () => Promise.resolve({ default: instance.constructor }),
  files: instance.files, // already on the component
}
```

All the data is there: `name`, `.constructor` for per-element instantiation,
and `files` for companion assets. Existing consumer code is unchanged:

```ts
// Still works — no deprecation
const widgets = new WidgetRegistry();
widgets.add(new CryptoPrice());
widgets.add(new Nav());

// New — manifest entry (for external widgets, or explicit registration)
widgets.add({
  name: 'chart',
  tagName: 'widget-chart',
  module: () => import('@some-lib/chart.widget.ts'),
  files: { css: '@some-lib/widgets/chart/chart.widget.css' },
});
```

### Companion file resolution

- **Local widgets** (file-discovered): companion files are inferred by
  convention — same name, different extension (`.widget.html`, `.widget.css`,
  `.widget.md`). No need to declare them.
- **External widgets** (manual registration): companion file paths come from
  `instance.files` (legacy) or the `files` field on the manifest entry (new).

File-based discovery is additive. Manual registration remains necessary for
external widgets (third-party packages, shared libraries) that live outside
the consumer's `widgets/` directory and can't be file-discovered.

## Benefits

- **File-based** — consistent with routing philosophy. Filesystem is the config.
- **Per-element state** — widgets can be truly interactive (`this.count`,
  `this.checked`, event listeners).
- **No registration boilerplate** — add a file, it works.
- **CDN-friendly** — static SPA bundles include all widgets automatically via
  the manifest. No server needed.
- **SSR parity** — server uses the same manifest, same discovery, same classes.
