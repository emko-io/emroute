SSR markdown renderer emits useless router-slot placeholder for leaf pages

When rendering an HTML-only page (e.g. about.page.html) through the markdown
SSR renderer, PageComponent.renderMarkdown() falls back to the
`` ```router-slot``` `` placeholder because there's no .md file. For leaf pages
with no children this placeholder is never replaced and appears in the output
as literal fenced code.

The HTML renderer doesn't have this problem — `<router-slot></router-slot>`
gets replaced or is naturally invisible in the browser.

Possible fix: after composing the full markdown hierarchy, strip any remaining
`` ```router-slot``` `` blocks that were never substituted.
