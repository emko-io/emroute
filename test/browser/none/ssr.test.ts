/**
 * SPA Mode: none — SSR Renderers Integration Tests
 *
 * Tests SSR HTML (/html/*) and SSR Markdown (/md/*) renderers in 'none' mode.
 * No JavaScript bundles are served — pure server-side rendering.
 *
 * Coverage matrix — every route type x both SSR renderers:
 * - .page.md (markdown fallback)
 * - .page.html (HTML fallback / markdown router-slot fallback)
 * - .page.ts (custom renderHTML/renderMarkdown)
 * - .page.ts + .page.html (template pattern)
 * - .page.ts + .page.md (markdown in context)
 * - Flat file vs directory index
 * - Nested dynamic routes
 * - Nesting at multiple depths (all file combinations)
 * - Redirects
 * - 404 / 500 status pages
 * - CSS injection (page and widget)
 * - Widget rendering in SSR mode
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { createTestServer, type TestServer } from '../shared/setup.ts';

let server: TestServer;

function baseUrl(path = '/'): string {
  return server.baseUrl(path);
}

// ── Mode Behavior ───────────────────────────────────────────────────

describe("SPA mode 'none' — SSR behavior", () => {
  beforeAll(async () => {
    server = await createTestServer({ mode: 'none', port: 4101 });
  });

  afterAll(() => {
    server.stop();
  });

  test('GET / redirects to /html/', async () => {
    const res = await fetch(baseUrl('/'), { redirect: 'manual' });
    expect(res.status).toEqual(302);
    const location = res.headers.get('location');
    expect(location?.endsWith('/html/')).toBeTruthy();
  });

  test('GET /about redirects to /html/about', async () => {
    const res = await fetch(baseUrl('/about'), { redirect: 'manual' });
    expect(res.status).toEqual(302);
    const location = res.headers.get('location');
    expect(location?.endsWith('/html/about')).toBeTruthy();
  });

  test('GET /html/about serves SSR HTML', async () => {
    const res = await fetch(baseUrl('/html/about'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('<h1');
    expect(res.headers.get('content-type')).toEqual('text/html; charset=utf-8');
  });

  test('GET /md/about serves SSR Markdown', async () => {
    const res = await fetch(baseUrl('/md/about'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('About');
    expect(res.headers.get('content-type')?.includes('text/markdown')).toBeTruthy();
  });
});

// ── SSR HTML ─────────────────────────────────────────────────────────

describe('SSR HTML renderer', () => {
  beforeAll(async () => {
    server = await createTestServer({ mode: 'none', port: 4101 });
  });

  afterAll(() => {
    server.stop();
  });

  // --- .page.md ---

  test('.page.md renders expanded markdown as HTML', async () => {
    const res = await fetch(baseUrl('/html/'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html.includes('<mark-down>')).toBe(false);
    expect(html).toContain('emroute');
  });

  // --- .page.html ---

  test('.page.html renders HTML content directly', async () => {
    const res = await fetch(baseUrl('/html/about'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('<h1>About</h1>');
    expect(html).toContain('About Page');
    expect(html).toContain('section-1');
    expect(html).toContain('<widget-failing');
  });

  // --- .page.ts ---

  test('.page.ts component renders with getData', async () => {
    const res = await fetch(baseUrl('/html/projects/42'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('Project 42');
    expect(html).toContain('ID: 42');
  });

  // --- .page.ts + .page.html (params) ---

  test('.page.ts + .page.html replaces template slots from params', async () => {
    const res = await fetch(baseUrl('/html/docs'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('Topic: general');
    expect(html).toContain('Documentation');
  });

  // --- .page.ts + .page.html (getData) ---

  test('.page.ts + .page.html injects getData into template', async () => {
    const res = await fetch(baseUrl('/html/profile'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('Alice');
    expect(html).toContain('Role: Engineer');
    expect(html).toContain('Builds things.');
  });

  // --- .page.ts + .page.md ---

  test('.page.ts + .page.md renders markdown + custom content', async () => {
    const res = await fetch(baseUrl('/html/blog'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('Blog');
    expect(html).toContain('Posts: 0');
  });

  // --- Nested dynamic ---

  test('nested dynamic route renders full hierarchy', async () => {
    const res = await fetch(baseUrl('/html/projects/42/tasks'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('Project 42');
    expect(html).toContain('Tasks for 42');
    expect(html).toContain('Task A for 42');
  });

  // --- Flat file vs directory index ---

  test('flat file renders exact match', async () => {
    const res = await fetch(baseUrl('/html/projects'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('All Projects');
  });

  test('directory index catches unmatched children', async () => {
    const res = await fetch(baseUrl('/html/projects/unknown/extra'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('Project Hub');
  });

  // --- Nesting: .html + .md (4 levels) ---

  test('nesting (.html+.md) — root level', async () => {
    const res = await fetch(baseUrl('/html/nesting'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('[nesting] .html BEFORE slot');
    expect(html).toContain('[nesting] .html AFTER slot');
  });

  test('nesting (.html+.md) — level 1', async () => {
    const res = await fetch(baseUrl('/html/nesting/lvl-one'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('[nesting] .html BEFORE slot');
    expect(html).toContain('[lvl-one] .html BEFORE slot');
    expect(html).toContain('[lvl-one] .html AFTER slot');
  });

  test('nesting (.html+.md) — level 2', async () => {
    const res = await fetch(baseUrl('/html/nesting/lvl-one/level-two'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('[nesting] .html BEFORE slot');
    expect(html).toContain('[lvl-one] .html BEFORE slot');
    expect(html).toContain('[level-two] .html BEFORE slot');
  });

  test('nesting (.html+.md) — level 3 (leaf)', async () => {
    const res = await fetch(baseUrl('/html/nesting/lvl-one/level-two/level-three'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('[nesting] .html BEFORE slot');
    expect(html).toContain('[lvl-one] .html BEFORE slot');
    expect(html).toContain('[level-two] .html BEFORE slot');
    expect(html).toContain('[level-three] .html BEFORE slot');
    expect(html).toContain('[level-three] .html AFTER slot');
  });

  // --- Nesting: .ts + .html (4 levels) ---

  test('nesting-ts-html (.ts+.html) — root level', async () => {
    const res = await fetch(baseUrl('/html/nesting-ts-html'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('[nesting-ts-html] .html BEFORE slot');
  });

  test('nesting-ts-html (.ts+.html) — level 1', async () => {
    const res = await fetch(baseUrl('/html/nesting-ts-html/lvl-one'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('[nesting-ts-html] .html BEFORE slot');
    expect(html).toContain('[lvl-one-ts-html] .html BEFORE slot');
  });

  test('nesting-ts-html (.ts+.html) — level 2', async () => {
    const res = await fetch(baseUrl('/html/nesting-ts-html/lvl-one/level-two'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('[nesting-ts-html] .html BEFORE slot');
    expect(html).toContain('[lvl-one-ts-html] .html BEFORE slot');
    expect(html).toContain('[level-two-ts-html] .html BEFORE slot');
  });

  test('nesting-ts-html (.ts+.html) — level 3 (leaf)', async () => {
    const res = await fetch(baseUrl('/html/nesting-ts-html/lvl-one/level-two/level-three'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('[nesting-ts-html] .html BEFORE slot');
    expect(html).toContain('[lvl-one-ts-html] .html BEFORE slot');
    expect(html).toContain('[level-two-ts-html] .html BEFORE slot');
    expect(html).toContain('[level-three-ts-html] .html');
  });

  // --- Nesting: .ts + .md (4 levels) ---

  test('nesting-ts-md (.ts+.md) — root level', async () => {
    const res = await fetch(baseUrl('/html/nesting-ts-md'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('[nesting-ts-md] .md BEFORE slot');
  });

  test('nesting-ts-md (.ts+.md) — level 1', async () => {
    const res = await fetch(baseUrl('/html/nesting-ts-md/lvl-one'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('[nesting-ts-md] .md BEFORE slot');
    expect(html).toContain('[lvl-one-ts-md] .md BEFORE slot');
  });

  test('nesting-ts-md (.ts+.md) — level 2', async () => {
    const res = await fetch(baseUrl('/html/nesting-ts-md/lvl-one/level-two'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('[nesting-ts-md] .md BEFORE slot');
    expect(html).toContain('[lvl-one-ts-md] .md BEFORE slot');
    expect(html).toContain('[level-two-ts-md] .md BEFORE slot');
  });

  test('nesting-ts-md (.ts+.md) — level 3 (leaf)', async () => {
    const res = await fetch(baseUrl('/html/nesting-ts-md/lvl-one/level-two/level-three'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('[nesting-ts-md] .md BEFORE slot');
    expect(html).toContain('[lvl-one-ts-md] .md BEFORE slot');
    expect(html).toContain('[level-two-ts-md] .md BEFORE slot');
    expect(html).toContain('[level-three-ts-md] .md');
  });

  // --- Nesting: .ts only parents + mixed leaves ---

  test('nesting-ts (ts-only parents) — typescript leaf', async () => {
    const res = await fetch(
      baseUrl('/html/nesting-ts/lvl-one/level-two/level-three/typescript'),
    );
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('[typescript-leaf] rendered by .ts renderHTML');
    expect(html.includes('BEFORE slot')).toBe(false);
  });

  test('nesting-ts (ts-only parents) — markdown leaf', async () => {
    const res = await fetch(
      baseUrl('/html/nesting-ts/lvl-one/level-two/level-three/markdown'),
    );
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('[markdown-leaf] rendered by .md file');
  });

  test('nesting-ts (ts-only parents) — html leaf', async () => {
    const res = await fetch(baseUrl('/html/nesting-ts/lvl-one/level-two/level-three/html'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('[html-leaf] rendered by .html file');
  });

  // --- Redirect ---

  test('redirect returns 302 with Location header', async () => {
    const res = await fetch(baseUrl('/html/old'), { redirect: 'manual' });
    expect(res.status).toEqual(302);
    const location = res.headers.get('location');
    expect(location).toContain('/html/about');
  });

  // --- 404 ---

  test('returns 404 for unknown routes', async () => {
    const res = await fetch(baseUrl('/html/nonexistent'));
    expect(res.status).toEqual(404);
    const html = await res.text();
    expect(html).toContain('Oops');
  });

  // --- Widgets in HTML: SSR rendering ---

  test('widgets in .page.html are rendered server-side with ssr attribute', async () => {
    const res = await fetch(baseUrl('/html/widgets-html'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('Widgets in HTML');
    expect(html).toContain('Hello, World!');
    expect(html.includes(' ssr ') || html.includes(' ssr>')).toBeTruthy();
    expect(html).toContain('Hello, Developer!');
    expect(html).toContain('SSR Widget');
    expect(html).toContain('Rendered on the server.');
    expect(html).toContain('<widget-failing');
  });

  // --- Widgets in Markdown: SSR rendering ---

  test('widgets in .page.md are rendered server-side via resolveWidgetTags', async () => {
    const res = await fetch(baseUrl('/html/widgets'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('Widgets in Markdown');
    expect(html).toContain('Hello, World!');
    expect(html).toContain('Hello, Developer!');
    expect(html).toContain('Widget Rendering');
  });

  // --- File-backed widgets: SSR rendering ---

  test('file-backed widget renders HTML from static file', async () => {
    const res = await fetch(baseUrl('/html/widget-files'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('Widget Files in HTML');
    expect(html).toContain('This HTML was loaded from a static file');
    expect(html.includes(' ssr ') || html.includes(' ssr>')).toBeTruthy();
    expect(html).toContain('Hello, World!');
  });

  test('remote widget renders HTML from absolute URL', async () => {
    const res = await fetch(baseUrl('/html/widget-files'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('This HTML was loaded from an absolute URL');
  });

  // --- CSS file injection: page ---

  test('.page.css injects <style> tag into SSR HTML', async () => {
    const res = await fetch(baseUrl('/html/about'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('<style>');
    expect(html).toContain('.about-page h1');
    expect(html).toContain('border-bottom');
    const styleIdx = html.indexOf('<style>');
    const h1Idx = html.indexOf('<h1>About</h1>');
    expect(styleIdx < h1Idx).toBeTruthy();
  });

  // --- CSS file injection: widget (local) ---

  test('file-backed widget with CSS injects @scope-wrapped <style> tag', async () => {
    const res = await fetch(baseUrl('/html/widget-files'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('<style>');
    expect(html).toContain('@scope (widget-file-widget)');
    expect(html).toContain('.widget-file');
    expect(html).toContain('border-radius');
  });

  // --- CSS file injection: widget (remote/absolute URL) ---

  test('remote widget with CSS injects <style> tag from absolute URL', async () => {
    const res = await fetch(baseUrl('/html/widget-files'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('.widget-remote');
    expect(html).toContain('border-left');
  });

  // --- Mixed widgets: auto-discovered + manual registry ---

  test('auto-discovered widget renders in mixed-widgets page', async () => {
    const res = await fetch(baseUrl('/html/mixed-widgets'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('<widget-greeting');
    expect(html.includes(' ssr ') || html.includes(' ssr>')).toBeTruthy();
  });

  test('lazy widget is still pre-rendered server-side', async () => {
    const res = await fetch(baseUrl('/html/mixed-widgets'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('<widget-greeting lazy');
    expect(html).toContain('Hello, Lazy!');
    expect(html.includes(' ssr ') || html.includes(' ssr>')).toBeTruthy();
  });

  test('manually-registered external widget renders in mixed-widgets page', async () => {
    const res = await fetch(baseUrl('/html/mixed-widgets'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('<widget-external');
    expect(html).toContain('External widget from manual-registry');
  });

  // --- main.css auto-injection ---

  test('main.css is auto-injected as <link> in <head>', async () => {
    const res = await fetch(baseUrl('/html/'));
    expect(res.status).toEqual(200);
    const html = await res.text();
    expect(html).toContain('<link rel="stylesheet" href="/main.css">');
    const linkIdx = html.indexOf('<link rel="stylesheet" href="/main.css">');
    const headEndIdx = html.indexOf('</head>');
    expect(linkIdx < headEndIdx).toBeTruthy();
  });

  // --- Error: getData throws ---

  test('getData() throw returns 500 with root error handler', async () => {
    const res = await fetch(baseUrl('/html/crash'));
    expect(res.status).toEqual(500);
    const html = await res.text();
    expect(html).toContain('Something Went Wrong');
  });
});

// ── SSR Markdown ─────────────────────────────────────────────────────

describe('SSR Markdown renderer', () => {
  beforeAll(async () => {
    server = await createTestServer({ mode: 'none', port: 4101 });
  });

  afterAll(() => {
    server.stop();
  });

  // --- .page.md ---

  test('.page.md returns raw markdown content', async () => {
    const res = await fetch(baseUrl('/md/'));
    expect(res.status).toEqual(200);
    expect(res.headers.get('content-type')).toEqual(
      'text/markdown; charset=utf-8; variant=CommonMark',
    );
    const md = await res.text();
    expect(md).toContain('# emroute');
    expect(md).toContain('[About](/html/about)');
  });

  // --- .page.html ---

  test('.page.html + .page.md returns markdown content', async () => {
    const res = await fetch(baseUrl('/md/about'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('About (from markdown)');
  });

  // --- .page.ts ---

  test('.page.ts component renders via renderMarkdown', async () => {
    const res = await fetch(baseUrl('/md/projects/42'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('# Project 42');
  });

  // --- .page.ts + .page.html (params) ---

  test('.page.ts + .page.html uses renderMarkdown override', async () => {
    const res = await fetch(baseUrl('/md/docs'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('# Docs');
  });

  // --- .page.ts + .page.html (getData) ---

  test('.page.ts + .page.html renders markdown from getData', async () => {
    const res = await fetch(baseUrl('/md/profile'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('# Alice');
    expect(md).toContain('Engineer');
  });

  // --- .page.ts + .page.md ---

  test('.page.ts + .page.md returns markdown from context', async () => {
    const res = await fetch(baseUrl('/md/blog'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('# Blog');
  });

  // --- Nested dynamic ---

  test('nested dynamic route renders full hierarchy', async () => {
    const res = await fetch(baseUrl('/md/projects/42/tasks'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('# Project 42');
    expect(md).toContain('# Tasks for 42');
    expect(md).toContain('- Task A for 42');
  });

  // --- Flat file vs directory index ---

  test('flat file renders exact match', async () => {
    const res = await fetch(baseUrl('/md/projects'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('All Projects');
  });

  test('directory index catches unmatched children', async () => {
    const res = await fetch(baseUrl('/md/projects/unknown/extra'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('Project Hub');
  });

  // --- Nesting: .html + .md (4 levels) ---

  test('nesting (.html+.md) — root level markdown', async () => {
    const res = await fetch(baseUrl('/md/nesting'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('[nesting] .md BEFORE slot');
    expect(md).toContain('[nesting] .md AFTER slot');
  });

  test('nesting (.html+.md) — level 1 markdown', async () => {
    const res = await fetch(baseUrl('/md/nesting/lvl-one'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('[nesting] .md BEFORE slot');
    expect(md).toContain('[lvl-one] .md BEFORE slot');
    expect(md).toContain('[lvl-one] .md AFTER slot');
  });

  test('nesting (.html+.md) — level 2 markdown', async () => {
    const res = await fetch(baseUrl('/md/nesting/lvl-one/level-two'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('[nesting] .md BEFORE slot');
    expect(md).toContain('[lvl-one] .md BEFORE slot');
    expect(md).toContain('[level-two] .md BEFORE slot');
  });

  test('nesting (.html+.md) — level 3 markdown (leaf)', async () => {
    const res = await fetch(baseUrl('/md/nesting/lvl-one/level-two/level-three'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('[nesting] .md BEFORE slot');
    expect(md).toContain('[lvl-one] .md BEFORE slot');
    expect(md).toContain('[level-two] .md BEFORE slot');
    expect(md).toContain('[level-three] .md');
  });

  // --- Nesting: .ts + .html (no .md) — expected root-only behavior ---

  test('nesting-ts-html (.ts+.html, no .md) — root only visible', async () => {
    const res = await fetch(baseUrl('/md/nesting-ts-html'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md.includes('[nesting-ts-html] .md BEFORE slot')).toBe(false);
  });

  test('nesting-ts-html — level 1 (root-only expected)', async () => {
    const res = await fetch(baseUrl('/md/nesting-ts-html/lvl-one'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md.includes('[lvl-one] .md BEFORE slot')).toBe(false);
  });

  // --- Nesting: .ts + .md (4 levels) ---

  test('nesting-ts-md (.ts+.md) — root level markdown', async () => {
    const res = await fetch(baseUrl('/md/nesting-ts-md'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('[nesting-ts-md] .md BEFORE slot');
  });

  test('nesting-ts-md (.ts+.md) — level 1 markdown', async () => {
    const res = await fetch(baseUrl('/md/nesting-ts-md/lvl-one'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('[nesting-ts-md] .md BEFORE slot');
    expect(md).toContain('[lvl-one-ts-md] .md BEFORE slot');
  });

  test('nesting-ts-md (.ts+.md) — level 2 markdown', async () => {
    const res = await fetch(baseUrl('/md/nesting-ts-md/lvl-one/level-two'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('[nesting-ts-md] .md BEFORE slot');
    expect(md).toContain('[lvl-one-ts-md] .md BEFORE slot');
    expect(md).toContain('[level-two-ts-md] .md BEFORE slot');
  });

  test('nesting-ts-md (.ts+.md) — level 3 markdown (leaf)', async () => {
    const res = await fetch(baseUrl('/md/nesting-ts-md/lvl-one/level-two/level-three'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('[nesting-ts-md] .md BEFORE slot');
    expect(md).toContain('[lvl-one-ts-md] .md BEFORE slot');
    expect(md).toContain('[level-two-ts-md] .md BEFORE slot');
    expect(md).toContain('[level-three-ts-md] .md');
  });

  // --- Nesting: .ts only parents + mixed leaves ---

  test('nesting-ts (ts-only parents) — typescript leaf markdown', async () => {
    const res = await fetch(
      baseUrl('/md/nesting-ts/lvl-one/level-two/level-three/typescript'),
    );
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('[typescript-leaf] rendered by .ts renderMarkdown');
  });

  test('nesting-ts (ts-only parents) — markdown leaf', async () => {
    const res = await fetch(
      baseUrl('/md/nesting-ts/lvl-one/level-two/level-three/markdown'),
    );
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('[markdown-leaf] rendered by .md file');
  });

  test('nesting-ts (ts-only parents) — html leaf (no .md, root-only)', async () => {
    const res = await fetch(baseUrl('/md/nesting-ts/lvl-one/level-two/level-three/html'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md.includes('[html-leaf] .md')).toBe(false);
  });

  // --- Redirect ---

  test('redirect returns 302 with Location header', async () => {
    const res = await fetch(baseUrl('/md/old'), { redirect: 'manual' });
    expect(res.status).toEqual(302);
    const location = res.headers.get('location');
    expect(location).toContain('/md/about');
  });

  // --- 404 ---

  test('returns 404 for unknown routes', async () => {
    const res = await fetch(baseUrl('/md/nonexistent'));
    expect(res.status).toEqual(404);
    const md = await res.text();
    expect(md).toContain('Oops');
  });

  // --- Widgets in Markdown: SSR rendering ---

  test('widgets in .page.md are resolved to renderMarkdown() output', async () => {
    const res = await fetch(baseUrl('/md/widgets'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('Widgets in Markdown');
    expect(md).toContain('Hello, World!');
    expect(md).toContain('Hello, Developer!');
    expect(md).toContain('[SSR] Widget Rendering');
    expect(md.includes('Widget data fetch failed') || md.includes('Error')).toBeTruthy();
    expect(md.includes('```widget:')).toBe(false);
  });

  // --- File-backed widgets: SSR markdown rendering ---

  test('file-backed widget renders markdown from static file', async () => {
    const res = await fetch(baseUrl('/md/widget-files-md'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('Widget Files in Markdown');
    expect(md).toContain('This markdown was loaded from a static file');
    expect(md).toContain('Hello, World!');
    expect(md.includes('```widget:')).toBe(false);
  });

  // --- Mixed widgets: auto-discovered + manual registry (markdown) ---

  test('mixed widgets render in markdown SSR', async () => {
    const res = await fetch(baseUrl('/md/mixed-widgets'));
    expect(res.status).toEqual(200);
    const md = await res.text();
    expect(md).toContain('Hello, World!');
    expect(md).toContain('External widget from manual-registry');
  });

  // --- Error: getData throws ---

  test('getData() throw returns 500 with root error handler', async () => {
    const res = await fetch(baseUrl('/md/crash'));
    expect(res.status).toEqual(500);
    const md = await res.text();
    expect(md).toContain('Something Went Wrong');
  });
});
