# SSR Adoption with Hydration - Implementation Guide

## Summary

emroute now supports **true hydration** - combining SSR adoption's performance (reusing DOM) with interactivity (attaching event listeners). This is achieved through two complementary mechanisms:

1. **`hydrate()` hook** - Called after SSR adoption to attach listeners to existing DOM
2. **`queueMicrotask()` in `renderHTML()`** - Called during SPA navigation for fresh renders

This gives us the **best of both worlds**: fast SSR adoption with full interactivity.

## How SSR Adoption Works

### The data-ssr Attribute

When a widget is rendered server-side, it outputs:

```html
<widget-counter-htm data-ssr="{&quot;initial&quot;:0}">
  <!-- pre-rendered content from renderHTML() -->
</widget-counter-htm>
```

### Browser Lifecycle

When the widget element is added to the DOM, `ComponentElement.connectedCallback()` runs:

```typescript
// src/element/component.element.ts:164-176
const ssrAttr = this.getAttribute(DATA_SSR_ATTR);
if (ssrAttr) {
  try {
    this.data = JSON.parse(ssrAttr);
    this.state = 'ready';
    this.removeAttribute(DATA_SSR_ATTR);
    this.signalReady();
    return; // ← EARLY RETURN - skips loadData(), skips renderHTML()
  } catch {
    // SSR data invalid - fall through to fetch
  }
}
```

**Key insight:** The presence of `data-ssr` triggers an early return that skips:

- `getData()` (data comes from the attribute instead)
- `renderHTML()` (DOM already exists from SSR)
- Any code inside `renderHTML()` including `queueMicrotask()`

## Why Event Listeners Don't Attach

### The Problem

```typescript
override renderHTML({ data }: this['RenderArgs']) {
  // This queueMicrotask NEVER RUNS during SSR adoption!
  queueMicrotask(() => {
    const button = this.element.querySelector('button');
    button.addEventListener('click', () => { ... });
  });

  return `<button>Click me</button>`;
}
```

During SSR adoption:

1. Widget has `data-ssr` attribute → early return
2. `renderHTML()` never called
3. `queueMicrotask()` never queued
4. Event listeners never attached
5. Button is inert

### Guard Against Server-Side Execution

Even if we wanted to run the microtask, we need to guard it:

```typescript
if (typeof document !== 'undefined') {
  queueMicrotask(() => {
    // This prevents "document is not defined" crashes during SSR
  });
}
```

Without this guard, the server crashes when importing the widget module.

## The Solution: hydrate() Hook

### Recommended Approach (Simple & Clean)

```typescript
class InteractiveWidget extends WidgetComponent<ParamsType, DataType> {
  private clickCount = 0;

  // Called after ALL renders (both SSR adoption and SPA navigation)
  override hydrate(): void {
    const button = this.element?.querySelector<HTMLElement>('#my-button');
    const display = this.element?.querySelector<HTMLElement>('#display');

    if (button && display) {
      button.addEventListener('click', () => {
        this.clickCount++;
        display.textContent = String(this.clickCount);
      });
    }
  }

  override renderHTML({ data }: this['RenderArgs']) {
    if (!data) return '<p>Loading...</p>';

    // Just return HTML - hydrate() will attach listeners automatically
    return `<div>
      <button id="my-button">Click me</button>
      <span id="display">0</span>
    </div>`;
  }
}
```

**How it works:**

- **SSR adoption** (`/html/*`) → Has `data-ssr` → Adopts content → `hydrate()` called → listeners attached ✅
- **SPA navigation** (`/*`) → No `data-ssr` → `renderHTML()` called → `hydrate()` called → listeners attached ✅

**Pros:**

- ✅ Single place for all event listener attachment
- ✅ Works in both SSR and SPA modes
- ✅ Clean separation: `renderHTML()` = markup, `hydrate()` = interactivity
- ✅ No need for `typeof document` guards
- ✅ No need for queueMicrotask in components

### Implementation Details

The framework automatically calls `hydrate()` after rendering:

**During SSR adoption:**

```typescript
// src/element/component.element.ts:164-179
if (ssrAttr) {
  this.data = JSON.parse(ssrAttr);
  this.state = 'ready';
  this.removeAttribute(DATA_SSR_ATTR);

  queueMicrotask(() => {
    this.component.hydrate?.();
  });

  this.signalReady();
  return; // Skip getData() and renderHTML()
}
```

**During fresh rendering:**

```typescript
// src/element/component.element.ts:326-337
this.innerHTML = this.component.renderHTML({...});

// Call hydrate() after rendering to attach event listeners
if (this.state === 'ready') {
  queueMicrotask(() => {
    this.component.hydrate?.();
  });
}
```

This ensures `hydrate()` is always called after the DOM is ready, whether from SSR adoption or fresh rendering.

## Alternative Solutions for Interactive Widgets

### Option 1: Inline Event Handlers (Works with SSR Adoption)

```typescript
override renderHTML({ data }: this['RenderArgs']) {
  return `<input
    oninput="var q=this.value.toLowerCase();document.querySelectorAll(...)"
    placeholder="Search...">`;
}
```

**Pros:**

- ✅ Works with SSR adoption (handlers in HTML string)
- ✅ No JavaScript execution needed
- ✅ Simple and fast

**Cons:**

- ❌ Limited to simple handlers
- ❌ String-based, hard to maintain
- ❌ No access to component instance (`this`)

**Example:** `widget-search-filter`

### Option 2: SPA-Only Widgets (Skip SSR Adoption)

```typescript
override renderHTML({ data }: this['RenderArgs']) {
  if (typeof document !== 'undefined') {
    queueMicrotask(() => {
      // Render Preact/React/Vue component
      render(<Counter />, this.element);
    });
  }

  // Return minimal placeholder for SSR
  return `<div data-island="counter"></div>`;
}
```

**Pros:**

- ✅ Full JavaScript framework support
- ✅ Complex interactivity
- ✅ Component lifecycle hooks

**Cons:**

- ❌ Doesn't work with SSR adoption (requires SPA navigation)
- ❌ Slower initial render (needs to download & execute framework)
- ❌ No SEO benefit from SSR content

**Example:** `widget-counter-htm` (Preact)

### Option 3: Hybrid Approach

Combine SSR content with client-side enhancement:

```typescript
override renderHTML({ data }: this['RenderArgs']) {
  // Server: render static content
  const content = `<div id="counter-${data.id}">
    <button disabled>Count: ${data.count}</button>
  </div>`;

  // Client: enhance after adoption
  if (typeof document !== 'undefined') {
    queueMicrotask(() => {
      const btn = this.element.querySelector('button');
      btn.disabled = false;
      btn.addEventListener('click', () => { ... });
    });
  }

  return content;
}
```

**Pros:**

- ✅ SSR content visible immediately
- ✅ Progressive enhancement
- ✅ Works if JavaScript fails

**Cons:**

- ❌ Doesn't work with SSR adoption (queueMicrotask skipped)
- ❌ Requires SPA navigation to become interactive
- ❌ Complexity of managing two states

## Testing Modes

### SSR Mode (`/html/*`)

```
URL: http://localhost:4100/html/preact
Flow: SSR HTML → Browser loads → Widgets adopt SSR (skip renderHTML)
Result: Preact counter has NO buttons (queueMicrotask didn't run)
```

### SPA Mode (`/*`)

```
URL: http://localhost:4100/preact
Flow: SPA router → Calls renderHTML → queueMicrotask runs → Preact renders
Result: Preact counter has buttons and works ✅
```

## Recommendations

### For Static Content

Use plain widgets without interactivity - they work perfectly with SSR adoption.

### For Interactive Widgets (Recommended)

Use **`hydrate()` + `queueMicrotask()` pattern** - provides full interactivity in both SSR and SPA modes.

### For Simple Forms

Use **inline event handlers** if you prefer simplicity over full JavaScript support.

### For Complex UI Frameworks (React/Preact/Vue)

Use **SPA-only widgets** (skip SSR adoption) since these frameworks manage their own rendering lifecycle.

## Key Takeaways

1. **SSR adoption + hydration = best of both worlds** - fast SSR with full interactivity
2. **`hydrate()` hook** - single place to attach ALL event listeners (SSR + SPA)
3. **`renderHTML()`** - just return HTML markup, no event listeners needed
4. **data-ssr attribute** triggers SSR adoption; both paths call `hydrate()`
5. **No guards needed** - `hydrate()` only runs in browser, never server-side
6. **Clean separation** - markup in `renderHTML()`, interactivity in `hydrate()`
7. **Test both modes** - `/html/*` (SSR adoption) and `/*` (SPA navigation) both work identically ✅

## Related Files

- `src/element/component.element.ts:164-176` - SSR adoption logic
- `test/browser/fixtures/widgets/counter-htm/` - SPA-only widget example
- `test/browser/fixtures/widgets/search-filter/` - Inline handler example
- `test/browser/fixtures/widgets/hydration-test/` - Test fixture for hydration behavior
