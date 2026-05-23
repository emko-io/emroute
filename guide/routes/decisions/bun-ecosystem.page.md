# ADR-0017 · Move to Bun + npm

**Status**: Accepted

Publish to npm. Target Bun as primary runtime. Abandon JSR as
distribution channel.

## Why

JSR's design has six structural problems that compound when you're
shipping a framework rather than a library:

- Publish-time module graph freezing — incompatible with consumers
  importing their own modules dynamically.
- Specifier rewriting — breaks framework code that resolves paths via
  string manipulation.
- No peer dependencies — frameworks need shared singletons (the
  Runtime, the route trie) across consumer and framework code.
- No esbuild plugin integration — emroute uses esbuild for client
  bundling.
- Incompatible with dynamic imports of consumer code.
- TypeScript-only publish — emroute also ships compiled `.js` for
  browser consumption.

None of these are JSR bugs — they're design choices that work fine for
libraries but break for frameworks. Bun + npm has the ecosystem,
tooling, and flexibility this kind of project needs.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0017-move-to-bun-ecosystem.md)
