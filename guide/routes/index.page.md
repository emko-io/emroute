# emroute guide

A file-based, storage-agnostic TypeScript router with triple rendering — SPA, SSR HTML, and SSR Markdown — and zero external dependencies.

## What you're looking at

This page is a `.page.md` file. emroute renders it three ways:

- **`/`** — served as HTML for browsers
- **`/md/`** — served as plain Markdown for LLMs, CLI tools, and scripts
- **`/app/`** — served as a SPA shell when JavaScript is enabled

The filesystem IS the router. The Markdown IS the content. No build step. No config file.

## Try it

```sh
curl localhost:8000/
curl localhost:8000/md/
```

The HTML response wraps this content in the default shell. The Markdown response returns the raw text you're reading right now.
