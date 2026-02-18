# NavigateOptions.state silently ignored after Navigation API migration

## Problem

`SpaHtmlRouter.navigate()` accepts `NavigateOptions` which includes
`state?: RouterState` (with `scrollY` etc.), but the Navigation API migration
dropped state handling. The `state` field is never passed to
`navigation.navigate()`.

Callers passing `state` get no error and no effect — a silent API contract
breakage.

## Resolution

Option 2: pass `state` through to `navigation.navigate({ state, history })`.
The Navigation API stores it on the history entry natively. Consumers who want
custom state get it; the type stays honest.

`RouterState` could be loosened to `Record<string, unknown>` since the
Navigation API accepts any cloneable value — but that's a separate cleanup.
