Decision Made: Keep It Simple

What we're keeping:

- Islands/widgets approach (SSR + interactive components)
- Existing SPA router (optional, ~30-40KB overhead)
- Clean mental model: make pages, add widgets

What we're dropping:

- Complex mode system (none/leaf/root/only)
- /spa/* prefix intent system
- Client/server mode synchronization

Experimental work preserved:

- Branch: experimental/spa-prefix-intent (commit d4e7b62)
- Includes: /spa/* normalization, mode-aware routing, debug logging
- Available if you ever want to revisit

Bundle reality check:

- Current approach: ~100KB baseline
- Router overhead: only ~30-40KB (not 100KB as I initially thought)
- Complexity cost > bundle cost

The path forward:

- Focus on making islands/widgets excellent
- SPA router stays available for apps that need it
- No mode configuration complexity
- Simpler documentation, simpler mental model
