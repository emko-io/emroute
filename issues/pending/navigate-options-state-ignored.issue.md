# NavigateOptions.state silently ignored after Navigation API migration

## Problem

`SpaHtmlRouter.navigate()` accepts `NavigateOptions` which includes
`state?: RouterState` (with `scrollY` etc.), but the Navigation API migration
dropped state handling. The `state` field is never passed to
`navigation.navigate()`.

Callers passing `state` get no error and no effect — a silent API contract
breakage.

## Options

1. **Remove `state` from `NavigateOptions`** — breaking change, but honest.
   Callers relying on it will get a compile error.
2. **Pass state to `navigation.navigate({ state })`** — the Navigation API
   supports it natively, so this could be wired through.
3. **Document as deprecated** — mark `state` as `@deprecated` with a note
   that the Navigation API manages its own state.
