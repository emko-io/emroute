# ADR-0009 · No Inline Script Activation

**Status**: Accepted

`<script>` tags injected via `innerHTML` or `setHTMLUnsafe` are not
auto-activated. Per HTML spec they don't execute, and emroute does not
work around that with clone-and-reinsert.

Use widgets or custom elements for client-side behavior.

## Why

The clone-and-reinsert workaround adds complexity, breaks `defer`/`async`
semantics, and creates a security surface (CSP, untrusted content). It's
the kind of "helpful magic" that's only helpful until it isn't.

Widgets and custom elements already give you a clean activation point:
`connectedCallback` runs whenever the element enters the DOM, regardless
of how it got there. That's the right tool for the job.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0009-no-inline-script-activation.md)
