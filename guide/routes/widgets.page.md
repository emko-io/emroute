# Widgets

Widgets are self-contained interactive components embedded in page content. They
extend `WidgetComponent` instead of `PageComponent` and follow the same
lifecycle: `getData()` → `renderHTML()` / `renderMarkdown()`.

## Create a widget

Place widgets in `widgets/{name}/{name}.widget.ts`:

```ts filepath=widgets/counter/counter.widget.ts
import { WidgetComponent } from '@emkodev/emroute';

interface CounterData {
  count: number;
}

class CounterWidget extends WidgetComponent<{ start?: string }, CounterData> {
  override readonly name = 'counter';

  override getData({ params }: this['DataArgs']) {
    return Promise.resolve({ count: parseInt(params.start ?? '0', 10) });
  }

  override renderHTML({ data }: this['RenderArgs']) {
    if (!data) return '';
    return `<button class="dec">-</button>
<span class="count">${data.count}</span>
<button class="inc">+</button>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']) {
    return data ? `Counter: ${data.count}` : '';
  }
}

export default new CounterWidget();
```

Like page components, the file must `export default` an **instance**.

## Enable widget discovery

The default `widgetsDir` is `/widgets`. The runtime scans the directory and
registers all widgets automatically. To use a different directory, pass it
to your runtime config:

```ts filepath=server.ts
const runtime = new BunFsRuntime(appRoot, {
  widgetsDir: '/components',
});
```

## Embed widgets in pages

### In HTML (`.page.html` or `renderHTML()`)

Use the custom element tag `<widget-{name}>`. Attributes become parameters:

```html
<widget-counter start="42"></widget-counter>
```

> HTML normalizes attribute names to lowercase. Use lowercase names like
> `courseid` (not `courseId`). Kebab-case attributes are converted to
> camelCase in `params`: `my-count` → `myCount`.

### In Markdown (`.page.md` or `renderMarkdown()`)

Use fenced block syntax. JSON keys become parameters:

````md
```widget:counter
{"start": "42"}
```
````

Omit the JSON body when the widget takes no parameters:

````md
```widget:nav
```
````

> **Don't paste raw `<widget-{name}>` tags into `.page.md` files.** Markdown
> renderers escape inline HTML by default, so `<widget-counter></widget-counter>`
> in a `.md` becomes `&lt;widget-counter&gt;&lt;/widget-counter&gt;` in the
> HTML output — your widget will not appear. Use the fenced block syntax
> above in markdown; the raw tag syntax is for `.page.html` files and
> `renderHTML()` strings only.

## SSR output

In SSR HTML mode, widgets render server-side with Declarative Shadow DOM:

```html
<widget-counter start="42" ssr>
  <template shadowrootmode="open">
    <button class="dec">-</button>
    <span class="count">42</span>
    <button class="inc">+</button>
  </template>
</widget-counter>
```

In SSR Markdown mode, the fenced block is replaced with the widget's
`renderMarkdown()` output:

```
Counter: 42
```

## Companion files

Widgets support the same companion files as pages:

```
widgets/counter/
  counter.widget.ts      ← Widget module
  counter.widget.html    ← HTML template (optional)
  counter.widget.css     ← Scoped styles (optional)
  counter.widget.md      ← Markdown template (optional)
```

CSS companions are wrapped in `@layer emroute { ... }` and applied inside the
widget's shadow DOM. Shadow DOM isolates the styles; the `@layer` ensures
companion CSS has lower cascade priority than inline `<style>` tags in
`renderHTML()`. Write plain CSS — wrapping happens automatically.

### Default `:host` styles

Every widget receives a base stylesheet (via `@layer emroute-base`, lower
priority than companion CSS):

```css filepath=counter.widget.css
:host { display: block; }
:host([hidden]) { display: none; }
```

- **`display: block`** — custom elements are `inline` by default, which breaks
  width/height. Block is the right default for widgets.
- **`hidden` safeguard** — ensures the `hidden` attribute works even though
  `:host` sets an explicit display.

To override, write `:host { ... }` in your companion CSS — it lives in
`@layer emroute` which takes priority over `@layer emroute-base`.

### Opt-in performance and container queries

These properties are useful but have trade-offs, so they are not set by
default. Add them in your companion CSS when needed:

```css filepath=counter.widget.css
/* Container queries — widget responds to its own width, not the viewport.
   Implies contain: inline-size — the host element won't derive its width
   from its children. Ensure the parent layout gives the widget explicit
   or flex/grid sizing. */
:host { container-type: inline-size; }

/* Skip layout/paint for off-screen widgets. Set contain-intrinsic-size
   to avoid scroll height jumps. */
:host { content-visibility: auto; contain-intrinsic-size: auto 200px; }
```

To override any of these, write `:host { ... }` in your companion CSS — it
lives in `@layer emroute` which takes priority over `@layer emroute-base`.

## Hydration (SPA mode)

When using SPA mode, widgets can add interactivity after rendering via the
`hydrate()` lifecycle hook:

```ts filepath=counter.widget.ts
override hydrate({ data }: this['RenderArgs']) {
  const button = this.element?.shadowRoot?.querySelector('#btn');
  button?.addEventListener('click', this.handleClick);
}

override destroy() {
  const button = this.element?.shadowRoot?.querySelector('#btn');
  button?.removeEventListener('click', this.handleClick);
}
```

`hydrate()` is called after both SSR adoption and fresh SPA rendering. Use
`this.element` to access the host `<widget-{name}>` custom element (only
available in the browser — `undefined` on the server).

### `data` in `hydrate()` after SSR adoption

When a widget is SSR'd and the client adopts the server-rendered DOM, the
client does **not** re-run `getData()` — that would defeat the purpose of
SSR. By default this means `hydrate({ data })` receives `data: null` in that
flow. You have two options.

**Option 1: read state from the DOM.** The SSR output already contains
everything the user can see — query the shadow root for the values you need:

```ts filepath=counter.widget.ts
override hydrate() {
  const span = this.element?.shadowRoot?.querySelector('.count');
  let count = Number(span?.textContent ?? 0);
  // ...
}
```

**Option 2: opt into `exposeSsrData`.** Set
`override readonly exposeSsrData = true` on the widget class. The server
serializes the `getData()` result as JSON text in light DOM; the client
parses it back into `this.data` before `hydrate()` runs, so `data` is
populated:

```ts filepath=counter.widget.ts
class CounterWidget extends WidgetComponent<{ start?: string }, CounterData> {
  override readonly name = 'counter';
  override readonly exposeSsrData = true;
  // ...
  override hydrate({ data }: this['RenderArgs']) {
    let count = data?.count ?? 0; // data is populated here
  }
}
```

On client-side SPA navigation (no SSR adoption), `getData()` runs as usual
and `hydrate()` receives the freshly fetched `data` regardless of
`exposeSsrData`.

## Best practices

### Don't override global HTML attributes

When setting attributes like `role` or `tabindex` in `hydrate()`, check whether
the consumer has already set them. Overriding author-set globals breaks
accessibility and developer intent:

```ts filepath=counter.widget.ts
override hydrate() {
  const el = this.element!;
  // Respect consumer-set values — only apply defaults
  if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
}
```

Never unconditionally write to `role`, `tabindex`, `aria-*`, `class`, or other
global attributes — the consumer may have set them deliberately.

Next: [Server Setup](server)
