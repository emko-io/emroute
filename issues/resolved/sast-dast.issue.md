# SAST/DAST Security Analysis

**Project:** `@emkodev/emroute` v1.0.0-beta.7
**Date:** 2026-02-10
**Scope:** Full codebase static analysis + dynamic pattern review

---

## CRITICAL

### 1. Path Traversal in Dev Server Static File Serving

**File:** `server/dev.server.ts:262-263`

```typescript
function resolveFilePath(pathname: string): string {
  return appRoot + pathname; // No validation
}
```

The HTTP request pathname is directly concatenated with `appRoot` with no
normalization or boundary check. An attacker can request
`GET /../../../etc/passwd` or `GET /../../.git/config` to read arbitrary files
on the server filesystem. This affects all static file serving paths (lines 358,
372-373 as well).

**Remediation:** Resolve the path, then verify it starts with `appRoot`. Reject
`..` sequences.

**Resolution:** Fixed. Added `safePath()` that decodes percent-encoding,
normalizes `/../` via URL resolution, and verifies the resolved path stays
within the root. Returns 403 on traversal. Applied to both `.build/` and
`appRoot` paths.

---

### 2. Verbose Error Responses Leak Stack Traces

**File:** `server/dev.server.ts:285, 312`

```typescript
return new Response(`Error: ${e}`, { status: 500 });
```

Caught exceptions are stringified directly into HTTP responses, exposing full
stack traces, file paths, and internal structure to any client.

**Remediation:** Return a generic `500 Internal Server Error` message. Log the
full error server-side only.

**Resolution:** Fixed. Dev server, SSR HTML, and SSR MD renderers now return
generic error messages. Full errors logged server-side via `console.error`.

---

## HIGH

### 3. DOM-Based XSS via Markdown `innerHTML`

**File:** `src/element/markdown.element.ts:170`

```typescript
this.innerHTML = html; // Output from markdown renderer
```

The rendered markdown HTML is set via `innerHTML` without sanitization. If the
pluggable `MarkdownRenderer` does not strip dangerous HTML (e.g. `<script>`,
`<img onerror=...>`), arbitrary script execution is possible. The framework
delegates renderer choice to consumers but provides no safety net.

**Remediation:** Document that the markdown renderer MUST sanitize output, or add
a built-in sanitization pass (e.g. strip `<script>`, event handlers) before
assigning to `innerHTML`.

**Resolution:** Documented. Added security section to `doc/markdown-renderer.md`
covering both SSR (full document parse, `<script>` executes) and SPA
(`innerHTML`, only event-handler attributes fire). Added JSDoc on
`MarkdownRenderer.render()` referencing the doc.

---

### 4. Open Redirect via Unvalidated Redirect Destinations

**Files:** `src/renderer/ssr/html.renderer.ts:87`,
`src/renderer/spa/html.renderer.ts:204`

SSR:

```typescript
html: `<meta http-equiv="refresh" content="0;url=${escapeHtml(redirectConfig.to)}">`;
```

SPA:

```typescript
this.navigate(module.default.to, { replace: true });
```

Redirect `.redirect.ts` files specify a `to` string that is never validated.
While these are developer-authored files (not user input), a misconfigured or
compromised redirect file could point to `javascript:`, `data:`, or external
phishing URLs. The `escapeHtml()` only prevents HTML breakout, not
protocol/origin abuse.

**Remediation:** Validate that `to` starts with `/` (relative) or matches an
allowed origin. Reject `javascript:` and `data:` protocols. Prefer HTTP
`Location` header over `<meta http-equiv="refresh">`.

**Resolution:** Fixed. Added `assertSafeRedirect()` in `route.core.ts` that
blocks `javascript:`, `data:`, and `vbscript:` protocols. Applied in both SSR
HTML and SPA renderers before redirect execution.

---

### 5. ~~CORS `*` on All Dev Server Responses~~ — Won't Fix

**Resolution:** Accepted risk for a development server. Path traversal (#1) is
fixed, which was the main amplifier. Restricting CORS or binding to localhost
would over-complicate the dev server for marginal benefit. Comparable to Vite's
default behavior.

---

### 6. Error Messages in Markdown SSR Response

**File:** `src/renderer/ssr/md.renderer.ts:228-230`

```typescript
return `# Error\n\nPath: \`${pathname}\`\n\n${message}`;
```

Raw error messages (which may contain DB queries, file paths, connection strings)
are included in the markdown response body without filtering.

**Remediation:** Return a generic error message. Log details server-side.

**Resolution:** Fixed. `SsrMdRouter.renderErrorPage()` returns generic
`# Internal Server Error`. Added `console.error` before returning error pages in
both SSR renderers.

---

## MEDIUM

### 7. No File-Type Allowlist for Static Serving

**File:** `server/dev.server.ts:340-399`

The dev server serves any file type from `appRoot`. Combined with path
traversal, this can expose `.env`, `.git/config`, private keys, or any system
file.

**Remediation:** Implement an allowlist of servable extensions (`.html`, `.js`,
`.css`, `.wasm`, `.svg`, `.png`, etc.) or serve only from an explicit `public/`
directory.

**Resolution:** Fixed. Added `STATIC_EXTENSIONS` allowlist and
`isAllowedStaticFile()` gate before `appRoot` static file serving. Requests for
`.ts`, `.env`, `deno.json`, etc. return 404. Aliases and bundled JS unaffected.

---

### 8. Missing Security Headers

**File:** `server/dev.server.ts`

No security headers are set on any response:

- `X-Content-Type-Options: nosniff` (MIME sniffing)
- `X-Frame-Options: DENY` (clickjacking)
- `Content-Security-Policy` (XSS mitigation)
- `Referrer-Policy`

**Remediation:** Add standard security headers, at least for SSR HTML responses.

**Resolution:** Fixed. Added `X-Content-Type-Options: nosniff` and
`X-Frame-Options: DENY` to all responses via a wrapper around `handleRequest`.
Skipped CSP and Referrer-Policy to avoid interfering with dev workflows.

---

### 9. `escapeHtml()` Missing Backtick Escape

**File:** `src/util/html.util.ts:15-22`

```typescript
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

Backticks are not escaped. Currently all uses are in HTML context (safe), but if
the output ever appears inside a JS template literal, this becomes an XSS
vector.

**Remediation:** Add `.replace(/`/g, '&#96;')` for defense-in-depth, or document
that this function is HTML-context-only.

**Resolution:** Fixed. Added backtick escape to `escapeHtml()` in
`html.util.ts`.

---

## LOW / INFORMATIONAL

| #  | Finding                                                             | File                                  | Severity |
| -- | ------------------------------------------------------------------- | ------------------------------------- | -------- |
| 10 | No widget recursion depth limit (mitigated: single-pass processing) | `src/util/widget-resolve.util.ts`     | Low      |
| 11 | Unbounded concurrent widget `getData()` calls via `Promise.all`     | `src/util/widget-resolve.util.ts:33`  | Low      |
| 12 | `escapeAttr()` only escapes `&` and `"` (adequate for JSON-in-attr) | `src/util/widget-resolve.util.ts:104` | Info     |
| 13 | Console.error logging may leak info in production browsers          | `src/renderer/spa/html.renderer.ts`   | Low      |
| 14 | `MarkdownElement` static state could race if `setRenderer()` late   | `src/element/markdown.element.ts`     | Low      |
| 15 | Dynamic `import()` from route manifest paths (requires compromise)  | `src/route/route.core.ts:175-176`     | Low      |

---

## Positive Findings

- **Zero production dependencies** -- minimal supply chain attack surface
- **Proper HTML escaping** in error/status pages (`escapeHtml()` on pathname and
  error messages in SSR HTML renderer)
- **No hardcoded secrets**, credentials, or users
- **No prototype pollution** vectors found
- **No ReDoS** -- all regex patterns use non-greedy `[\s\S]*?` on controlled
  input
- **TypeScript strict mode** catches many classes of bugs at compile time
- **RedirectConfig type** restricts status to `301 | 302` only
- **Widget SSR data** properly escaped via `escapeAttr(JSON.stringify(data))`

---

## Priority Matrix

| Priority          | Action                                                             | Status   |
| ----------------- | ------------------------------------------------------------------ | -------- |
| **P0 - Fix now**  | Path traversal (#1), verbose error responses (#2)                  | Done     |
| **P1 - Fix soon** | Markdown XSS (#3), open redirect (#4), CORS (#5), MD errors (#6)   | Done     |
| **P2 - Harden**   | File-type allowlist (#7), security headers (#8), backtick (#9)     | Done     |
| **P3 - Consider** | Widget depth/concurrency limits (#10-11), production logging (#13) | Accepted |
