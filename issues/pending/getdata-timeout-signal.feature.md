# getData Timeout Signal

## Problem

Every component that wants a fetch timeout in `getData` must manually combine
signals:

```typescript
async getData({ signal }) {
  const combined = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  const res = await fetch('/api/data', { signal: combined });
  return res.json();
}
```

This is boilerplate that the framework should handle.

## Proposal

The framework combines the navigation signal with a configurable timeout
_before_ passing it to `getData`. Components just use `signal` as-is.

```typescript
const data = await component.getData({ params, signal: dataSignal, context });
```

### Timeout source

- **Global default** on `SpaHtmlRouterOptions` / `DevServerConfig`
- **Per-route override** via page component export or route config

### Browser APIs

- `AbortSignal.any()` — Baseline March 2024
- `AbortSignal.timeout()` — Baseline March 2023

Both available in all modern browsers and Deno.
