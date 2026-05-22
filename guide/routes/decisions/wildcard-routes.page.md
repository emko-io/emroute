# ADR-0002 · Wildcards via Directory Index

**Status**: Accepted

A flat file is exact-match. A directory index is a catch-all.

```
routes/
  crypto.page.ts        → matches /crypto only
  crypto/index.page.ts  → matches /crypto and /crypto/* (catch-all)
```

Inside the directory index, `params.rest` holds the unmatched tail.

## Why

Wildcards in other frameworks are special syntax: `[...rest]`, `*`, or a
config flag. emroute already had two distinct file layouts — flat and
directory-indexed — with no semantic difference. Promoting that into the
routing model gave wildcards for free, with no new syntax to learn.

Specific routes still beat the catch-all. `/crypto/eth` matches a
sibling `eth.page.ts` before falling through to `index.page.ts` with
`params.rest = "eth"`.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0002-wildcard-routes-via-directory-index.md)
