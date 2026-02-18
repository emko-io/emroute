# statusPages prefixing lacks pattern === '/' guard

## Problem

In `src/route/route.core.ts`, `prefixManifest()` has a special case for routes
and error boundaries where `pattern === '/'` maps to just `basePath` (avoiding a
trailing slash):

```typescript
routes: manifest.routes.map((r) => ({
  ...r,
  pattern: r.pattern === '/' ? basePath : basePath + r.pattern,
})),
```

The `statusPages` branch does not have this guard:

```typescript
statusPages: manifest.statusPages?.map((s) => ({
  ...s,
  pattern: basePath + s.pattern,
})),
```

If a status page ever has pattern `/`, it would become `/html/` (with trailing
slash) instead of `/html`.

## Severity

Low — status pages are typically `404` and `500`, not bound to `/`. But it's an
inconsistency.

## Fix

Add the same guard:

```typescript
pattern: s.pattern === '/' ? basePath : basePath + s.pattern,
```

## Resolution — Won't fix

Status page patterns are always `/${statusCode}` (e.g. `/404`, `/500`), hardcoded
in `tool/route.generator.ts:196`. The generator derives them from filenames like
`404.page.html` — never from directory structure. The pattern can never be `'/'`,
so the guard protects against an impossible case.
