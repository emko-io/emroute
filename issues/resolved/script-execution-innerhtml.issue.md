Script tags in renderHTML output not executed in SPA mode

innerHTML assignment doesn't execute <script> tags per the HTML spec. So if a
component's renderHTML() returns content with <script> tags, they are inserted
into the DOM but never run.

This affects SPA mode only — SSR HTML serves a full document where scripts
execute normally on page load.

Possible approaches:

- Post-process after innerHTML: find inserted <script> elements, clone them
  into new <script> elements via document.createElement, and append to trigger
  execution
- Document as a known limitation — components should use custom elements or
  event listeners instead of inline scripts
- Provide a utility that components can call to activate scripts in their
  rendered output

---

Resolved: rejected — widgets solve this without inline scripts. See
ADR-0009-no-inline-script-activation.md.
