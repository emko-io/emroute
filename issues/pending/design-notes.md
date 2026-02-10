# Design Notes (non-blocking)

Minor items noted during code review. Not bugs, not blockers — just things
to be aware of.

## Markdown path derivation wastes a round-trip

`src/element/markdown.element.ts` — `deriveMarkdownPath`

For `/about`, returns `/routes/about.page.md`. If the real file is
`routes/about/index.page.md`, the first fetch 404s before `getAlternativePath`
is tried. Works correctly but wastes a network round-trip per mismatched path.

## SSR hydration only at top-level slot

The `data-ssr-route` attribute is only set on the top-level `<router-slot>`.
Nested router-slots in parent layouts don't carry this hint, so child content
in a nested layout will be re-rendered by the SPA even when SSR already
rendered it.

## `[^]*?` regex is V8-specific

`src/util/widget-resolve.util.ts` — `resolveWidgetTags` pattern

`[^]*?` (match any character including newlines) is a V8/Deno extension, not
standard ECMAScript. Portable equivalent: `[\s\S]*?`. Not a problem while the
project targets Deno exclusively, but a portability concern if the package is
ever consumed in non-V8 environments.

## CLI not exported as public entry point

`server/cli.deno.ts` provides a zero-config dev server start, but it's not
exported from `deno.json` or documented in the guide. Consumers don't know
whether to write their own `dev.ts` or use the built-in CLI.

**Source:** `initial-setup.issue.md` #4
