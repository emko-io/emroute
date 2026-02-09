renderComponent is async but renderHTML/renderMarkdown are synchronous

renderComponent() calls getData() (async) then renderHTML/renderMarkdown
(sync), so it returns Promise<string>. But renderHTML() and renderMarkdown()
return string — you can't compose components inside render methods without
workarounds.

Current workarounds:

- Slot-based composition via <router-slot> and <widget-name> tags (works for
  nested routes and widgets, not for ad-hoc embedding)
- Pre-fetch child data in parent's getData() (couples parent to children)

Possible approaches:

- Make render methods async (breaking change, but aligns with reality)
- Render tokens / placeholders resolved in a post-render async pass
- Keep current model, document the limitation

---

Resolved: not a problem. getData() handles async data fetching, renderHTML()
is sync templating, and composition is via custom elements (widgets handle
their own async lifecycle independently). Parent components that need child
data should fetch it in getData(). No changes needed.
