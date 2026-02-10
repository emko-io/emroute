Watcher doesn't trigger rebuild when new route files are created

The file watcher only rebuilds when existing route files change, not when new
ones appear. Creating a new .page.ts file requires a manual server restart.

The code looks correct — Deno.watchFs emits "create" events, the runtime
passes them through, and the callback doesn't filter by event kind. It only
checks file extensions (.page.ts, .page.html, .page.md, .error.ts,
.redirect.ts).

Possible causes:

- Deno.watchFs may not reliably detect new files in new subdirectories
- Race condition with the 100ms debounce timer
- Platform-specific FSEvents behavior on macOS
- Need to reproduce and verify

---

Resolved: Fixed in beta.3. FSEvents on macOS reports "other" instead of
"create" for new files. Fixed by treating both event kinds as rebuild triggers.
