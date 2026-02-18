# Bare path redirect causes extra 302 in `only` mode

## Problem

In `server/dev.server.ts`, bare paths (not under `/html/` or `/md/`) redirect to
`${htmlBase}/${bare}`. In `only` mode, the SSR HTML handler is skipped, so this
redirect hits the SPA shell fallback on the second request.

The user hits `/about` → gets 302 to `/html/about` → which falls through to the
SPA shell. This is one unnecessary round-trip. The old code served the SPA shell
directly for bare paths in `root`/`only` modes.

## Severity

Low — only affects dev server, one redirect per navigation, and the dev server
will be rewritten soon.

## Resolution

**Resolved.** In `root`/`only` mode, bare paths now serve the SPA shell directly
(200) instead of redirecting to `/html/*` (302). The SPA router handles
client-side navigation — the redirect was an unnecessary round-trip. `none`/`leaf`
modes still redirect to `/html/*` for SSR.
