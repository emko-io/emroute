# Hydration Test Investigation — Findings & Fix

## Executive Summary

**Result:** ✅ Hydration IS working correctly. The tests were using a flawed approach to detect re-rendering.

## The Problem

Original tests used a **module-scoped counter** to track getData calls:

```typescript
let getDataCallCount = 0;  // Module scope - persists across SSR requests!

override getData() {
  getDataCallCount++;
  return Promise.resolve({ callCount: getDataCallCount, ... });
}
```

**Why this failed:**

1. Counter persists across ALL SSR requests (not just one page load)
2. Test expected `getData called: 1` but got 2, 3, 4, etc.
3. Each SSR request (curl, browser navigation, test run) increments the counter
4. Impossible to distinguish between SSR calling getData vs SPA calling getData

## The Solution

Use a **browser-scoped counter** that only tracks client-side getData calls:

```typescript
declare global {
  interface Window {
    __hydration_test_calls?: number;
  }
}

override getData() {
  // Only increment in browser context (not during SSR)
  if (typeof window !== 'undefined') {
    window.__hydration_test_calls = (window.__hydration_test_calls || 0) + 1;
  }

  const ssrRendered = typeof window === 'undefined';
  return Promise.resolve({ ssrRendered, renderTime: Date.now() });
}
```

**How this works:**

1. SSR: `window` is undefined → counter stays undefined
2. SPA hydration with adoption: getData NOT called in browser → counter stays 0
3. SPA navigation: getData called in browser → counter becomes 1

## Test Results

### ✅ Core Hydration Tests (PASSING)

```
✅ SSR HTML response contains hydration markers
✅ SSR HTML includes document title
✅ SPA adopts SSR content without re-rendering
   - Browser counter = 0 (getData NOT called client-side)
   - Content marked as SSR-rendered (data-ssr="true")
   - Render context shows "SSR rendered"
✅ data-ssr-route attribute is removed after adoption
✅ router-slot element is preserved during hydration
✅ document title matches SSR title
```

### Proof That Hydration Works

**On fresh SSR load:**

```javascript
// Browser counter = 0
// Content shows: "SSR rendered"
// data-ssr="true"
```

**After SPA navigation (client-side routing):**

```javascript
// Browser counter = 1
// Content shows: "SPA rendered"
// data-ssr="false"
```

This definitively proves:

1. SSR content is adopted WITHOUT calling getData in browser
2. Subsequent SPA navigation DOES call getData
3. The SPA router correctly distinguishes between adoption and navigation

## Conclusion

The original hydration bug report was a **false positive** caused by a flawed test design. The actual SSR-to-SPA hydration logic is working correctly:

- ✅ SSR content is adopted without re-rendering
- ✅ data-ssr-route attribute lifecycle works correctly
- ✅ Router distinguishes between fresh load and navigation
- ✅ getData is only called when necessary (SPA navigation, not adoption)

The fix: Replace module-scoped counters with browser-scoped counters that accurately track client-side rendering behavior.
