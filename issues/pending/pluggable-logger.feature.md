# Pluggable logger for silent catch blocks

Several catch blocks silently discard errors for graceful degradation:

| Location                         | Behavior                          |
| -------------------------------- | --------------------------------- |
| `ssr/html.renderer.ts` (2 sites) | Fall through to inline fallback   |
| `ssr/md.renderer.ts` (2 sites)   | Fall through to inline fallback   |
| `widget-resolve.util.ts`         | Leave widget tag as-is on failure |

Consumers have no way to observe or log these failures. A pluggable logger
(optional error callback or event emitter) would aid production
troubleshooting without adding a logging dependency.

**Source:** `clean-code.issue.md` CC-10
