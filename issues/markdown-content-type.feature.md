# SSR Markdown renderer should use RFC 7763 Content-Type

## Current behavior

The SSR Markdown renderer returns responses with:

```
Content-Type: text/plain; charset=utf-8
```

## Expected behavior

Markdown responses should use the standardized media type from RFC 7763:

```
Content-Type: text/markdown; charset=utf-8; variant=CommonMark
```

This correctly identifies the content as markdown rather than plain text,
and the `variant` parameter communicates which markdown dialect is in use.

## Location

`src/renderer/ssr/md.renderer.ts` — response content-type header.
