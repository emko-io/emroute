Components render into light DOM (innerHTML), breaking self-contained model

---

Resolved: Shadow DOM rejected. See ADR-0011.

SSR renders widgets by replacing their tags with rendered output (calling
getData() + renderHTML() server-side). Content lives in light DOM — there is
no shadow root to attach to. This is by design: emroute is markdown-first,
content-first. Global styles (typography, theming, resets) should cascade into
components. Custom element tag names provide natural CSS scoping without
browser-enforced isolation.
