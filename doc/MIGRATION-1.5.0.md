# Migration Guide: 1.4.x → 1.5.0

This guide helps you migrate from emroute 1.4.x to 1.5.0, which introduces a unified Shadow DOM architecture.

## Summary of Changes

1. **Shadow DOM everywhere** — widgets now render inside Shadow DOM
2. **Query pattern change** — use `shadowRoot?.querySelector()` instead of `querySelector()`
3. **Built-in widgets opt-in** — explicitly register `PageTitleWidget` and `BreadcrumbWidget`
4. **Container type removed** — fixes layout bugs in flex/grid containers

## Breaking Changes

### 1. Widget Content Queries (Most Common)

**Impact:** Widgets that query their own rendered content

**Before (1.4.x):**
```typescript
class MyWidget extends WidgetComponent {
  override hydrate(): void {
    // Query Light DOM
    const container = this.element.querySelector('[data-island]');
    const button = this.element.querySelector('button');
  }
}
```

**After (1.5.0):**
```typescript
class MyWidget extends WidgetComponent {
  override hydrate(): void {
    // Query Shadow DOM
    const container = this.element.shadowRoot?.querySelector('[data-island]');
    const button = this.element.shadowRoot?.querySelector('button');
  }
}
```

**How to find:**
```bash
# Search your codebase for patterns that need updating
grep -r "this\.element\.querySelector" --include="*.widget.ts"
```

**Quick fix:**
- Replace `this.element.querySelector(` with `this.element.shadowRoot?.querySelector(`
- Replace `this.element.querySelectorAll(` with `this.element.shadowRoot?.querySelectorAll(`

### 2. Built-in Widgets (If Used)

**Impact:** Projects using `PageTitleWidget` or `BreadcrumbWidget`

**Before (1.4.x):**
```typescript
// Built-in widgets auto-registered
import { createSpaHtmlRouter } from '@emkodev/emroute/spa';
const router = await createSpaHtmlRouter(manifest);
```

**After (1.5.0):**
```typescript
// Explicitly register built-in widgets
import {
  createSpaHtmlRouter,
  PageTitleWidget,
  BreadcrumbWidget,
  ComponentElement
} from '@emkodev/emroute/spa';

// Register only what you need
ComponentElement.register(new PageTitleWidget());
ComponentElement.register(new BreadcrumbWidget());

const router = await createSpaHtmlRouter(manifest);
```

**When to update:**
- Check if you have `<widget-page-title>` or `<widget-breadcrumb>` in your routes
- If yes, add explicit registration
- If no, no action needed (saves ~5KB in bundle)

### 3. Direct innerHTML Access (Rare)

**Impact:** Code that directly accesses widget's `innerHTML` property

**Before (1.4.x):**
```typescript
const widget = document.querySelector('widget-foo');
console.log(widget.innerHTML); // Widget's rendered content
```

**After (1.5.0):**
```typescript
const widget = document.querySelector('widget-foo');
console.log(widget.shadowRoot?.innerHTML); // Content in Shadow DOM
console.log(widget.innerHTML); // Now empty (Light DOM)
```

## Non-Breaking Improvements

### Fixed: Container Type Layout Bug

Widgets now render correctly in flex and grid layouts. If you added CSS workarounds for collapsed widgets, you can remove them:

```css
/* Before: Workaround for collapsed widgets */
widget-stat-card {
  min-width: 200px; /* No longer needed */
  display: block;   /* No longer needed */
}

/* After: Works without workarounds */
/* No custom CSS needed */
```

## Benefits of 1.5.0

### ✅ Web Components Spec Compliance
- Uses standard `shadowRoot` property
- Works with browser DevTools
- True CSS encapsulation

### ✅ Consistent Architecture
- Same code path for SSR and SPA
- No Light DOM vs Shadow DOM conditionals
- Simpler, more maintainable

### ✅ Better Performance
- Smaller default bundle (~5KB saved with opt-in widgets)
- Browser-native Shadow DOM (no polyfills)

### ✅ Progressive Enhancement
- SSR mode extracts Shadow content as Light DOM
- Works without JavaScript in `mode=none`

## Testing Your Migration

### 1. Update Widget Queries

Search and update all widget query patterns:

```bash
# Find widgets that might need updates
grep -rn "this\.element\.querySelector" src/widgets/

# Update each match to use shadowRoot
```

### 2. Test Interactive Widgets

Run your test suite focusing on:
- Widget hydration
- Event handlers
- DOM manipulation in widgets

```bash
deno task test:browser
```

### 3. Visual Regression Test

Check that your UI renders correctly:
1. Start dev server: `deno task dev`
2. Navigate to pages with widgets
3. Verify widgets display and function correctly

### 4. Check Built-in Widgets

If you see errors about missing widgets:
```
Error: <widget-page-title> is not defined
```

Add explicit registration as shown in section 2 above.

## Rollback Strategy

If you encounter issues:

1. **Temporary fix:** Pin to 1.4.5 in `deno.json`
   ```json
   {
     "imports": {
       "@emkodev/emroute": "jsr:@emkodev/emroute@1.4.5"
     }
   }
   ```

2. **Report the issue:** https://github.com/anthropics/claude-code/issues

## Need Help?

- **Architecture details:** Read `SHADOW-DOM-ARCHITECTURE.md`
- **API reference:** Check updated JSDoc comments in source
- **Questions:** Open an issue on GitHub

## Example Migration

Here's a complete before/after for a typical interactive widget:

### Before (1.4.x)
```typescript
class CounterWidget extends WidgetComponent<{ start?: string }, { count: number }> {
  override async getData({ params }) {
    return { count: parseInt(params.start ?? '0', 10) };
  }

  override renderHTML({ data }) {
    if (!data) return '';
    return `
      <div class="counter">
        <button class="decrement">-</button>
        <span class="count">${data.count}</span>
        <button class="increment">+</button>
      </div>
    `;
  }

  override hydrate(): void {
    const decrementBtn = this.element.querySelector('.decrement');
    const incrementBtn = this.element.querySelector('.increment');
    const countSpan = this.element.querySelector('.count');

    let count = parseInt(countSpan?.textContent ?? '0', 10);

    decrementBtn?.addEventListener('click', () => {
      count--;
      if (countSpan) countSpan.textContent = String(count);
    });

    incrementBtn?.addEventListener('click', () => {
      count++;
      if (countSpan) countSpan.textContent = String(count);
    });
  }
}
```

### After (1.5.0)
```typescript
class CounterWidget extends WidgetComponent<{ start?: string }, { count: number }> {
  override async getData({ params }) {
    return { count: parseInt(params.start ?? '0', 10) };
  }

  override renderHTML({ data }) {
    if (!data) return '';
    return `
      <div class="counter">
        <button class="decrement">-</button>
        <span class="count">${data.count}</span>
        <button class="increment">+</button>
      </div>
    `;
  }

  override hydrate(): void {
    // ✅ Changed: Query shadowRoot instead of element
    const decrementBtn = this.element.shadowRoot?.querySelector('.decrement');
    const incrementBtn = this.element.shadowRoot?.querySelector('.increment');
    const countSpan = this.element.shadowRoot?.querySelector('.count');

    let count = parseInt(countSpan?.textContent ?? '0', 10);

    decrementBtn?.addEventListener('click', () => {
      count--;
      if (countSpan) countSpan.textContent = String(count);
    });

    incrementBtn?.addEventListener('click', () => {
      count++;
      if (countSpan) countSpan.textContent = String(count);
    });
  }
}
```

**Only change:** `.querySelector()` → `.shadowRoot?.querySelector()`

That's it! The migration is straightforward for most projects.
