# SSR hydration only at top-level slot

The `data-ssr-route` attribute is only set on the top-level `<router-slot>`.
Nested router-slots in parent layouts don't carry this hint, so child content
in a nested layout will be re-rendered by the SPA even when SSR already
rendered it.

**Source:** `initial-setup.issue.md` #4
