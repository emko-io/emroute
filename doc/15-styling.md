# Styling

Widgets render inside shadow DOM. Pages render in light DOM. This affects how
CSS is scoped and how consumers can style components from the outside.

## Widget CSS

### Companion files

Place a `.css` file alongside your widget:

```
widgets/nav/nav.widget.ts
widgets/nav/nav.widget.css
```

The CSS is automatically loaded and injected as a `<style>` tag inside the
widget's shadow root — both during SSR (via declarative shadow DOM) and
client-side rendering (via `setHTMLUnsafe()`).

The CSS is wrapped in `@scope (widget-{name})` for additional scoping:

```css
/* nav.widget.css — written as plain CSS */
.site-nav { display: flex; gap: 1rem; }
.site-nav a.active { font-weight: bold; }

/* Injected as: */
@scope (widget-nav) {
  .site-nav { display: flex; gap: 1rem; }
  .site-nav a.active { font-weight: bold; }
}
```

### Inline styles

You can also return `<style>` tags directly from `renderHTML()`:

```ts
override renderHTML(args: this['RenderArgs']): string {
  return `
    <style>.counter { display: flex; gap: 0.5rem; }</style>
    <div class="counter">...</div>
  `;
}
```

Both approaches coexist — companion CSS and inline `<style>` tags merge
inside shadow DOM.

## Page CSS

Pages use companion `.css` files the same way, but they render in light DOM
as a plain `<style>` tag (no `@scope`, no shadow DOM):

```
routes/about/about.page.ts
routes/about/about.page.css
```

## Widget lifecycle states

Every widget exposes its lifecycle state via
[`CustomStateSet`](https://developer.mozilla.org/en-US/docs/Web/API/CustomStateSet)
on `ElementInternals`. This lets you style widgets from **outside** (light DOM
CSS) based on what the widget is doing — no attributes, no classes.

### Available states

| State | Meaning | When |
|---|---|---|
| `:state(lazy)` | Waiting for viewport intersection | `lazy` attribute present, not yet visible |
| `:state(loading)` | `getData()` in flight | Client-side data fetch started |
| `:state(hydrating)` | SSR content adopted, wiring up | Between SSR adoption and `hydrate()` completing |
| `:state(ready)` | Interactive | Data loaded, rendered, listeners attached |
| `:state(error)` | Failed | `getData()` threw or params validation failed |

States are mutually exclusive — only one is active at a time.

### Usage

```css
/* Fade in when ready */
widget-nav {
  opacity: 0;
  transition: opacity 0.2s;
}
widget-nav:state(ready) {
  opacity: 1;
}

/* Loading skeleton */
widget-feed:state(loading) {
  min-height: 200px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

/* Error outline */
widget-feed:state(error) {
  border: 2px solid #dc2626;
}

/* Dim lazy widgets until they activate */
widget-chart:state(lazy) {
  opacity: 0.3;
}
```

### JavaScript matching

You can also check states programmatically:

```ts
const widget = document.querySelector('widget-nav');
widget.matches(':state(ready)');  // true
widget.matches(':state(loading)'); // false
```

### SSR (`none` mode)

In `none` mode no JavaScript runs, so no custom states are set. Widgets are
visible immediately via declarative shadow DOM — style them without state
selectors, or use a CSS fallback:

```css
/* Works in all modes — no JS needed */
widget-nav { display: block; }

/* Only applies once JS has run and widget is ready */
widget-nav:state(ready) { animation: fade-in 0.2s; }
```
