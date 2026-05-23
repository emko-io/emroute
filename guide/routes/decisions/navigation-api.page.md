# ADR-0014 · Navigation API Replaces History

**Status**: Accepted

Use the Navigation API exclusively for SPA navigation. The History API
fallback was removed — unsupported browsers fall back to full server
rendering (which already works).

## Why

The Navigation API gives one `navigate` event for every kind of
navigation: clicks, form GETs, programmatic `navigate()`, back/forward.
History API needed ~50 lines of click interception (composedPath
traversal for shadow DOM, modifier-key checks, target='_blank' bailout,
`popstate` plumbing) plus form submission handling on top.

Real-world Navigation API support is ~96% (mostly Chromium and Safari).
The remaining ~4% don't crash — they just do a real page navigation,
which is what they'd do without JavaScript anyway. Trading a small
fallback for ~10× less code was an obvious win.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0014-navigation-api.md)
