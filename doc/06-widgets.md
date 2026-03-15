# Widgets

Widgets are self-contained interactive components embedded in page content. They
extend `WidgetComponent` instead of `PageComponent` and follow the same
lifecycle: `getData()` → `renderHTML()` / `renderMarkdown()`.

## Create a widget

Place widgets in `widgets/{name}/{name}.widget.ts`:

**`widgets/counter/counter.widget.ts`**

```ts
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

Add `widgetsDir` to your runtime config:

```ts
const runtime = new BunFsRuntime(appRoot, {
  routesDir: '/routes',
  widgetsDir: '/widgets',
});
```

The runtime scans the directory and registers all widgets automatically.

## Embed widgets in pages

### In HTML (`.page.html` or `renderHTML()`)

Use the custom element tag `<widget-{name}>`. Attributes become parameters:

```html
<widget-counter start="42"></widget-counter>
```

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

```css
:host { display: block; container-type: inline-size; content-visibility: auto; }
:host([hidden]) { display: none; }
```

- **`display: block`** — custom elements are `inline` by default, which breaks
  width/height and containment. Block is the right default for widgets.
- **`container-type: inline-size`** — every widget is a container query target.
  Use `@container` in companion CSS to write responsive styles scoped to the
  widget's own width rather than the viewport.
- **`content-visibility: auto`** — off-screen widgets skip layout and paint,
  improving performance on pages with many widgets.
- **`hidden` safeguard** — ensures the `hidden` attribute works even though
  `:host` sets an explicit display.

To override any of these, write `:host { ... }` in your companion CSS — it
lives in `@layer emroute` which takes priority over `@layer emroute-base`.

## Hydration (SPA mode)

When using SPA mode, widgets can add interactivity after rendering via the
`hydrate()` lifecycle hook:

```ts
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

## Best practices

### Don't override global HTML attributes

When setting attributes like `role` or `tabindex` in `hydrate()`, check whether
the consumer has already set them. Overriding author-set globals breaks
accessibility and developer intent:

```ts
override hydrate() {
  const el = this.element!;
  // Respect consumer-set values — only apply defaults
  if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
}
```

Never unconditionally write to `role`, `tabindex`, `aria-*`, `class`, or other
global attributes — the consumer may have set them deliberately.

Next: [Server Setup](./07-server.md)
