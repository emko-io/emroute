# Pluggable logger for silent catch blocks

**Status**: Implemented.

## Problem

Several catch blocks silently discarded errors for graceful degradation:

| Location                         | Behavior                          |
| -------------------------------- | --------------------------------- |
| `ssr/html.renderer.ts` (2 sites) | Fall through to inline fallback   |
| `ssr/md.renderer.ts` (2 sites)   | Fall through to inline fallback   |
| `widget-resolve.util.ts`         | Leave widget tag as-is on failure |

Consumers had no way to observe or log these failures.

## What was done

Minimal `Logger` interface in `src/type/logger.type.ts`:

```typescript
interface Logger {
  error(msg: string, error?: Error): void;
  warn(msg: string): void;
}
```

Module-level logger (no-op by default) — catch blocks call `logger.error()`
directly, same as `console`. No injection plumbing, no constructor options.

`setLogger(impl)` swaps in a real implementation at startup. Structurally
compatible with hardkore's `StructuredLogger` — no dependency needed.

### Files

- `src/type/logger.type.ts` — `Logger` interface, `logger`, `setLogger()`
- `src/renderer/ssr/html.renderer.ts` — 2 catch blocks now call `logger.error()`
- `src/renderer/ssr/md.renderer.ts` — 2 catch blocks now call `logger.error()`
- `src/util/widget-resolve.util.ts` — widget render failure now calls `logger.error()`
- `src/index.ts` — exports `Logger` type and `setLogger`

### Consumer usage

```typescript
import { setLogger } from '@emkodev/emroute';
setLogger(myLogger); // once at startup
```

**Source:** `clean-code.issue.md` CC-10
