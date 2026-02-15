# Shadow DOM Architecture

## Overview

emroute now uses a unified Shadow DOM architecture that works seamlessly across both SSR and SPA contexts.

## Key Components

### 1. SsrHTMLElement & SsrShadowRoot (Server-Side Mocks)

Located in `src/util/html.util.ts`, these classes provide a server-compatible DOM API:

```typescript
class SsrShadowRoot {
  innerHTML: string;  // Captures rendered content
  host: SsrHTMLElement;
  querySelector(selector: string): Element | null;
  // ... minimal DOM API
}

class SsrHTMLElement {
  innerHTML: string;
  shadowRoot: ShadowRoot | null;
  attachShadow(init: ShadowRootInit): ShadowRoot;
  getAttribute/setAttribute/removeAttribute/hasAttribute;
  // ... minimal DOM API
}
```

### 2. HTMLElementBase

```typescript
// Browser: real HTMLElement
// Server: SsrHTMLElement mock
export const HTMLElementBase = globalThis.HTMLElement ??
  (SsrHTMLElement as unknown as typeof HTMLElement);
```

### 3. ComponentElement (Unified)

Now **always uses Shadow DOM** (real or mock):

```typescript
class ComponentElement extends HTMLElementBase {
  private shadow: ShadowRoot;

  constructor(component, files) {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  render() {
    // Always render to shadow (real or mock)
    this.shadow.innerHTML = this.component.renderHTML(...);
  }
}
```

## Rendering Flow

### SSR (Server-Side)

1. Instantiate Component (plain class)
2. Call `component.getData()` → `component.renderHTML()`
3. Output `shadow.innerHTML` as Light DOM string
4. CSS is scoped with `@scope` for Light DOM isolation

```typescript
// SSR rendering
const component = new PriceWidget();
const data = await component.getData({ params });
const html = component.renderHTML({ data, params });
// html contains @scope-wrapped CSS for Light DOM
```

### SPA (Browser)

1. Register ComponentElement as custom element
2. Browser lifecycle: `connectedCallback()`
3. Render to **real Shadow DOM**
4. CSS is scoped by Shadow DOM (+ redundant `@scope`)

**SSR Adoption:**
- SSR renders to Light DOM (server output)
- Client finds Light DOM children
- Moves them into Shadow DOM: `this.shadow.append(...this.childNodes)`

```typescript
// SPA hydration
if (ssrAttr) {
  this.data = JSON.parse(ssrAttr);
  // Move SSR Light DOM into Shadow DOM
  this.shadow.append(...this.childNodes);
  this.component.hydrate?.();
}
```

## Benefits

### ✅ True Web Components in SPA
- Real Shadow DOM encapsulation
- Native CSS scoping
- Standard browser API compliance

### ✅ SSR Still Works
- Mock shadow on server
- Output as Light DOM strings
- `@scope` provides CSS isolation

### ✅ Unified Codebase
- Same ComponentElement class everywhere
- No environment checks in component code
- One rendering path for both contexts

### ✅ Seamless Hydration
- SSR renders Light DOM
- Client moves content into Shadow DOM
- No re-rendering needed (unless data is invalid)

## CSS Scoping

```typescript
// Widget renderHTML always uses @scope
const style = files?.css
  ? `<style>${scopeWidgetCss(files.css, this.name)}</style>\n`
  : '';
```

- **SSR**: `@scope` needed for Light DOM isolation
- **SPA**: `@scope` redundant (Shadow DOM already scopes) but harmless

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Component                            │
│                   (Plain Class - Universal)                  │
│  getData() → renderHTML() → renderMarkdown()                │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
            ┌───────▼──────┐    ┌──────▼────────┐
            │ SSR Context  │    │  SPA Context  │
            └──────────────┘    └───────────────┘
                    │                   │
         ┌──────────▼─────────┐  ┌─────▼─────────────┐
         │  SsrHTMLElement    │  │  HTMLElement      │
         │  + SsrShadowRoot   │  │  + ShadowRoot     │
         │  (Mock)            │  │  (Real)           │
         └────────────────────┘  └───────────────────┘
                    │                   │
                    │                   │
         ┌──────────▼─────────┐  ┌─────▼─────────────┐
         │ shadow.innerHTML   │  │  Shadow DOM       │
         │ → Light DOM string │  │  (Encapsulated)   │
         └────────────────────┘  └───────────────────┘
```

## Migration Impact

### Breaking Changes
- None for end users (Component API unchanged)
- ComponentElement now always uses Shadow DOM internally

### Behavioral Changes
- Widgets now render in Shadow DOM in browser
- Better style encapsulation
- Query selectors from page can't reach widget internals

### Compatibility
- All 811 unit tests pass
- SSR output unchanged (still Light DOM)
- SPA gets Shadow DOM benefits
