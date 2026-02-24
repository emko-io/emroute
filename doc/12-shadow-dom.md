# Shadow DOM Architecture

## Overview

emroute uses a **unified Shadow DOM architecture** with Web Components that work
seamlessly across SSR and SPA contexts. The key insight: `shadowRoot.innerHTML`
is just a string property to SSR, enabling the same code to work everywhere.

## Core Principles

1. **ComponentElement always uses Shadow DOM** (real or mock)
2. **WidgetComponent stays DOM-agnostic** (returns HTML strings)
3. **SSR uses Declarative Shadow DOM** (`<template shadowrootmode="open">`)
4. **Full Web Components spec compliance**

## Key Components

### 1. SsrHTMLElement & SsrShadowRoot (Server-Side Mocks)

Located in `src/util/html.util.ts`:

```typescript
class SsrShadowRoot {
  innerHTML: string; // Just text to SSR
  host: SsrHTMLElement;
  // Minimal DOM API for compatibility
}

class SsrHTMLElement {
  shadowRoot: ShadowRoot | null;
  attachShadow(init: ShadowRootInit): ShadowRoot;
  // Minimal DOM API matching browser HTMLElement
}
```

**Key insight:** `shadowRoot.innerHTML` is identical from SSR's perspective
whether it's a real ShadowRoot or mock — both are just strings.

### 2. HTMLElementBase

```typescript
// Browser: real HTMLElement
// Server: SsrHTMLElement mock (not empty class)
export const HTMLElementBase = globalThis.HTMLElement ??
  (SsrHTMLElement as unknown as typeof HTMLElement);
```

### 3. ComponentElement (Web Component Wrapper)

**Always uses Shadow DOM** — no flags, no conditionals:

```typescript
class ComponentElement extends HTMLElementBase {
  constructor(component, files) {
    super();
    this.attachShadow({ mode: "open" }); // Always
  }

  render() {
    // Always render to shadowRoot
    this.shadowRoot!.innerHTML = this.component.renderHTML(...);
  }
}
```

ComponentElement is **thin** — just assigns widget output to shadowRoot.

### 4. WidgetComponent (Developer API)

Stays **DOM-agnostic** — returns strings:

```typescript
class PriceWidget extends WidgetComponent {
  getData({ params }) {
    return { price: 50000 };
  }
  renderHTML({ data }) {
    return `<span>$${data.price}</span>`;
  }
  renderMarkdown({ data }) {
    return `$${data.price}`;
  }
}
```

No knowledge of Shadow DOM — just returns HTML/Markdown strings.

## SSR Output: Declarative Shadow DOM

SSR renders widgets with Declarative Shadow DOM for all modes that include
server-rendered content (`none`, `root`, `leaf`):

```html
<!-- SSR output -->
<widget-crypto-price coin="bitcoin" ssr>
  <template shadowrootmode="open">
    <span>$42,000</span>
  </template>
</widget-crypto-price>
```

The browser parses `<template shadowrootmode="open">` into a real shadow root
before any JavaScript runs. This means:

- Content is visible immediately (no flash of unstyled content)
- Works without JavaScript (`none` mode)
- The `ssr` attribute tells the client to adopt instead of re-render

When a widget has `exposeSsrData = true`, the `getData()` result is serialized
as JSON text in the light DOM alongside the shadow root:

```html
<widget-crypto-price coin="bitcoin" ssr>
  <template shadowrootmode="open"><span>$42,000</span></template>
  {"price":42000}
</widget-crypto-price>
```

The client reads this JSON during hydration, then clears the light DOM text.

## SPA Modes and Shadow DOM

All four SPA modes use the same Shadow DOM architecture. The mode controls
**what the server sends** and **whether JavaScript runs**, not how Shadow DOM
works.

| Mode   | Server renders widgets? | JavaScript bundles? | SPA router? |
| ------ | ----------------------- | ------------------- | ----------- |
| `none` | Yes (Declarative SD)    | No                  | No          |
| `leaf` | Yes (Declarative SD)    | Yes                 | No          |
| `root` | Yes (Declarative SD)    | Yes                 | Yes         |
| `only` | No (shell only)         | Yes                 | Yes         |

- **`none`**: Full SSR with Declarative Shadow DOM. No JavaScript. Forms
  submit, links reload. Progressive enhancement at its purest.
- **`leaf`**: SSR + JavaScript. Widgets hydrate and become interactive.
  No client-side routing — every navigation is a full page load.
- **`root`**: SSR + JavaScript + SPA router. First load is server-rendered,
  subsequent navigation is client-side. Widgets hydrate on first load,
  render client-side on navigation.
- **`only`**: Shell only. No SSR content. Everything renders client-side.

## Client-Side Hydration

When JavaScript runs (`leaf`, `root`, `only`), ComponentElement handles two
cases:

1. **SSR adoption** (widget has `ssr` attribute): The Declarative Shadow DOM
   already created the shadow root. ComponentElement reads `exposeSsrData`
   from light DOM if present, removes the `ssr` attribute, and calls
   `hydrate()` to attach event listeners.

2. **Client-side render** (no `ssr` attribute): ComponentElement calls
   `attachShadow()`, runs `getData()` and `renderHTML()`, sets
   `shadowRoot.innerHTML`, then calls `hydrate()`.

Both paths end at the same state: a shadow root with rendered content and
active event listeners.

## Architecture Diagram

```
Developer writes:
┌─────────────────────────┐
│   WidgetComponent       │
│   getData()             │
│   renderHTML() → string │
│   renderMarkdown()      │
└─────────────────────────┘
            │
            │ Wrapped by
            ▼
┌─────────────────────────────────┐
│   ComponentElement              │
│   (Web Component)               │
│   attachShadow() always         │
│   shadowRoot.innerHTML = ...    │
└─────────────────────────────────┘
            │
      ┌─────┴─────┐
      │           │
   Server      Browser
      │           │
   SsrHTMLEl   HTMLElement
   (mock)      (real)
      │           │
   shadowRoot  shadowRoot
   (mock)      (real)
      │           │
   .innerHTML  .innerHTML
   (string)    (string)
      │           │
      │           └─→ Parsed to DOM nodes
      │
      └─→ Wrapped in <template shadowrootmode="open">
```

## Benefits

- **One ComponentElement implementation** — no conditionals based on mode
- **Full Web Components spec** — real Shadow DOM in browser, DevTools work
- **SSR mock matches browser API** — no divergence between environments
- **Progressive enhancement** — `none` mode works without JavaScript
- **No Light DOM path** — unified Shadow DOM everywhere
