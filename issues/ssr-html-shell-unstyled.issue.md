SSR HTML shell doesn't include app stylesheets

generateHtmlShell() in dev.server.ts creates its own <!DOCTYPE html> with just
a <title> and <script> tag. It doesn't reference the app's index.html or its
CSS links. SSR HTML output at /html/* is always unstyled.

The SPA shell (index.html) may have <link rel="stylesheet"> tags, meta tags,
fonts, etc. None of that carries over to SSR HTML responses.

Possible approaches:

- Parse the app's index.html and extract <head> content (stylesheets, meta,
  fonts) to include in the SSR HTML shell
- Let the dev server config accept a custom shell template
- **[Selected]** Reuse index.html as the SSR shell, replacing <router-slot>
  content (same file serves both SPA and SSR HTML, just with different slot
  content). The SPA JS still loads for island hydration — this is already the
  case with the current shell. The server already reads index.html for the SPA
  fallback, so SSR HTML would do the same, just with pre-rendered content in
  the slot.

Related: console error "[Router] Slot not found: router-slot" — the SSR HTML
page loads main.js which calls createSpaHtmlRouter, which looks for
<router-slot> in the DOM. The current generateHtmlShell dumps content inline
without a <router-slot> wrapper. Reusing index.html with content injected
inside <router-slot> would fix this too — the slot element exists, the SPA
router finds it, and hydration works.

---

Resolved: replaced generateHtmlShell() with buildSsrHtmlShell() in
dev.server.ts. SSR HTML now reads and reuses the app's index.html, injecting
content into <router-slot>. Falls back to a bare shell if index.html is missing
or has no <router-slot>.
