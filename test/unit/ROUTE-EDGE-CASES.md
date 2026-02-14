# Route File Pattern Edge Cases

## Overview

This document catalogs edge cases and limitations discovered through comprehensive route combination testing. These are scenarios consumers might accidentally or intentionally create.

## URLPattern Limitations

### 1. Hyphens in Parameter Names

**Problem:**

```
routes/items/[item-id].page.ts → /items/:item-id
```

**Issue:** URLPattern doesn't support hyphens in parameter names. The pattern fails to compile or match.

**Solution:** Use underscores or camelCase instead:

```
routes/items/[item_id].page.ts → /items/:item_id
routes/items/[itemId].page.ts → /items/:itemId
```

**Status:** ❌ Invalid pattern - will not match

---

### 2. Multiple Parameters in Single Segment

**Problem:**

```
routes/users/[user]-[id].page.ts → /users/:user-:id
```

**Issue:** URLPattern doesn't parse this as two separate parameters. The hyphen is treated as part of the pattern syntax, not a literal separator.

**Solution:** Use separate path segments:

```
routes/users/[user]/[id].page.ts → /users/:user/:id
```

**Status:** ❌ Invalid pattern - ambiguous behavior

---

### 3. Adjacent Parameters Without Separator

**Problem:**

```
routes/test/[a][b].page.ts → /test/:a:b
```

**Issue:** URLPattern interprets this as a single parameter or invalid syntax.

**Solution:** Always separate parameters with slashes:

```
routes/test/[a]/[b].page.ts → /test/:a/:b
```

**Status:** ❌ Invalid pattern - unpredictable

---

## Route Collision Scenarios

### 4. Multiple Index Files (Same Directory)

**Problem:**

```
routes/blog/index.page.md  → /blog/:rest*
routes/blog/index.page.ts  → /blog/:rest*
```

**Issue:** Both files produce identical patterns. First one in the manifest wins.

**Impact:** ⚠️ Pattern conflict - undefined behavior

**Best Practice:** Use only one index file per directory.

---

### 5. Static vs Dynamic vs Wildcard (Three-Way Collision)

**File Structure:**

```
routes/projects.page.ts           → /projects         (static)
routes/projects/[id].page.ts      → /projects/:id     (dynamic)
routes/projects/index.page.ts     → /projects/:rest*  (wildcard)
```

**Matching Behavior:**

```
/projects            → matches /projects (static)
/projects/123        → matches /projects/:id (dynamic)
/projects/123/tasks  → matches /projects/:rest* (wildcard)
```

**Status:** ✅ Works as expected when properly sorted

**Sort Order:** Static > Dynamic > Wildcard

---

### 6. Identical Patterns from Different Param Names

**Problem:**

```
routes/blog/[slug].page.ts → /blog/:slug
routes/blog/[id].page.ts   → /blog/:id
```

**Issue:** URLPattern sees these as different patterns (different param names), but they match the same URLs. First one wins.

**Impact:** ⚠️ Pattern conflict - first match wins

**Best Practice:** Don't create multiple files with different param names at the same path level.

---

## Deep Nesting Scenarios

### 7. Multiple Index Files at Different Depths

**File Structure:**

```
routes/docs/index.page.ts          → /docs/:rest*
routes/docs/api/index.page.ts      → /docs/api/:rest*
routes/docs/api/v1/index.page.ts   → /docs/api/v1/:rest*
```

**Matching Behavior:**

```
/docs/guide               → /docs/:rest*
/docs/api/components      → /docs/api/:rest*
/docs/api/v1/users        → /docs/api/v1/:rest*
```

**Status:** ✅ Works correctly - more specific wildcards match first

**Sort Order:** Deeper paths come first (longer = more specific)

---

### 8. Index File Under Dynamic Segment

**File Structure:**

```
routes/users/[id]/index.page.ts → /users/:id/:rest*
```

**Matching Behavior:**

```
/users/42/profile           → matches with {id: '42', rest: 'profile'}
/users/42/settings/privacy  → matches with {id: '42', rest: 'settings/privacy'}
```

**Status:** ✅ Works as expected

**Use Case:** User-specific wildcard routes

---

## File Naming Edge Cases

### 9. Filenames with Dots

**Pattern:**

```
routes/api.v1.page.ts → /api.v1
```

**Status:** ✅ Valid - dots in filenames are preserved in the URL

---

### 10. Single Character Routes

**Pattern:**

```
routes/a.page.ts  → /a
routes/[x].page.ts → /:x
```

**Status:** ✅ Valid - single characters work fine

---

### 11. Very Deep Nesting (6+ Levels)

**Pattern:**

```
routes/a/b/c/d/e/f/g.page.ts → /a/b/c/d/e/f/g
```

**Status:** ✅ Valid - no depth limit

---

## Sorting and Priority

### 12. Sorting Rules (in order of priority)

1. **Wildcards always last** - Routes with `:rest*` or `:path+` sort after all non-wildcards
2. **More segments = more specific** - `/a/b/c` comes before `/a/b`
3. **Static before dynamic** - `/projects/special` comes before `/projects/:id`
4. **Among wildcards, longer first** - `/docs/api/:rest*` before `/docs/:rest*`

---

## Recommendations

### ✅ DO

- Use underscores or camelCase in param names: `[user_id]` or `[userId]`
- Separate params with path segments: `routes/[org]/[team].page.ts`
- Use one index file per directory
- Follow consistent naming conventions
- Test route combinations if using complex patterns

### ❌ DON'T

- Use hyphens in param names: `[item-id]`
- Create multiple params in one segment: `[user]-[id]`
- Create duplicate patterns with different param names
- Mix index files of different extensions in same directory
- Use special characters in param names beyond `_`

---

## Testing Strategy

All edge cases are covered in `test/unit/route.combinations.test.ts`:

- **Programmatic manifest generation** - No actual files needed
- **Comprehensive collision scenarios** - Static, dynamic, wildcard interactions
- **Deep nesting tests** - Multi-level routes and params
- **Real-world scenarios** - E-commerce, docs sites, etc.
- **Limitation documentation** - URLPattern constraints

Run tests:

```bash
deno test test/unit/route.combinations.test.ts
```

---

## Summary

Most route file patterns work as expected. The main gotchas are:

1. **No hyphens in param names** - Use `_` or camelCase instead
2. **No multiple params per segment** - Use separate path segments
3. **Watch for pattern collisions** - Different param names, same structure
4. **Index files create wildcards** - Except at root
5. **Sorting matters** - Ensure proper specificity order

The routing system is robust for standard use cases. Edge cases are well-documented and tested.
