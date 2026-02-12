# Status page content injected without stripping document-level tags

When a `.page.html` file (status page or regular route) contains full document
structure (`<!DOCTYPE>`, `<html>`, `<body>`), the SSR HTML renderer returns it
as-is. The dev server's `buildSsrHtmlShell()` injects it into `<router-slot>`,
producing invalid nested HTML.

## Reproduction

Create `routes/404.page.html` with full document structure:

```html
<!DOCTYPE html>
<html>
  <head><title>Not Found</title></head>
  <body><h1>404</h1></body>
</html>
```

Visit `/html/nonexistent`. The response contains:

```html
<router-slot>
  <!DOCTYPE html>
  <html>
    <head><title>Not Found</title></head>
    <body><h1>404</h1></body>
  </html>
</router-slot>
```

## Root cause

- `buildComponentContext` in `src/route/route.core.ts` (line ~261) loads
  `.page.html` content as raw text and stores it in `context.files.html`
- `PageComponent.renderHTML()` in `src/component/page.component.ts` (line ~63)
  returns `files.html` content as-is
- `buildSsrHtmlShell()` in `server/dev.server.ts` (line ~133) injects content
  into `<router-slot>` without sanitization
- Affects all `.page.html` files, not just status pages

## Resolution — content issue, as designed

This is not a code defect. `.page.html` companion files are fragments by
convention: the app's `index.html` provides the document envelope
(`<!DOCTYPE>`, `<html>`, `<head>`, `<body>`), and `.page.html` files supply
inner content for `<router-slot>`. Writing a full document inside a
`.page.html` violates that contract.

The renderer behaves correctly — it treats companion files as fragments and
injects them into the slot. The SPA path (`innerHTML`) happens to be forgiving
because the browser's parser silently strips document-level tags in fragment
context, but the SSR path is pure string concatenation and preserves the
invalid structure verbatim. Neither path is wrong; the input is.

No code change needed. A dev-time warning when `<!DOCTYPE` or `<html` is
detected in a loaded `.page.html` could be a quality-of-life improvement but
is not required.
