# ~~SSR Markdown renderer should use RFC 7763 Content-Type~~ — RESOLVED

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

`server/dev.server.ts` — response content-type header.

**Resolution:** Changed Content-Type to
`text/markdown; charset=utf-8; variant=CommonMark` in `server/dev.server.ts`.
Fixed in v1.0.0-beta.6.
