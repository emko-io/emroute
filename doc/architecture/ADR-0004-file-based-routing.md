# ADR-0004: File-Based Routing

**Status**: Accepted
**Date**: 2026-02-07
**Decision Makers**: Development Team

## Context

Framework routers (React Router, SolidJS Router, wouter) require explicit route
declarations in code -- config arrays or JSX trees. Developers manually maintain
a mapping between URL patterns and components. As the application grows, the
routing config drifts from the actual file structure.

Next.js and SvelteKit pioneered file-based routing but couple it tightly to their
respective frameworks. emroute brings file-based routing to a
framework-agnostic context using native Web Components.

The question is how routes should be defined: via configuration objects, via
decorators on component classes, or via filesystem convention.

## Decision

Routes are defined by filesystem convention, not configuration objects or JSX.

### File naming conventions

| File                     | Route           | Purpose         |
| ------------------------ | --------------- | --------------- |
| `about.page.ts`          | `/about`        | page            |
| `projects/[id].page.ts`  | `/projects/:id` | dynamic segment |
| `projects/index.page.ts` | `/projects`     | directory index |
| `404.page.md`            | (status page)   | status page     |
| `projects/[id].error.ts` | `/projects/:id` | error boundary  |
| `old-path.redirect.ts`   | `/old-path`     | redirect        |

### File type precedence

`.ts` > `.html` > `.md`

A route can have multiple files sharing the same stem (e.g., `about.page.ts` +
`about.page.html` + `about.page.md`). These combine -- the `.ts` provides logic,
`.html` provides template, `.md` provides content. All are available to the
component via `PageContext.files`.

### Flat file vs directory index

`about.page.ts` and `about/index.page.ts` both produce the pattern `/about`.
When both exist, the directory index takes precedence for the same file type
slot. Creating a folder with an index is an upgrade from the flat file form.
Different file types coexist without conflict -- `crypto.page.html` (flat) and
`crypto/index.page.md` (directory) both contribute to the same route.

This convention also sets up ADR-0002 (Wildcard Routes via Directory Index),
where a directory index gains catch-all semantics.

### Build-time manifest

A route manifest is generated at build time by scanning the `routes/` directory.
The manifest maps URL patterns to module loaders. No runtime filesystem access is
needed. Pattern conversion is mechanical: `[id]` becomes `:id`, directory
structure becomes route hierarchy.

## Consequences

### Positive

- **Route structure visible in the file tree**: `ls routes/` shows all routes.
  No central routing config to grep through.
- **No central config to maintain**: Adding a route means adding a file. Removing
  a route means deleting a file. No config to keep in sync.
- **Content-first**: A page can be just a `.md` file with no JavaScript. The
  router handles it the same as a full component.
- **Mechanical pattern conversion**: `[id]` maps to `:id`, directory structure
  maps to route hierarchy. No ambiguity in the translation.
- **Build-time manifest generation**: Routes are resolved at build time. No
  runtime filesystem scanning, no dynamic imports of unknown paths.

### Negative

- **Convention must be learned**: File naming rules (`.page.ts`, `[id]`,
  `index.page.ts`) and precedence rules (`.ts` > `.html` > `.md`) are implicit.
  New developers need to learn them.
- **No dynamic route creation at runtime**: All routes are known at build time.
  Routes cannot be added or removed based on runtime state.
- **Filesystem constraints limit pattern expressiveness**: No regex patterns, no
  inline alternatives, no constraints on parameter values. The filesystem is the
  only source of route definitions.

### Neutral

- The manifest generation step adds a build requirement but is fast (directory
  scan + pattern conversion) and produces a static artifact that can be inspected.

## References

- Code: `emroute/src/route.matcher.ts` -- `filePathToPattern`,
  `sortRoutesBySpecificity`
- Code: `emroute/tool/route.generator.ts` -- manifest generation
- Related: ADR-0001 (No Optional Params), ADR-0002 (Wildcard Routes via
  Directory Index)

## Notes

### Alternatives Considered

1. **Config-based routing**: Explicit route array like wouter/SolidJS. More
   flexible but requires manual maintenance. Route structure not visible in the
   filesystem. Config and files drift apart over time.

2. **Decorator-based routing**: Annotations on component classes. Couples routing
   to component definition. Requires runtime reflection or build-time transforms.
   Routes are scattered across files rather than visible in one place.

3. **Convention + config hybrid**: Filesystem defines defaults, a config file
   provides overrides. Added complexity from two sources of truth. Debugging
   requires checking both the file tree and the config.
