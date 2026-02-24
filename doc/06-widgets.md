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

CSS companions are automatically scoped to the widget element using
`@scope (widget-{name}) { ... }`. Write plain CSS — scoping happens at render
time.

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

Next: [Server Setup](./07-server.md)
