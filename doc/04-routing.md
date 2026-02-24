# Routing

Routes are defined by filesystem convention inside the `routes/` directory. No
configuration file, no route registration — the file structure is the routing
config.

## File → URL mapping

```
routes/
  index.page.md           →  /
  about.page.html         →  /about
  projects.page.ts        →  /projects
  projects/
    [id].page.ts          →  /projects/:id
    [id]/
      tasks.page.ts       →  /projects/:id/tasks
  crypto/
    index.page.md         →  /crypto/*
    eth.page.ts           →  /crypto/eth
    [coin].page.ts        →  /crypto/:coin
```

## Dynamic parameters

Square brackets in filenames become URL parameters:

```
routes/projects/[id].page.ts  →  /projects/:id
```

Access parameters in your component via `params`:

```ts
override async getData({ params }: this['DataArgs']) {
  // params.id is the matched URL segment
  return fetchProject(params.id);
}
```

## Flat file vs directory index

This distinction matters for nesting:

- **Flat file** `projects.page.ts` matches `/projects` **exactly**
- **Directory index** `projects/index.page.md` catches all unmatched children
  under `/projects/*`

Both can coexist:

```
routes/
  projects.page.ts         →  /projects       (exact match)
  projects/
    index.page.md          →  /projects/*     (catch-all for unmatched children)
    [id].page.ts           →  /projects/:id   (specific child)
```

- `/projects` → `projects.page.ts` (exact match wins)
- `/projects/42` → `projects/[id].page.ts` (specific child)
- `/projects/42/unknown` → `projects/index.page.md` (catch-all)

## Priority rules

When multiple routes could match a URL:

1. **Static segments win over dynamic:** `/crypto/eth` matches `eth.page.ts`
   before `[coin].page.ts`
2. **Specific routes win over catch-all:** `/projects/42` matches
   `[id].page.ts`, not `index.page.md`
3. **Flat file wins for exact path:** `/projects` matches `projects.page.ts`,
   not `projects/index.page.md`

## Error handling files

Special file types for error scenarios:

```
routes/
  index.error.ts           →  Root error handler (catches everything)
  projects/
    [id].error.ts          →  Error boundary for /projects/:id/*
  404.page.html            →  Custom "Not Found" page
  401.page.ts              →  Custom "Unauthorized" page
```

## Redirects

```ts
// routes/old-page.redirect.ts
import type { RedirectConfig } from '@emkodev/emroute';

export default { to: '/new-page', status: 301 } satisfies RedirectConfig;
```

Next: [Nesting](./05-nesting.md)
