/**
 * Unit tests for PageComponent
 *
 * Tests cover the renderHTML and renderMarkdown fallback chains based on
 * file presence (.html, .md, .css). Uses mocked ComponentContext with
 * various file combinations to verify:
 *
 * - renderHTML fallback chain: .html → .md wrapper + slot → bare slot
 * - renderMarkdown fallback chain: .md → router-slot placeholder
 * - Slot injection in both modes
 * - CSS inclusion when present
 * - HTML escaping in markdown content
 *
 * Fallback table from nesting.md:
 * | Files present   | renderHTML()           | renderMarkdown()      |
 * | --------------- | ---------------------- | --------------------- |
 * | .html + .md     | HTML file              | Markdown file         |
 * | .html only      | HTML file              | router-slot placeholder |
 * | .md only        | <mark-down> + slot     | Markdown file         |
 * | Neither         | Bare <router-slot>     | router-slot placeholder |
 */

import { assertEquals, assertStringIncludes } from '@std/assert';
import type { ComponentContext } from '../../src/component/abstract.component.ts';
import { PageComponent } from '../../src/component/page.component.ts';

// ============================================================================
// Test Fixtures & Helpers
// ============================================================================

/**
 * Create a mock ComponentContext with optional file content
 */
function createMockContext(
  overrides?: Partial<ComponentContext>,
): ComponentContext {
  return {
    pathname: '/test',
    pattern: '/test',
    params: {},
    searchParams: new URLSearchParams(),
    ...overrides,
  };
}

/**
 * Render args with minimal data
 */
function createRenderArgs(context?: ComponentContext) {
  return {
    data: null,
    params: {},
    context: context ?? createMockContext(),
  };
}

// ============================================================================
// renderHTML Fallback Chain Tests
// ============================================================================

Deno.test('renderHTML - .html + .md: returns HTML file content', () => {
  const htmlContent = '<div class="page">HTML Content</div>';
  const mdContent = '# Markdown Content';
  const context = createMockContext({
    files: { html: htmlContent, md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  assertEquals(result, htmlContent);
});

Deno.test('renderHTML - .html + .md: HTML file takes precedence over md', () => {
  const htmlContent = '<p>HTML wins</p>';
  const mdContent = '# Markdown loses';
  const context = createMockContext({
    files: { html: htmlContent, md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  assertEquals(result, htmlContent);
  assertEquals(result.includes('Markdown loses'), false);
});

Deno.test('renderHTML - .html only: returns HTML file content', () => {
  const htmlContent = '<section>Only HTML</section>';
  const context = createMockContext({
    files: { html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  assertEquals(result, htmlContent);
});

Deno.test('renderHTML - .md only: wraps markdown in <mark-down> and includes slot', () => {
  const mdContent = '# Page Title\n\nPage body';
  const context = createMockContext({
    files: { md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  assertStringIncludes(result, '<mark-down>');
  assertStringIncludes(result, '</mark-down>');
  assertStringIncludes(result, '<router-slot></router-slot>');
  // Markdown content should be included (it gets HTML escaped)
  assertStringIncludes(result, '# Page Title');
});

Deno.test('renderHTML - .md only: escapes markdown content', () => {
  const mdContent = '<script>alert("xss")</script>';
  const context = createMockContext({
    files: { md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  assertStringIncludes(result, '&lt;script&gt;');
  assertStringIncludes(result, '&lt;/script&gt;');
  assertEquals(result.includes('<script>'), false);
});

Deno.test('renderHTML - Neither .html nor .md: returns bare <router-slot>', () => {
  const context = createMockContext({
    files: {},
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  assertEquals(result, '<router-slot></router-slot>');
});

Deno.test('renderHTML - No files object: returns bare <router-slot>', () => {
  const context = createMockContext({});

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  assertEquals(result, '<router-slot></router-slot>');
});

// ============================================================================
// CSS Inclusion Tests
// ============================================================================

Deno.test('renderHTML - CSS file: prepends <style> tag to HTML', () => {
  const cssContent = '.page { color: blue; }';
  const htmlContent = '<div>Styled</div>';
  const context = createMockContext({
    files: { css: cssContent, html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  assertStringIncludes(result, '<style>.page { color: blue; }</style>');
  assertStringIncludes(result, '<div>Styled</div>');
});

Deno.test('renderHTML - CSS + .md: CSS prepended to <mark-down> wrapper', () => {
  const cssContent = 'body { margin: 0; }';
  const mdContent = '# Styled Markdown';
  const context = createMockContext({
    files: { css: cssContent, md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  assertStringIncludes(result, '<style>body { margin: 0; }</style>');
  assertStringIncludes(result, '<mark-down>');
});

Deno.test('renderHTML - No CSS: no <style> tag included', () => {
  const htmlContent = '<p>No styles</p>';
  const context = createMockContext({
    files: { html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  assertEquals(result.includes('<style>'), false);
});

// ============================================================================
// <mark-down> Tag Replacement Tests
// ============================================================================

Deno.test('renderHTML - .html with <mark-down></mark-down>: replaces with .md content', () => {
  const htmlContent = '<div><mark-down></mark-down></div>';
  const mdContent = '# Embedded Markdown';
  const context = createMockContext({
    files: { html: htmlContent, md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  assertStringIncludes(result, '<mark-down># Embedded Markdown</mark-down>');
});

Deno.test('renderHTML - .html with <mark-down></mark-down>: escapes .md content', () => {
  const htmlContent = '<div><mark-down></mark-down></div>';
  const mdContent = '<tag>content</tag>';
  const context = createMockContext({
    files: { html: htmlContent, md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  assertStringIncludes(result, '&lt;tag&gt;');
  assertEquals(result.includes('<tag>'), false);
});

Deno.test('renderHTML - .html with <mark-down></mark-down> but no .md: leaves tag empty', () => {
  const htmlContent = '<div><mark-down></mark-down></div>';
  const context = createMockContext({
    files: { html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  assertEquals(result, htmlContent);
  assertStringIncludes(result, '<mark-down></mark-down>');
});

Deno.test('renderHTML - .html without <mark-down></mark-down>: ignores .md', () => {
  const htmlContent = '<div>No placeholder</div>';
  const mdContent = '# This is ignored';
  const context = createMockContext({
    files: { html: htmlContent, md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  assertEquals(result, htmlContent);
  assertEquals(result.includes('This is ignored'), false);
});

Deno.test('renderHTML - Multiple <mark-down></mark-down>: only first is replaced', () => {
  const htmlContent = '<div><mark-down></mark-down> and <mark-down></mark-down></div>';
  const mdContent = '# Content';
  const context = createMockContext({
    files: { html: htmlContent, md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  // Only the first placeholder should be replaced
  const firstReplaced = result.includes('<mark-down># Content</mark-down>');
  const hasSecondPlaceholder = result.includes('<mark-down></mark-down>');

  assertEquals(firstReplaced && hasSecondPlaceholder, true);
});

// ============================================================================
// renderMarkdown Fallback Chain Tests
// ============================================================================

Deno.test('renderMarkdown - .md present: returns markdown file content', () => {
  const mdContent = '# Page Title\n\nContent here';
  const context = createMockContext({
    files: { md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderMarkdown(createRenderArgs(context));

  assertEquals(result, mdContent);
});

Deno.test('renderMarkdown - .md + .html: returns only .md content', () => {
  const mdContent = '# Markdown';
  const htmlContent = '<p>HTML</p>';
  const context = createMockContext({
    files: { md: mdContent, html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderMarkdown(createRenderArgs(context));

  assertEquals(result, mdContent);
  assertEquals(result.includes('HTML'), false);
});

Deno.test('renderMarkdown - Only .html present: returns router-slot placeholder', () => {
  const htmlContent = '<div>HTML only</div>';
  const context = createMockContext({
    files: { html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderMarkdown(createRenderArgs(context));

  assertEquals(result, '```router-slot\n```');
});

Deno.test('renderMarkdown - No files: returns router-slot placeholder', () => {
  const context = createMockContext({
    files: {},
  });

  const component = new PageComponent();
  const result = component.renderMarkdown(createRenderArgs(context));

  assertEquals(result, '```router-slot\n```');
});

Deno.test('renderMarkdown - No files object: returns router-slot placeholder', () => {
  const context = createMockContext({});

  const component = new PageComponent();
  const result = component.renderMarkdown(createRenderArgs(context));

  assertEquals(result, '```router-slot\n```');
});

Deno.test('renderMarkdown - router-slot placeholder has correct format', () => {
  const context = createMockContext({
    files: {},
  });

  const component = new PageComponent();
  const result = component.renderMarkdown(createRenderArgs(context));

  // Must be exactly this format with newline
  assertEquals(result, '```router-slot\n```');
  assertEquals(result.includes('```router-slot'), true);
});

// ============================================================================
// Fallback Table Comprehensive Tests
// ============================================================================

Deno.test('Fallback table - .html + .md', () => {
  const htmlContent = '<article>HTML Article</article>';
  const mdContent = '# Markdown Article';
  const context = createMockContext({
    files: { html: htmlContent, md: mdContent },
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));
  const mdResult = component.renderMarkdown(createRenderArgs(context));

  // renderHTML should return HTML file
  assertEquals(htmlResult, htmlContent);
  // renderMarkdown should return Markdown file
  assertEquals(mdResult, mdContent);
});

Deno.test('Fallback table - .html only', () => {
  const htmlContent = '<header>HTML Header</header>';
  const context = createMockContext({
    files: { html: htmlContent },
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));
  const mdResult = component.renderMarkdown(createRenderArgs(context));

  // renderHTML should return HTML file
  assertEquals(htmlResult, htmlContent);
  // renderMarkdown should return router-slot placeholder
  assertEquals(mdResult, '```router-slot\n```');
});

Deno.test('Fallback table - .md only', () => {
  const mdContent = '# Markdown Page\n\nContent';
  const context = createMockContext({
    files: { md: mdContent },
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));
  const mdResult = component.renderMarkdown(createRenderArgs(context));

  // renderHTML should wrap markdown with <mark-down> and add slot
  assertStringIncludes(htmlResult, '<mark-down>');
  assertStringIncludes(htmlResult, '</mark-down>');
  assertStringIncludes(htmlResult, '<router-slot></router-slot>');
  // renderMarkdown should return Markdown file
  assertEquals(mdResult, mdContent);
});

Deno.test('Fallback table - Neither .html nor .md', () => {
  const context = createMockContext({
    files: {},
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));
  const mdResult = component.renderMarkdown(createRenderArgs(context));

  // renderHTML should return bare slot
  assertEquals(htmlResult, '<router-slot></router-slot>');
  // renderMarkdown should return router-slot placeholder
  assertEquals(mdResult, '```router-slot\n```');
});

// ============================================================================
// Slot Presence Tests (Parent/Child Nesting)
// ============================================================================

Deno.test('Slot presence - .html + .md with slot: both modes nest properly', () => {
  const htmlContent = '<div class="layout"><router-slot></router-slot></div>';
  const mdContent = '# Layout\n\n```router-slot\n```';
  const context = createMockContext({
    files: { html: htmlContent, md: mdContent },
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));
  const mdResult = component.renderMarkdown(createRenderArgs(context));

  // HTML mode should have slot
  assertStringIncludes(htmlResult, '<router-slot></router-slot>');
  // Markdown mode should have slot
  assertStringIncludes(mdResult, '```router-slot');
});

Deno.test('Slot presence - .md only with no explicit slot: auto-adds slot in HTML', () => {
  const mdContent = '# Content';
  const context = createMockContext({
    files: { md: mdContent },
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));

  // Even though .md has no explicit slot, renderHTML adds one for nesting
  assertStringIncludes(htmlResult, '<router-slot></router-slot>');
});

Deno.test('Slot presence - No files: both modes produce slots', () => {
  const context = createMockContext({
    files: {},
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));
  const mdResult = component.renderMarkdown(createRenderArgs(context));

  // HTML mode: bare slot
  assertEquals(htmlResult, '<router-slot></router-slot>');
  // Markdown mode: slot placeholder
  assertEquals(mdResult, '```router-slot\n```');
});

// ============================================================================
// Edge Cases & Special Scenarios
// ============================================================================

Deno.test('Edge case - Empty HTML string', () => {
  const context = createMockContext({
    files: { html: '' },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  // Empty string is falsy, so it falls through to the next fallback: bare slot
  assertEquals(result, '<router-slot></router-slot>');
});

Deno.test('Edge case - Empty Markdown string', () => {
  const context = createMockContext({
    files: { md: '' },
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));

  // Empty markdown is falsy, so it falls through to the next fallback: bare slot
  assertEquals(htmlResult, '<router-slot></router-slot>');
});

Deno.test('Edge case - Markdown with special HTML characters', () => {
  const mdContent = '# Title\n\n```html\n<div>&nbsp;</div>\n```';
  const context = createMockContext({
    files: { md: mdContent },
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));

  // HTML should be escaped when wrapped in mark-down
  assertStringIncludes(htmlResult, '&lt;div&gt;');
});

Deno.test('Edge case - CSS with HTML characters', () => {
  const cssContent = 'body::before { content: "<"; }';
  const htmlContent = '<p>Test</p>';
  const context = createMockContext({
    files: { css: cssContent, html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  // CSS is not escaped (it's safe in <style> tags)
  assertStringIncludes(result, 'body::before { content: "<"; }');
});

Deno.test('Edge case - HTML with newlines and indentation', () => {
  const htmlContent = '<div>\n  <p>Indented</p>\n</div>';
  const context = createMockContext({
    files: { html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  // Whitespace should be preserved
  assertEquals(result, htmlContent);
});

Deno.test('Edge case - Markdown with code blocks containing router-slot', () => {
  const mdContent = '# Example\n\n```\nrouter-slot\n```\n\nNot a real slot';
  const context = createMockContext({
    files: { md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderMarkdown(createRenderArgs(context));

  // Should return exact markdown content (code blocks are content, not slots)
  assertEquals(result, mdContent);
});

Deno.test('Edge case - .html with multiple <mark-down> tags but no .md', () => {
  const htmlContent = '<div><mark-down></mark-down> and <mark-down></mark-down></div>';
  const context = createMockContext({
    files: { html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  // No .md means no replacement, return HTML as-is
  assertEquals(result, htmlContent);
});

Deno.test('Edge case - CSS + markdown with <mark-down> placeholder in HTML', () => {
  const cssContent = 'p { color: red; }';
  const mdContent = '# Title';
  const htmlContent = '<div><mark-down></mark-down></div>';
  const context = createMockContext({
    files: { css: cssContent, md: mdContent, html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  // CSS should be prepended
  assertStringIncludes(result, '<style>p { color: red; }</style>');
  // Markdown should replace the placeholder
  assertStringIncludes(result, '<mark-down># Title</mark-down>');
});

// ============================================================================
// Default Instance Tests
// ============================================================================

Deno.test('Default instance - exported default is PageComponent instance', async () => {
  // Import the default export
  const { default: defaultInstance } = await import(
    '../../src/component/page.component.ts'
  );

  assertEquals(defaultInstance instanceof PageComponent, true);
  assertEquals(defaultInstance.name, 'page');
});

// ============================================================================
// getData Override Tests
// ============================================================================

Deno.test('getData - default returns null', async () => {
  const component = new PageComponent();
  const result = await component.getData({
    params: {},
    context: createMockContext(),
  });

  assertEquals(result, null);
});

// ============================================================================
// getTitle Override Tests
// ============================================================================

Deno.test('getTitle - default returns undefined', () => {
  const component = new PageComponent();
  const result = component.getTitle(createRenderArgs());

  assertEquals(result, undefined);
});
