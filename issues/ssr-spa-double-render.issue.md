SSR HTML + SPA script causes double rendering

The SSR HTML shell includes the SPA script, which boots the router. The router
re-renders the entire route tree into the page, duplicating what the server
already rendered.

With the selected approach for #22 (reuse index.html as SSR shell), the SPA
script will always load — it's needed for island hydration and client-side
navigation. So removing the script isn't an option.

The SPA router needs to be hydration-aware:

- Detect that <router-slot> already has server-rendered content
- Skip the initial render
- Attach event listeners for subsequent client-side navigation
- Only re-render when the user actually navigates

Detection could be a data attribute on <router-slot> set by the server
(e.g., data-ssr), or the router could check if the slot already has children
matching the current route.

This is part of a broader hydration story — the same pattern applies at the
component/widget level. The server could prefetch getData() results and embed
them as initial state (e.g., data-* attributes or inline JSON), so client-side
hydration either:

- Uses the server data as initial state and skips getData() entirely
- Surgically updates the DOM if the data has changed since SSR

Both the route-level skip (don't re-render the page) and the component-level
skip (don't re-fetch data) are the same hydration problem. Should be designed
as one unified approach rather than two separate mechanisms.

See also: guide.md "Planned" note about pre-generated data support for islands.
