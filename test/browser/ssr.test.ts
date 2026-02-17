/**
 * SSR Renderers — Integration Tests
 *
 * Tests SSR HTML (/html/*) and SSR Markdown (/md/*) renderers
 * against the dev server using the same fixtures as the SPA tests.
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

import { assert, assertEquals } from '@std/assert';
import { baseUrl, startServer, stopServer } from './setup.ts';

// ── SSR HTML ─────────────────────────────────────────────────────────

Deno.test(
  { name: 'SSR HTML renderer', sanitizeResources: false, sanitizeOps: false },
  async (t) => {
    await startServer();

    // --- .page.md ---

    await t.step('.page.md renders expanded markdown as HTML', async () => {
      const res = await fetch(baseUrl('/html/'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(
        !html.includes('<mark-down>'),
        'should expand <mark-down> when renderer is configured',
      );
      assert(html.includes('emroute'), 'should contain rendered heading');
    });

    // --- .page.html ---

    await t.step('.page.html renders HTML content directly', async () => {
      const res = await fetch(baseUrl('/html/about'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('<h1>About</h1>'), 'should contain About heading');
      assert(html.includes('About Page'), 'should contain title text');
      assert(html.includes('section-1'), 'should contain section anchor');
      assert(
        html.includes('<widget-failing'),
        'should contain failing widget tag (left as-is because getData throws)',
      );
    });

    // --- .page.ts ---

    await t.step('.page.ts component renders with getData', async () => {
      const res = await fetch(baseUrl('/html/projects/42'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('Project 42'), 'should contain project name');
      assert(html.includes('ID: 42'), 'should contain project ID');
    });

    // --- .page.ts + .page.html (params) ---

    await t.step('.page.ts + .page.html replaces template slots from params', async () => {
      const res = await fetch(baseUrl('/html/docs'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('Topic: general'), 'should replace {{topic}} in template');
      assert(html.includes('Documentation'), 'should include getTitle result');
    });

    // --- .page.ts + .page.html (getData) ---

    await t.step('.page.ts + .page.html injects getData into template', async () => {
      const res = await fetch(baseUrl('/html/profile'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('Alice'), 'should contain name from getData');
      assert(html.includes('Role: Engineer'), 'should contain role');
      assert(html.includes('Builds things.'), 'should contain bio');
    });

    // --- .page.ts + .page.md ---

    await t.step('.page.ts + .page.md renders markdown + custom content', async () => {
      const res = await fetch(baseUrl('/html/blog'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('Blog'), 'should contain expanded markdown heading');
      assert(html.includes('Posts: 0'), 'should contain blog footer');
    });

    // --- Nested dynamic ---

    await t.step('nested dynamic route renders full hierarchy', async () => {
      const res = await fetch(baseUrl('/html/projects/42/tasks'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('Project 42'), 'should contain parent project');
      assert(html.includes('Tasks for 42'), 'should contain tasks heading');
      assert(html.includes('Task A for 42'), 'should contain task items');
    });

    // --- Flat file vs directory index ---

    await t.step('flat file renders exact match', async () => {
      const res = await fetch(baseUrl('/html/projects'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('All Projects'), 'should contain flat file content');
    });

    await t.step('directory index catches unmatched children', async () => {
      const res = await fetch(baseUrl('/html/projects/unknown/extra'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('Project Hub'), 'should contain directory index content');
    });

    // --- Nesting: .html + .md (4 levels) ---

    await t.step('nesting (.html+.md) — root level', async () => {
      const res = await fetch(baseUrl('/html/nesting'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('[nesting] .html BEFORE slot'), 'should contain nesting root content');
      assert(html.includes('[nesting] .html AFTER slot'), 'should contain nesting root footer');
    });

    await t.step('nesting (.html+.md) — level 1', async () => {
      const res = await fetch(baseUrl('/html/nesting/lvl-one'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('[nesting] .html BEFORE slot'), 'should contain root wrapper');
      assert(html.includes('[lvl-one] .html BEFORE slot'), 'should contain lvl-one content');
      assert(html.includes('[lvl-one] .html AFTER slot'), 'should contain lvl-one footer');
    });

    await t.step('nesting (.html+.md) — level 2', async () => {
      const res = await fetch(baseUrl('/html/nesting/lvl-one/level-two'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('[nesting] .html BEFORE slot'), 'should contain root wrapper');
      assert(html.includes('[lvl-one] .html BEFORE slot'), 'should contain lvl-one wrapper');
      assert(html.includes('[level-two] .html BEFORE slot'), 'should contain level-two content');
    });

    await t.step('nesting (.html+.md) — level 3 (leaf)', async () => {
      const res = await fetch(baseUrl('/html/nesting/lvl-one/level-two/level-three'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('[nesting] .html BEFORE slot'), 'should contain root wrapper');
      assert(html.includes('[lvl-one] .html BEFORE slot'), 'should contain lvl-one wrapper');
      assert(html.includes('[level-two] .html BEFORE slot'), 'should contain level-two wrapper');
      assert(
        html.includes('[level-three] .html BEFORE slot'),
        'should contain level-three leaf content',
      );
      assert(
        html.includes('[level-three] .html AFTER slot'),
        'leaf should have both before/after markers',
      );
    });

    // --- Nesting: .ts + .html (4 levels) ---

    await t.step('nesting-ts-html (.ts+.html) — root level', async () => {
      const res = await fetch(baseUrl('/html/nesting-ts-html'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(
        html.includes('[nesting-ts-html] .html BEFORE slot'),
        'should contain root content',
      );
    });

    await t.step('nesting-ts-html (.ts+.html) — level 1', async () => {
      const res = await fetch(baseUrl('/html/nesting-ts-html/lvl-one'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(
        html.includes('[nesting-ts-html] .html BEFORE slot'),
        'should contain root wrapper',
      );
      assert(
        html.includes('[lvl-one-ts-html] .html BEFORE slot'),
        'should contain lvl-one content',
      );
    });

    await t.step('nesting-ts-html (.ts+.html) — level 2', async () => {
      const res = await fetch(baseUrl('/html/nesting-ts-html/lvl-one/level-two'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(
        html.includes('[nesting-ts-html] .html BEFORE slot'),
        'should contain root wrapper',
      );
      assert(
        html.includes('[lvl-one-ts-html] .html BEFORE slot'),
        'should contain lvl-one wrapper',
      );
      assert(
        html.includes('[level-two-ts-html] .html BEFORE slot'),
        'should contain level-two content',
      );
    });

    await t.step('nesting-ts-html (.ts+.html) — level 3 (leaf)', async () => {
      const res = await fetch(baseUrl('/html/nesting-ts-html/lvl-one/level-two/level-three'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(
        html.includes('[nesting-ts-html] .html BEFORE slot'),
        'should contain root wrapper',
      );
      assert(
        html.includes('[lvl-one-ts-html] .html BEFORE slot'),
        'should contain lvl-one wrapper',
      );
      assert(
        html.includes('[level-two-ts-html] .html BEFORE slot'),
        'should contain level-two wrapper',
      );
      assert(
        html.includes('[level-three-ts-html] .html'),
        'should contain level-three leaf content',
      );
    });

    // --- Nesting: .ts + .md (4 levels) ---

    await t.step('nesting-ts-md (.ts+.md) — root level', async () => {
      const res = await fetch(baseUrl('/html/nesting-ts-md'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('[nesting-ts-md] .md BEFORE slot'), 'should contain root content');
    });

    await t.step('nesting-ts-md (.ts+.md) — level 1', async () => {
      const res = await fetch(baseUrl('/html/nesting-ts-md/lvl-one'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('[nesting-ts-md] .md BEFORE slot'), 'should contain root wrapper');
      assert(html.includes('[lvl-one-ts-md] .md BEFORE slot'), 'should contain lvl-one content');
    });

    await t.step('nesting-ts-md (.ts+.md) — level 2', async () => {
      const res = await fetch(baseUrl('/html/nesting-ts-md/lvl-one/level-two'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('[nesting-ts-md] .md BEFORE slot'), 'should contain root wrapper');
      assert(html.includes('[lvl-one-ts-md] .md BEFORE slot'), 'should contain lvl-one wrapper');
      assert(
        html.includes('[level-two-ts-md] .md BEFORE slot'),
        'should contain level-two content',
      );
    });

    await t.step('nesting-ts-md (.ts+.md) — level 3 (leaf)', async () => {
      const res = await fetch(baseUrl('/html/nesting-ts-md/lvl-one/level-two/level-three'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('[nesting-ts-md] .md BEFORE slot'), 'should contain root wrapper');
      assert(html.includes('[lvl-one-ts-md] .md BEFORE slot'), 'should contain lvl-one wrapper');
      assert(
        html.includes('[level-two-ts-md] .md BEFORE slot'),
        'should contain level-two wrapper',
      );
      assert(html.includes('[level-three-ts-md] .md'), 'should contain level-three leaf content');
    });

    // --- Nesting: .ts only parents + mixed leaves ---

    await t.step('nesting-ts (ts-only parents) — typescript leaf', async () => {
      const res = await fetch(
        baseUrl('/html/nesting-ts/lvl-one/level-two/level-three/typescript'),
      );
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(
        html.includes('[typescript-leaf] rendered by .ts renderHTML'),
        'should render typescript leaf via renderHTML override',
      );
      assert(
        !html.includes('BEFORE slot'),
        'ts-only parents should be transparent passthrough',
      );
    });

    await t.step('nesting-ts (ts-only parents) — markdown leaf', async () => {
      const res = await fetch(
        baseUrl('/html/nesting-ts/lvl-one/level-two/level-three/markdown'),
      );
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(
        html.includes('[markdown-leaf] rendered by .md file'),
        'should render markdown leaf content',
      );
    });

    await t.step('nesting-ts (ts-only parents) — html leaf', async () => {
      const res = await fetch(baseUrl('/html/nesting-ts/lvl-one/level-two/level-three/html'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(
        html.includes('[html-leaf] rendered by .html file'),
        'should render html leaf content',
      );
    });

    // --- Redirect ---

    await t.step('redirect returns meta refresh', async () => {
      const res = await fetch(baseUrl('/html/old'), { redirect: 'manual' });
      assertEquals(res.status, 302);
      const html = await res.text();
      assert(html.includes('http-equiv="refresh"'), 'should contain meta refresh');
      assert(html.includes('/about'), 'should contain redirect target');
    });

    // --- 404 ---

    await t.step('returns 404 for unknown routes', async () => {
      const res = await fetch(baseUrl('/html/nonexistent'));
      assertEquals(res.status, 404);
      const html = await res.text();
      assert(html.includes('Oops'), 'should contain custom 404 page content');
    });

    // --- Widgets in HTML: SSR rendering ---

    await t.step('widgets in .page.html are rendered server-side with data-ssr', async () => {
      const res = await fetch(baseUrl('/html/widgets-html'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('Widgets in HTML'), 'should contain page title');
      // Greeting widget (no params) should be rendered with data-ssr
      assert(html.includes('Hello, World!'), 'should render greeting widget with default name');
      assert(html.includes('data-ssr='), 'should have data-ssr attribute on rendered widgets');
      // Greeting widget (with name param) should use the param
      assert(html.includes('Hello, Developer!'), 'should render greeting widget with name param');
      // Info card widget should be rendered
      assert(html.includes('SSR Widget'), 'should render info card title');
      assert(html.includes('Rendered on the server.'), 'should render info card description');
      // Failing widget should be left as-is (getData throws)
      assert(html.includes('<widget-failing'), 'should leave failing widget as-is');
    });

    // --- Widgets in Markdown: SSR rendering ---

    await t.step('widgets in .page.md are rendered server-side via resolveWidgetTags', async () => {
      const res = await fetch(baseUrl('/html/widgets'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('Widgets in Markdown'), 'should contain page heading');
      // After markdown expansion, widget fenced blocks become <widget-*> elements
      // Then resolveWidgetTags renders them with data-ssr
      assert(html.includes('Hello, World!'), 'should render greeting widget (no params)');
      assert(html.includes('Hello, Developer!'), 'should render greeting widget (with name)');
      assert(html.includes('Widget Rendering'), 'should render info card title');
    });

    // --- File-backed widgets: SSR rendering ---

    await t.step('file-backed widget renders HTML from static file', async () => {
      const res = await fetch(baseUrl('/html/widget-files'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('Widget Files in HTML'), 'should contain page title');
      // File widget should have loaded its HTML from the static file
      assert(
        html.includes('This HTML was loaded from a static file'),
        'should render file widget from static HTML file',
      );
      assert(html.includes('data-ssr='), 'file widget should have data-ssr attribute');
      // Greeting widget (no files) should still work as before
      assert(html.includes('Hello, World!'), 'greeting widget without files still works');
    });

    await t.step('remote widget renders HTML from absolute URL', async () => {
      const res = await fetch(baseUrl('/html/widget-files'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(
        html.includes('This HTML was loaded from an absolute URL'),
        'should render remote widget from absolute URL',
      );
    });

    // --- CSS file injection: page ---

    await t.step('.page.css injects <style> tag into SSR HTML', async () => {
      const res = await fetch(baseUrl('/html/about'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('<style>'), 'should contain <style> tag from .page.css');
      assert(html.includes('.about-page h1'), 'should contain CSS content from about.page.css');
      assert(html.includes('border-bottom'), 'should contain full CSS rule');
      // Style should appear before the HTML content
      const styleIdx = html.indexOf('<style>');
      const h1Idx = html.indexOf('<h1>About</h1>');
      assert(styleIdx < h1Idx, '<style> should appear before page content');
    });

    // --- CSS file injection: widget (local) ---

    await t.step('file-backed widget with CSS injects @scope-wrapped <style> tag', async () => {
      const res = await fetch(baseUrl('/html/widget-files'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('<style>'), 'should contain <style> tag from widget CSS');
      assert(
        html.includes('@scope (widget-file-widget)'),
        'should wrap CSS in @scope for widget element',
      );
      assert(html.includes('.widget-file'), 'should contain local widget CSS content');
      assert(html.includes('border-radius'), 'should contain full CSS rule from local file');
    });

    // --- CSS file injection: widget (remote/absolute URL) ---

    await t.step('remote widget with CSS injects <style> tag from absolute URL', async () => {
      const res = await fetch(baseUrl('/html/widget-files'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(html.includes('.widget-remote'), 'should contain remote widget CSS content');
      assert(html.includes('border-left'), 'should contain full CSS rule from remote file');
    });

    // --- Mixed widgets: auto-discovered + manual registry ---

    await t.step('auto-discovered widget renders in mixed-widgets page', async () => {
      const res = await fetch(baseUrl('/html/mixed-widgets'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(
        html.includes('<widget-greeting'),
        'should contain auto-discovered greeting widget tag',
      );
      assert(html.includes('data-ssr='), 'greeting widget should have SSR data');
    });

    await t.step('lazy widget is still pre-rendered server-side', async () => {
      const res = await fetch(baseUrl('/html/mixed-widgets'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(
        html.includes('<widget-greeting lazy'),
        'should preserve lazy attribute on widget tag',
      );
      assert(html.includes('Hello, Lazy!'), 'SSR should render lazy widget content');
      assert(html.includes('data-ssr='), 'lazy widget should have data-ssr attribute');
    });

    await t.step('manually-registered external widget renders in mixed-widgets page', async () => {
      const res = await fetch(baseUrl('/html/mixed-widgets'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(
        html.includes('<widget-external'),
        'should contain manually-registered external widget tag',
      );
      assert(
        html.includes('External widget from manual-registry'),
        'external widget should render with SSR content',
      );
    });

    // --- main.css auto-injection ---

    await t.step('main.css is auto-injected as <link> in <head>', async () => {
      const res = await fetch(baseUrl('/html/'));
      assertEquals(res.status, 200);
      const html = await res.text();
      assert(
        html.includes('<link rel="stylesheet" href="/main.css">'),
        'should contain <link> for main.css',
      );
      const linkIdx = html.indexOf('<link rel="stylesheet" href="/main.css">');
      const headEndIdx = html.indexOf('</head>');
      assert(linkIdx < headEndIdx, 'main.css link should appear inside <head>');
    });

    // --- Error: getData throws ---

    await t.step('getData() throw returns 500 with root error handler', async () => {
      const res = await fetch(baseUrl('/html/crash'));
      assertEquals(res.status, 500);
      const html = await res.text();
      assert(html.includes('Something Went Wrong'), 'should render root error handler');
    });

    await stopServer();
  },
);

// ── SSR Markdown ─────────────────────────────────────────────────────

Deno.test(
  { name: 'SSR Markdown renderer', sanitizeResources: false, sanitizeOps: false },
  async (t) => {
    await startServer();

    // --- .page.md ---

    await t.step('.page.md returns raw markdown content', async () => {
      const res = await fetch(baseUrl('/md/'));
      assertEquals(res.status, 200);
      assertEquals(
        res.headers.get('content-type'),
        'text/markdown; charset=utf-8; variant=CommonMark',
      );
      const md = await res.text();
      assert(md.includes('# emroute'), 'should contain markdown heading');
      assert(
        md.includes('[About](/html/about)'),
        'should contain markdown link with /html/ prefix',
      );
    });

    // --- .page.html ---

    await t.step('.page.html + .page.md returns markdown content', async () => {
      const res = await fetch(baseUrl('/md/about'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('About (from markdown)'), 'should contain markdown file content');
    });

    // --- .page.ts ---

    await t.step('.page.ts component renders via renderMarkdown', async () => {
      const res = await fetch(baseUrl('/md/projects/42'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('# Project 42'), 'should contain project heading');
    });

    // --- .page.ts + .page.html (params) ---

    await t.step('.page.ts + .page.html uses renderMarkdown override', async () => {
      const res = await fetch(baseUrl('/md/docs'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('# Docs'), 'should contain docs markdown from override');
    });

    // --- .page.ts + .page.html (getData) ---

    await t.step('.page.ts + .page.html renders markdown from getData', async () => {
      const res = await fetch(baseUrl('/md/profile'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('# Alice'), 'should contain name from getData');
      assert(md.includes('Engineer'), 'should contain role');
    });

    // --- .page.ts + .page.md ---

    await t.step('.page.ts + .page.md returns markdown from context', async () => {
      const res = await fetch(baseUrl('/md/blog'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('# Blog'), 'should contain blog heading from md file');
    });

    // --- Nested dynamic ---

    await t.step('nested dynamic route renders full hierarchy', async () => {
      const res = await fetch(baseUrl('/md/projects/42/tasks'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('# Project 42'), 'should contain parent project');
      assert(md.includes('# Tasks for 42'), 'should contain tasks heading');
      assert(md.includes('- Task A for 42'), 'should contain task items');
    });

    // --- Flat file vs directory index ---

    await t.step('flat file renders exact match', async () => {
      const res = await fetch(baseUrl('/md/projects'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('All Projects'), 'should contain flat file content');
    });

    await t.step('directory index catches unmatched children', async () => {
      const res = await fetch(baseUrl('/md/projects/unknown/extra'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('Project Hub'), 'should contain directory index content');
    });

    // --- Nesting: .html + .md (4 levels) ---

    await t.step('nesting (.html+.md) — root level markdown', async () => {
      const res = await fetch(baseUrl('/md/nesting'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(
        md.includes('[nesting] .md BEFORE slot'),
        'should contain nesting root markdown content',
      );
      assert(
        md.includes('[nesting] .md AFTER slot'),
        'should contain nesting root markdown footer',
      );
    });

    await t.step('nesting (.html+.md) — level 1 markdown', async () => {
      const res = await fetch(baseUrl('/md/nesting/lvl-one'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('[nesting] .md BEFORE slot'), 'should contain root wrapper');
      assert(md.includes('[lvl-one] .md BEFORE slot'), 'should contain lvl-one markdown');
      assert(md.includes('[lvl-one] .md AFTER slot'), 'should contain lvl-one footer');
    });

    await t.step('nesting (.html+.md) — level 2 markdown', async () => {
      const res = await fetch(baseUrl('/md/nesting/lvl-one/level-two'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('[nesting] .md BEFORE slot'), 'should contain root wrapper');
      assert(md.includes('[lvl-one] .md BEFORE slot'), 'should contain lvl-one wrapper');
      assert(md.includes('[level-two] .md BEFORE slot'), 'should contain level-two markdown');
    });

    await t.step('nesting (.html+.md) — level 3 markdown (leaf)', async () => {
      const res = await fetch(baseUrl('/md/nesting/lvl-one/level-two/level-three'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('[nesting] .md BEFORE slot'), 'should contain root wrapper');
      assert(md.includes('[lvl-one] .md BEFORE slot'), 'should contain lvl-one wrapper');
      assert(md.includes('[level-two] .md BEFORE slot'), 'should contain level-two wrapper');
      assert(md.includes('[level-three] .md'), 'should contain level-three leaf markdown');
    });

    // --- Nesting: .ts + .html (no .md) — expected root-only behavior ---

    await t.step('nesting-ts-html (.ts+.html, no .md) — root only visible', async () => {
      const res = await fetch(baseUrl('/md/nesting-ts-html'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(
        md.includes('[nesting-ts-html] .md BEFORE slot') === false,
        'should not have markdown content (no .md file)',
      );
      // Expected: falls back to router-slot placeholder with no visible content
    });

    await t.step('nesting-ts-html — level 1 (root-only expected)', async () => {
      const res = await fetch(baseUrl('/md/nesting-ts-html/lvl-one'));
      assertEquals(res.status, 200);
      const md = await res.text();
      // Expected: pages without .md files produce invisible slot placeholders
      // Only root page's markdown is visible (if any)
      const hasNoVisibleNesting = !md.includes('[lvl-one] .md BEFORE slot');
      assert(
        hasNoVisibleNesting,
        'level without .md file should be invisible in SSR Markdown',
      );
    });

    // --- Nesting: .ts + .md (4 levels) ---

    await t.step('nesting-ts-md (.ts+.md) — root level markdown', async () => {
      const res = await fetch(baseUrl('/md/nesting-ts-md'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(
        md.includes('[nesting-ts-md] .md BEFORE slot'),
        'should contain root markdown content',
      );
    });

    await t.step('nesting-ts-md (.ts+.md) — level 1 markdown', async () => {
      const res = await fetch(baseUrl('/md/nesting-ts-md/lvl-one'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('[nesting-ts-md] .md BEFORE slot'), 'should contain root wrapper');
      assert(md.includes('[lvl-one-ts-md] .md BEFORE slot'), 'should contain lvl-one markdown');
    });

    await t.step('nesting-ts-md (.ts+.md) — level 2 markdown', async () => {
      const res = await fetch(baseUrl('/md/nesting-ts-md/lvl-one/level-two'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('[nesting-ts-md] .md BEFORE slot'), 'should contain root wrapper');
      assert(md.includes('[lvl-one-ts-md] .md BEFORE slot'), 'should contain lvl-one wrapper');
      assert(md.includes('[level-two-ts-md] .md BEFORE slot'), 'should contain level-two markdown');
    });

    await t.step('nesting-ts-md (.ts+.md) — level 3 markdown (leaf)', async () => {
      const res = await fetch(baseUrl('/md/nesting-ts-md/lvl-one/level-two/level-three'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('[nesting-ts-md] .md BEFORE slot'), 'should contain root wrapper');
      assert(md.includes('[lvl-one-ts-md] .md BEFORE slot'), 'should contain lvl-one wrapper');
      assert(md.includes('[level-two-ts-md] .md BEFORE slot'), 'should contain level-two wrapper');
      assert(md.includes('[level-three-ts-md] .md'), 'should contain level-three leaf markdown');
    });

    // --- Nesting: .ts only parents + mixed leaves ---

    await t.step('nesting-ts (ts-only parents) — typescript leaf markdown', async () => {
      const res = await fetch(
        baseUrl('/md/nesting-ts/lvl-one/level-two/level-three/typescript'),
      );
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(
        md.includes('[typescript-leaf] rendered by .ts renderMarkdown'),
        'should render typescript leaf via renderMarkdown override',
      );
    });

    await t.step('nesting-ts (ts-only parents) — markdown leaf', async () => {
      const res = await fetch(
        baseUrl('/md/nesting-ts/lvl-one/level-two/level-three/markdown'),
      );
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(
        md.includes('[markdown-leaf] rendered by .md file'),
        'should render markdown leaf content',
      );
    });

    await t.step('nesting-ts (ts-only parents) — html leaf (no .md, root-only)', async () => {
      const res = await fetch(baseUrl('/md/nesting-ts/lvl-one/level-two/level-three/html'));
      assertEquals(res.status, 200);
      const md = await res.text();
      // Expected: html-only leaf has no .md file, produces invisible slot placeholder
      const hasNoVisibleContent = !md.includes('[html-leaf] .md');
      assert(hasNoVisibleContent, 'html-only leaf should be invisible in SSR Markdown');
    });

    // --- Redirect ---

    await t.step('redirect returns plain text with target', async () => {
      const res = await fetch(baseUrl('/md/old'), { redirect: 'manual' });
      assertEquals(res.status, 302);
      const md = await res.text();
      assert(md.includes('/about'), 'should contain redirect target');
    });

    // --- 404 ---

    await t.step('returns 404 for unknown routes', async () => {
      const res = await fetch(baseUrl('/md/nonexistent'));
      assertEquals(res.status, 404);
      const md = await res.text();
      assert(md.includes('Oops'), 'should contain custom 404 page content');
    });

    // --- Widgets in Markdown: SSR rendering ---

    await t.step('widgets in .page.md are resolved to renderMarkdown() output', async () => {
      const res = await fetch(baseUrl('/md/widgets'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('Widgets in Markdown'), 'should contain page heading');
      // Fenced widget blocks should be replaced with renderMarkdown() output
      assert(md.includes('Hello, World!'), 'should resolve greeting widget (no params)');
      assert(md.includes('Hello, Developer!'), 'should resolve greeting widget (with name)');
      assert(
        md.includes('[SSR] Widget Rendering'),
        'should resolve info card with badge and title',
      );
      // Failing widget should show error output
      assert(
        md.includes('Widget data fetch failed') || md.includes('Error'),
        'should show error for failing widget',
      );
      // No fenced widget blocks should remain
      assert(!md.includes('```widget:'), 'should have no unresolved widget blocks');
    });

    // --- File-backed widgets: SSR markdown rendering ---

    await t.step('file-backed widget renders markdown from static file', async () => {
      const res = await fetch(baseUrl('/md/widget-files-md'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('Widget Files in Markdown'), 'should contain page heading');
      // File widget should render its md file content
      assert(
        md.includes('This markdown was loaded from a static file'),
        'should render file widget from static MD file',
      );
      // Greeting widget (no files) should still work
      assert(md.includes('Hello, World!'), 'greeting widget without files still works');
      // No unresolved widget blocks should remain
      assert(!md.includes('```widget:'), 'should have no unresolved widget blocks');
    });

    // --- Mixed widgets: auto-discovered + manual registry (markdown) ---

    await t.step('mixed widgets render in markdown SSR', async () => {
      const res = await fetch(baseUrl('/md/mixed-widgets'));
      assertEquals(res.status, 200);
      const md = await res.text();
      assert(md.includes('Hello, World!'), 'auto-discovered greeting widget should render');
      assert(
        md.includes('External widget from manual-registry'),
        'manually-registered external widget should render',
      );
    });

    // --- Error: getData throws ---

    await t.step('getData() throw returns 500 with root error handler', async () => {
      const res = await fetch(baseUrl('/md/crash'));
      assertEquals(res.status, 500);
      const md = await res.text();
      assert(md.includes('Something Went Wrong'), 'should render root error handler');
    });

    await stopServer();
  },
);
