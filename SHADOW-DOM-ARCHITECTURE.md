# Shadow DOM Architecture

## Overview

emroute uses a **unified Shadow DOM architecture** with Web Components that work
seamlessly across SSR and SPA contexts. The key insight: `shadowRoot.innerHTML`
is just a string property to SSR, enabling the same code to work everywhere.

## Core Principles

1. **ComponentElement always uses Shadow DOM** (real or mock)
2. **WidgetComponent stays DOM-agnostic** (returns HTML strings)
3. **SSR formats output based on SpaMode** (none/root/leaf/only)
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
whether it's a real ShadowRoot or mock - both are just strings.

### 2. HTMLElementBase

```typescript
// Browser: real HTMLElement
// Server: SsrHTMLElement mock (not empty class)
export const HTMLElementBase = globalThis.HTMLElement ??
  (SsrHTMLElement as unknown as typeof HTMLElement);
```

### 3. ComponentElement (Web Component Wrapper)

**Always uses Shadow DOM** - no flags, no conditionals:

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

ComponentElement is **thin** - just assigns widget output to shadowRoot.

### 4. WidgetComponent (Developer API)

Stays **DOM-agnostic** - returns strings:

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
  } // For /md/ mode
}
```

No knowledge of Shadow DOM - just returns HTML/Markdown strings.

## SpaMode: The Four Rendering Strategies

### `none` - Progressive Enhancement (Light DOM)

**Server:**

```typescript
const element = new ComponentElement(widget);
await element.connectedCallback();

// Extract shadow content as Light DOM
output = `<widget-price>${element.shadowRoot.innerHTML}</widget-price>`;
```

**Client:**

- Hydrates existing Light DOM (moves into shadowRoot)
- Works **without JavaScript** (forms submit, links reload)
- Same visual experience as other modes

### `root` - Shell + Islands (Shadow DOM)

**Server:**

```typescript
// Output empty tags only
output = `<widget-price coin="BTC"></widget-price>`;
```

**Client:**

- ComponentElement renders into Shadow DOM
- SPA router active
- Enhanced interactivity

### `leaf` - Hybrid SSR + SPA (Shadow DOM)

**Server:**

- Renders full page content
- Widgets output as empty tags

**Client:**

- Can switch between real SSR URLs (`/html/about`) and virtual (`/about`)
- Widgets in Shadow DOM

### `only` - Full SPA/PWA (Shadow DOM)

**Server:**

- Cached `index.html` shell only
- No SSR rendering

**Client:**

- Everything virtual
- Full PWA mode

## The Spectrum

```
none          root          leaf          only
│             │             │             │
SSR Everything → SSR Shell → SSR Pages → SSR Nothing
Light DOM     → Shadow DOM  → Shadow DOM → Shadow DOM
Hydration     → Islands     → Hybrid     → Full Client
Works no JS   → Requires JS → Requires JS → Requires JS
```

## Benefits

### ✅ Less Moving Parts

- One ComponentElement implementation
- No conditionals based on mode
- Mode handled at SSR output layer only

### ✅ Full Spec Compliance

- Real Web Components with Shadow DOM
- Standard `shadowRoot` property
- Browser DevTools work correctly

### ✅ Exact Same Behavior

- SSR mock matches browser API exactly
- No divergence between environments
- Same rendering code everywhere

### ✅ Less Code

- No separate Light DOM path
- No useShadow flags
- Simpler, more maintainable

### ✅ Progressive Enhancement

- `mode=none` works without JavaScript
- Same visual experience across all modes
- Graceful degradation built-in

## SSR Output Strategy

```typescript
// ComponentElement always renders to shadowRoot
const element = new ComponentElement(widget);
await element.connectedCallback();

// SSR decides output format based on mode
if (mode === "none") {
  // Extract shadow content as Light DOM
  html = `<widget-price>${element.shadowRoot.innerHTML}</widget-price>`;
} else {
  // mode=root/leaf/only: Empty tag for client rendering
  html = `<widget-price coin="BTC"></widget-price>`;
}
```

**Key insight:** ComponentElement doesn't know about modes - SSR output
formatting knows.

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
      └─→ SSR formats based on mode:
          mode=none: output as Light DOM
          mode=root/leaf/only: empty tag
```

## Migration Impact

### No Breaking Changes

- Component/WidgetComponent API unchanged
- Developers write same code
- All 811 unit tests pass

### Behavioral Improvements

- True Shadow DOM in browser (better encapsulation)
- Progressive enhancement support (mode=none)
- Cleaner, more maintainable codebase
- Full Web Components spec compliance
