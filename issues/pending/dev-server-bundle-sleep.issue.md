# Dev server: hardcoded sleep for initial bundle

`server/dev.server.ts` — `BUNDLE_WARMUP_DELAY`

The dev server waits a fixed 2 seconds for the initial bundle to complete:

```ts
await new Promise((resolve) => setTimeout(resolve, BUNDLE_WARMUP_DELAY));
```

On fast machines the sleep is wasted, on slow or cold-cache machines the bundle
may not be ready. A watch-based approach (poll for the output file to exist)
would be more reliable.

**Source:** `1.0.0-beta.6.issues.md` #6
