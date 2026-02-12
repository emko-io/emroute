# Markdown path derivation wastes a round-trip

`src/element/markdown.element.ts` — `deriveMarkdownPath`

For `/about`, returns `/routes/about.page.md`. If the real file is
`routes/about/index.page.md`, the first fetch 404s before `getAlternativePath`
is tried. Works correctly but wastes a network round-trip per mismatched path.

The route manifest already knows the correct file path (`route.files.md`), and
`buildComponentContext` fetches it into `context.files.md`. For pure `.page.md`
routes (no `.page.ts`), the `<mark-down>` element independently re-fetches the
same file. Passing the already-loaded content would eliminate both the guessing
and the duplicate fetch.

**Source:** `initial-setup.issue.md` #4
