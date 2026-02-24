# Why emroute moved from Deno/JSR to the Bun ecosystem

emroute 1.5.x shipped on JSR. emroute 1.6.0+ publishes to npm and targets Bun
as the primary runtime. This document explains the technical reasons behind that
decision, backed by research across three sources: the official Deno
documentation (docs.deno.com), the official JSR documentation (jsr.io/docs), and
GitHub issues across the `denoland/deno`, `jsr-io/jsr`, and `jsr-io/jsr-npm`
repositories.

The problems are not cosmetic. They are structural incompatibilities between
what a cross-runtime framework with bundling, plugin architecture, and ecosystem
interop needs — and what Deno/JSR are designed to provide.

---

## The six problems

### 1. JSR rewrites dynamic imports and breaks consumer-side resolution

When you publish to JSR, the toolchain rewrites bare specifier imports to fully
qualified `jsr:` or `npm:` specifiers. The JSR publishing docs describe this as
a feature: "During publishing, `jsr publish` / `deno publish` will automatically
rewrite the specifiers in your source code to fully qualified specifiers that do
not require an import map / package.json anymore."

The problem: this rewriting also hits dynamic `import()` expressions. If a bare
specifier isn't in the package's dependency manifest — because it's
intentionally resolved from the **consumer's** `node_modules` at runtime — JSR
rewrites it to a relative path that doesn't resolve.

```ts
// Source: BunFsRuntime importing esbuild from the consumer's project
const esbuild = await import('esbuild');

// After JSR publish — broken
const esbuild = await import('./esbuild');
```

The docs don't mention dynamic imports at all. No escape hatch, no opt-out flag,
no annotation to mark a specifier as "resolve at runtime." The only workaround
was `createRequire(process.cwd() + '/')` to bypass JSR's static rewriting
entirely — a hack that doesn't appear anywhere in the official documentation.

Multiple developers have hit this wall. A GitHub discussion
([denoland/deno#26266](https://github.com/denoland/deno/discussions/26266))
documents the frustration: developers find that dynamic imports inside JSR
packages resolve against the JSR cache URL instead of the consumer's filesystem.
One commenter wrote: "This is such a bizarre limitation. I can understand
preventing the import of http or even other package manager modules, but for
local dynamic imports?"

A separate issue
([denoland/deno#25360](https://github.com/denoland/deno/issues/25360)) confirms
JSR blocks runtime dynamic imports to non-JSR modules entirely for "security
reasons," with plugin architectures specifically called out as broken.

The most promising proposal is import map merging
([denoland/deno#30689](https://github.com/denoland/deno/issues/30689), Sep
2025), which would eliminate the need for specifier rewriting at publish time by
shipping the package's import map and merging it with the consumer's at runtime.
This is a web standard already supported by browsers. Tagged `suggestion`, no
Deno team response.

**How Bun solves this:** Bun uses standard `node_modules` resolution. A dynamic
`import('esbuild')` resolves from the consumer's `node_modules` at runtime,
exactly as expected. No rewriting, no cache indirection, no workarounds. The
`BunFsRuntime` calls esbuild's JS API directly from the consumer's installed
copy.

### 2. `import.meta.resolve` returns unusable URLs from JSR cache

When a module is loaded from JSR's cache, `import.meta.resolve` on a bare
specifier returns a `runtime:` or `https://jsr.io/...` URL instead of a file
path. This makes it impossible to locate package entry points for bundling.

The term `runtime:` URL doesn't appear anywhere in docs.deno.com or jsr.io/docs.
The `import.meta.resolve` API documentation only shows resolution to `file:///`
URLs (for local files) and HTTPS URLs (for import-mapped specifiers). The
interaction with JSR's internal caching mechanism is completely undocumented.

In the GitHub discussion ([denoland/deno#26266](https://github.com/denoland/deno/discussions/26266)),
a developer asked directly: "if I understand correctly, when using
`import.meta.resolve` in a JSR package, it will import from the file system of
the package user and not from `https://jsr.io/whateverthismaybe`?" No official
answer was given.

Deno v2.3.7 (Jun 2025) fixed `import.meta.resolve` for `npm:` specifiers, but
the JSR equivalent remains broken. No dedicated issue has been filed for
`import.meta.resolve` + `jsr:` specifier resolution.

The workaround for emroute was writing a temp `.ts` file that re-exports the
bare specifier, bundling that file (since Deno resolves imports inside files
through the project's import map), then deleting the temp file after. This is
not a solution; it's a symptom of a broken resolution model.

**How Bun solves this:** `import.meta.resolve` in Bun returns a `file://` URL
pointing to the actual file in `node_modules`. The resolved path can be passed
directly to esbuild as a bundle entry point. No temp files, no indirection.

### 3. No peer dependencies — no shared singletons across packages

JSR has no concept of peer dependencies. The word "peer" doesn't appear in
jsr.io/docs. There's no `peerDependencies` field, no equivalent mechanism, no
acknowledgment of the limitation.

For the emroute ecosystem (emroute + emkoord + pathtor), this produced **three**
separate installations of emroute in a single project. The frontend app needed
its JSR dependencies resolved through `package.json` and
`nodeModulesDir: "manual"` so esbuild could bundle them (see issue #6) — this
installed emroute into `node_modules` via the npm bridge. The backend app
depended on emkoord, which depended on emroute as a native `jsr:` package —
a second, completely separate installation from JSR's cache. And emkoord itself
carried its own emroute dependency as yet another module identity. Three copies
of emroute, three separate registries, three separate routers, three separate
type identities. A route registered through emkoord was invisible to the
frontend's emroute router because they were literally different objects from
different module instances.

The JSR npm compatibility page hints at the symptom: "Due to limitations of npm
and yarn, they may sometimes install duplicate copies of your JSR dependencies.
This can lead to... unexpected behavior." But they frame it as an npm/yarn
limitation, not a JSR design gap.

On GitHub, the issue is well-documented but unresolved:

- [jsr-io/jsr#301](https://github.com/jsr-io/jsr/issues/301) — "Optional peer
  dependencies do not work" (Mar 2024, still open). JSR tries to resolve peer
  deps at build time and fails.
- [jsr-io/jsr#102](https://github.com/jsr-io/jsr/issues/102) — The maintainer's
  response to peer dep issues: "I suggest you either vendor the dependency into
  your package, or publish it to JSR yourself."
- [jsr-io/jsr Discussion #701](https://github.com/jsr-io/jsr/discussions/701) —
  The **ESLint team** asked how to use `@std/path` (JSR-only) from
  `@eslint/config-array` (published to npm) without forcing consumers to
  configure `.npmrc`. They tagged the JSR maintainer directly. No response.

JSR's architecture fundamentally requires resolving all dependencies at publish
time. This is incompatible with peer dependencies, which express: "this package
is compatible with version X of library Y, but the consumer provides it."

**How Bun solves this:** npm's `peerDependencies` field works exactly as
designed. emroute declares `peerDependencies` for shared packages, Bun/npm
deduplicates them in `node_modules`, and all packages share a single module
identity. The emroute + emkoord + pathtor ecosystem works because there's
literally one copy of emroute resolved at the top of `node_modules`.

### 4. The npm bridge adds friction that compounds across the ecosystem

Consuming JSR packages from Bun/Node requires the `npm:@jsr/` alias:

```json
"@emkodev/emroute": "npm:@jsr/emkodev__emroute@1.5.4-beta.6"
```

This breaks IDE autocomplete, adds debugging indirection, and is non-obvious to
consumers. The JSR docs acknowledge this and list limitations: transpiled
TypeScript (degraded "Go to definition"), slower installs, duplicate
installations with npm/yarn.

Since emroute's original problems doc, pnpm 10.9+ and Yarn 4.9+ added native
`jsr:` protocol support, eliminating the `@jsr/` scope for those package
managers. But npm itself still requires `.npmrc` configuration, Bun still
requires `npx jsr add`, and enterprise private registries (Google Artifact
Registry, JFrog Artifactory) can't proxy JSR due to non-standard tarball paths
([jsr-io/jsr#405](https://github.com/jsr-io/jsr/issues/405), 18 thumbs up,
still open).

For a framework like emroute that needs to work across Deno, Bun, and Node
consumers, the bridge adds a tax at every layer: the package author (must test
through the bridge), the direct consumer (must configure tooling), and transitive
consumers (inherit the bridge complexity without understanding it).

**How Bun solves this:** npm is npm. `npm install @emkodev/emroute` works
everywhere — npm, yarn, pnpm, Bun — with zero configuration, no `.npmrc`, no
bridge layer, no scope aliasing. Every IDE, every CI system, every private
registry already knows how to resolve npm packages.

### 5. `deno bundle` was experimental, broken, and unreliable for production

When emroute 1.5.x was developed (Feb 2026), `deno bundle` had been
reintroduced experimentally in Deno 2.4.0 (May 2025) after being removed in
Deno 2.0. It gained features rapidly through 2025: `--platform` and
`--sourcemap` in 2.3.7, `--watch` and `--code-splitting` in 2.5.0, plus a
programmatic `Deno.bundle()` API.

The feature set is now nominally comparable to what emroute needs. But it
remains experimental with active bugs:

- Watch mode appends to the output file instead of overwriting, doubling bundle
  size on each rebuild
  ([denoland/deno#30143](https://github.com/denoland/deno/issues/30143), Jul
  2025, still open).
- Bundling modules that import from JSR failed entirely until a specific fix
  ([denoland/deno#29663](https://github.com/denoland/deno/issues/29663), Jun
  2025, now fixed).
- The Deno 1→2 migration guide still states "The deno bundle command has been
  removed" while the bundling reference documents it as a current feature.

Building production tooling on an experimental command with an uncertain
stability guarantee is not viable for a framework.

**How Bun solves this:** emroute's `BunFsRuntime` uses esbuild's JS API directly
— the same bundler that powers `deno bundle` under the hood, but accessed as a
stable, well-documented, version-pinned npm dependency. Full control over
externals, code splitting, source maps, output format. No experimental flags, no
risk of removal.

### 6. The hybrid pattern requires two resolution systems in one project

Supporting both server (Deno-native JSR) and client (esbuild needs
`node_modules`) in the same project requires:

- `nodeModulesDir: "manual"` in `deno.json`
- `package.json` alongside `deno.json` for client-side dependencies
- Server using native JSR imports, client using `package.json` resolution

The Deno docs support three `nodeModulesDir` modes (`"none"`, `"auto"`,
`"manual"`) and acknowledge that both config files can coexist. But the
interaction is fragile:

- Type checking breaks with `nodeModulesDir: "manual"` when a JSR package
  imports an npm package using `@types/`
  ([denoland/deno#30929](https://github.com/denoland/deno/issues/30929), Oct
  2025, tagged `important for fresh`).
- The same dependency in both `deno.json` and `package.json` causes lockfile
  duplication and deployment failures
  ([denoland/deno#27380](https://github.com/denoland/deno/issues/27380)).
- Workspace dependencies get stripped from JSR's generated npm-layer
  `package.json`
  ([jsr-io/jsr#448](https://github.com/jsr-io/jsr/issues/448)).

No dedicated "dual resolution" documentation exists. The concept is covered
implicitly across multiple pages, and the failure modes are discovered only
through experimentation.

**How Bun solves this:** One resolution system. `package.json` declares all
dependencies. `node_modules` is the single source of truth for both server and
client code. esbuild reads from `node_modules`. The server reads from
`node_modules`. No dual config, no mode flags, no split resolution.

---

## The root cause

These six issues share a common root: **JSR's design prioritizes static
analyzability and security at the expense of dynamic runtime patterns.**

JSR requires that every dependency is known at publish time. Every import path
must be statically resolvable. The module graph is frozen when the package is
uploaded to the registry. This design produces excellent properties for simple
libraries: immutability, reproducibility, security guarantees, automatic
documentation generation, fast type checking.

But a framework is not a simple library. emroute needs:

- **Dynamic `import()` of consumer-provided modules** (bundler, plugins) →
  blocked by JSR's specifier rewriting and security restrictions.
- **Runtime resolution of package entry points** (`import.meta.resolve` to file
  paths for bundling) → returns cache URLs instead of filesystem paths.
- **Shared singletons across packages** (router, registry, types) → impossible
  without peer dependencies.
- **Consumer-side dependency resolution** (esbuild from the consumer's
  `node_modules`) → incompatible with JSR's publish-time graph freezing.

Every one of these is a first-class, zero-friction operation in the npm/Bun
ecosystem.

---

## What would need to change for JSR to work

Based on the research, three things would need to happen:

1. **Import map merging** ([denoland/deno#30689](https://github.com/denoland/deno/issues/30689))
   — If Deno implements the web-standard import map merging algorithm, JSR
   wouldn't need to rewrite specifiers at publish time. Packages would ship
   their own import maps. This alone would fix issues #1 and partially #2.
   Currently tagged `suggestion` with no team response.

2. **Peer dependency support in JSR** — JSR's module graph builder would need to
   understand that some dependencies are provided by the consumer at install
   time, not resolved at publish time. No issue, proposal, or roadmap item
   exists for this. [jsr-io/jsr#301](https://github.com/jsr-io/jsr/issues/301)
   has been open since Mar 2024 with no movement.

3. **`deno bundle` stabilization** — The bundler needs to exit experimental
   status, fix the watch-mode append bug, and commit to a stable API surface.
   Progress is happening here faster than on the other two items.

None of these exist today. The earliest any of them could ship is mid-2026 at
the current pace.

---

## Why Bun specifically

The decision wasn't "Bun is better than Deno." It was "npm + `node_modules` is
the only resolution model that supports what emroute needs, and Bun is the best
runtime for that model."

Bun provides:

- **Native TypeScript execution** — no build step for server code, same as Deno.
- **Fast npm install** — faster than npm/yarn/pnpm for cold installs.
- **Standard `node_modules` resolution** — every dynamic pattern works because
  resolution is filesystem-based.
- **esbuild compatibility** — esbuild runs as a standard npm dependency, no
  platform-specific shims.
- **`peerDependencies` deduplication** — the npm model works as designed.
- **Single config file** — `package.json` is the only dependency manifest.

The tradeoff is giving up Deno's permission system, `deno.json` import maps, and
native `jsr:` specifiers. For emroute's use case — a cross-runtime framework
with bundling and plugin architecture — those tradeoffs are worth it because the
npm model's flexibility is a hard requirement, not a preference.

---

## Current state (Feb 2026)

emroute 1.5.x remains published on JSR for existing Deno consumers. emroute
1.6.0+ publishes to npm, targets Bun as the primary runtime, and works with any
npm-compatible package manager and runtime.

If JSR adopts import map merging and peer dependencies in the future, publishing
back to JSR becomes viable. Until then, npm is the only registry that supports
the resolution model emroute requires.

---

## References

### Deno docs (docs.deno.com)

- [deno publish](https://docs.deno.com/runtime/reference/cli/publish/) — no
  mention of dynamic import rewriting behavior
- [Bundling](https://docs.deno.com/runtime/reference/bundling/) — `deno bundle`
  experimental status, ESBuild-powered, code splitting + watch + sourcemap
  support
- [Configuration](https://docs.deno.com/runtime/fundamentals/configuration/) —
  three `nodeModulesDir` modes, `deno.json` + `package.json` coexistence
- [Workspaces](https://docs.deno.com/runtime/fundamentals/workspaces/) —
  workspace member import rewriting documented, but not bare specifier dynamic
  imports
- [Migration Guide](https://docs.deno.com/runtime/reference/migration_guide/) —
  still states "deno bundle has been removed" despite current bundling docs

### JSR docs (jsr.io/docs)

- [Publishing packages](https://jsr.io/docs/publishing-packages) — specifier
  rewriting documented for static imports only
- [npm compatibility](https://jsr.io/docs/npm-compatibility) — limitations
  listed including duplicate installations, transpiled TypeScript, slower
  installs
- [Troubleshooting](https://jsr.io/docs/troubleshooting) — no mention of
  dynamic import issues, peer dependencies, or `import.meta.resolve` behavior
- No known-limitations page, no roadmap, no FAQ entries for any of the six issues

### GitHub issues

- [denoland/deno#30689](https://github.com/denoland/deno/issues/30689) — Import
  map merging proposal (Sep 2025, open, no team response)
- [denoland/deno#26266](https://github.com/denoland/deno/discussions/26266) —
  Dynamic file imports inside JSR packages not working
- [denoland/deno#25360](https://github.com/denoland/deno/issues/25360) — JSR
  dynamic imports too strict
- [denoland/deno#30143](https://github.com/denoland/deno/issues/30143) — `deno
  bundle --watch` append bug (Jul 2025, open)
- [denoland/deno#30929](https://github.com/denoland/deno/issues/30929) — JSR +
  `nodeModulesDir: "manual"` type resolution broken (Oct 2025, open)
- [denoland/deno#27380](https://github.com/denoland/deno/issues/27380) — JSR
  deduplication failure with dual config files
- [jsr-io/jsr#301](https://github.com/jsr-io/jsr/issues/301) — Optional peer
  dependencies do not work (Mar 2024, open)
- [jsr-io/jsr#102](https://github.com/jsr-io/jsr/issues/102) — No concept of
  externally-provided dependencies
- [jsr-io/jsr#405](https://github.com/jsr-io/jsr/issues/405) — npm tarball path
  incompatibility breaks enterprise registries
- [jsr-io/jsr#448](https://github.com/jsr-io/jsr/issues/448) — Workspace
  dependencies stripped from npm layer
- [jsr-io/jsr Discussion #701](https://github.com/jsr-io/jsr/discussions/701) —
  ESLint team unable to depend on JSR package from npm-published package