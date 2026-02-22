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

import { test, expect } from 'bun:test';
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

test('renderHTML - .html + .md: returns HTML file content', () => {
  const htmlContent = '<div class="page">HTML Content</div>';
  const mdContent = '# Markdown Content';
  const context = createMockContext({
    files: { html: htmlContent, md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  expect(result).toEqual(htmlContent);
});

test('renderHTML - .html + .md: HTML file takes precedence over md', () => {
  const htmlContent = '<p>HTML wins</p>';
  const mdContent = '# Markdown loses';
  const context = createMockContext({
    files: { html: htmlContent, md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  expect(result).toEqual(htmlContent);
  expect(result.includes('Markdown loses')).toEqual(false);
});

test('renderHTML - .html only: returns HTML file content', () => {
  const htmlContent = '<section>Only HTML</section>';
  const context = createMockContext({
    files: { html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  expect(result).toEqual(htmlContent);
});

test('renderHTML - .md only: wraps markdown in <mark-down> and includes slot', () => {
  const mdContent = '# Page Title\n\nPage body';
  const context = createMockContext({
    files: { md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  expect(result).toContain('<mark-down>');
  expect(result).toContain('</mark-down>');
  expect(result).toContain('<router-slot></router-slot>');
  // Markdown content should be included (it gets HTML escaped)
  expect(result).toContain('# Page Title');
});

test('renderHTML - .md only: escapes markdown content', () => {
  const mdContent = '<script>alert("xss")</script>';
  const context = createMockContext({
    files: { md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  expect(result).toContain('&lt;script&gt;');
  expect(result).toContain('&lt;/script&gt;');
  expect(result.includes('<script>')).toEqual(false);
});

test('renderHTML - Neither .html nor .md: returns bare <router-slot>', () => {
  const context = createMockContext({
    files: {},
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  expect(result).toEqual('<router-slot></router-slot>');
});

test('renderHTML - No files object: returns bare <router-slot>', () => {
  const context = createMockContext({});

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  expect(result).toEqual('<router-slot></router-slot>');
});

// ============================================================================
// CSS Inclusion Tests
// ============================================================================

test('renderHTML - CSS file: prepends <style> tag to HTML', () => {
  const cssContent = '.page { color: blue; }';
  const htmlContent = '<div>Styled</div>';
  const context = createMockContext({
    files: { css: cssContent, html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  expect(result).toContain('<style>.page { color: blue; }</style>');
  expect(result).toContain('<div>Styled</div>');
});

test('renderHTML - CSS + .md: CSS prepended to <mark-down> wrapper', () => {
  const cssContent = 'body { margin: 0; }';
  const mdContent = '# Styled Markdown';
  const context = createMockContext({
    files: { css: cssContent, md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  expect(result).toContain('<style>body { margin: 0; }</style>');
  expect(result).toContain('<mark-down>');
});

test('renderHTML - No CSS: no <style> tag included', () => {
  const htmlContent = '<p>No styles</p>';
  const context = createMockContext({
    files: { html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  expect(result.includes('<style>')).toEqual(false);
});

// ============================================================================
// <mark-down> Tag Replacement Tests
// ============================================================================

test('renderHTML - .html with <mark-down></mark-down>: replaces with .md content', () => {
  const htmlContent = '<div><mark-down></mark-down></div>';
  const mdContent = '# Embedded Markdown';
  const context = createMockContext({
    files: { html: htmlContent, md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  expect(result).toContain('<mark-down># Embedded Markdown</mark-down>');
});

test('renderHTML - .html with <mark-down></mark-down>: escapes .md content', () => {
  const htmlContent = '<div><mark-down></mark-down></div>';
  const mdContent = '<tag>content</tag>';
  const context = createMockContext({
    files: { html: htmlContent, md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  expect(result).toContain('&lt;tag&gt;');
  expect(result.includes('<tag>')).toEqual(false);
});

test('renderHTML - .html with <mark-down></mark-down> but no .md: leaves tag empty', () => {
  const htmlContent = '<div><mark-down></mark-down></div>';
  const context = createMockContext({
    files: { html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  expect(result).toEqual(htmlContent);
  expect(result).toContain('<mark-down></mark-down>');
});

test('renderHTML - .html without <mark-down></mark-down>: ignores .md', () => {
  const htmlContent = '<div>No placeholder</div>';
  const mdContent = '# This is ignored';
  const context = createMockContext({
    files: { html: htmlContent, md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  expect(result).toEqual(htmlContent);
  expect(result.includes('This is ignored')).toEqual(false);
});

test('renderHTML - Multiple <mark-down></mark-down>: only first is replaced', () => {
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

  expect(firstReplaced && hasSecondPlaceholder).toEqual(true);
});

// ============================================================================
// renderMarkdown Fallback Chain Tests
// ============================================================================

test('renderMarkdown - .md present: returns markdown file content', () => {
  const mdContent = '# Page Title\n\nContent here';
  const context = createMockContext({
    files: { md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderMarkdown(createRenderArgs(context));

  expect(result).toEqual(mdContent);
});

test('renderMarkdown - .md + .html: returns only .md content', () => {
  const mdContent = '# Markdown';
  const htmlContent = '<p>HTML</p>';
  const context = createMockContext({
    files: { md: mdContent, html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderMarkdown(createRenderArgs(context));

  expect(result).toEqual(mdContent);
  expect(result.includes('HTML')).toEqual(false);
});

test('renderMarkdown - Only .html present: returns router-slot placeholder', () => {
  const htmlContent = '<div>HTML only</div>';
  const context = createMockContext({
    files: { html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderMarkdown(createRenderArgs(context));

  expect(result).toEqual('```router-slot\n```');
});

test('renderMarkdown - No files: returns router-slot placeholder', () => {
  const context = createMockContext({
    files: {},
  });

  const component = new PageComponent();
  const result = component.renderMarkdown(createRenderArgs(context));

  expect(result).toEqual('```router-slot\n```');
});

test('renderMarkdown - No files object: returns router-slot placeholder', () => {
  const context = createMockContext({});

  const component = new PageComponent();
  const result = component.renderMarkdown(createRenderArgs(context));

  expect(result).toEqual('```router-slot\n```');
});

test('renderMarkdown - router-slot placeholder has correct format', () => {
  const context = createMockContext({
    files: {},
  });

  const component = new PageComponent();
  const result = component.renderMarkdown(createRenderArgs(context));

  // Must be exactly this format with newline
  expect(result).toEqual('```router-slot\n```');
  expect(result.includes('```router-slot')).toEqual(true);
});

// ============================================================================
// Fallback Table Comprehensive Tests
// ============================================================================

test('Fallback table - .html + .md', () => {
  const htmlContent = '<article>HTML Article</article>';
  const mdContent = '# Markdown Article';
  const context = createMockContext({
    files: { html: htmlContent, md: mdContent },
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));
  const mdResult = component.renderMarkdown(createRenderArgs(context));

  // renderHTML should return HTML file
  expect(htmlResult).toEqual(htmlContent);
  // renderMarkdown should return Markdown file
  expect(mdResult).toEqual(mdContent);
});

test('Fallback table - .html only', () => {
  const htmlContent = '<header>HTML Header</header>';
  const context = createMockContext({
    files: { html: htmlContent },
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));
  const mdResult = component.renderMarkdown(createRenderArgs(context));

  // renderHTML should return HTML file
  expect(htmlResult).toEqual(htmlContent);
  // renderMarkdown should return router-slot placeholder
  expect(mdResult).toEqual('```router-slot\n```');
});

test('Fallback table - .md only', () => {
  const mdContent = '# Markdown Page\n\nContent';
  const context = createMockContext({
    files: { md: mdContent },
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));
  const mdResult = component.renderMarkdown(createRenderArgs(context));

  // renderHTML should wrap markdown with <mark-down> and add slot
  expect(htmlResult).toContain('<mark-down>');
  expect(htmlResult).toContain('</mark-down>');
  expect(htmlResult).toContain('<router-slot></router-slot>');
  // renderMarkdown should return Markdown file
  expect(mdResult).toEqual(mdContent);
});

test('Fallback table - Neither .html nor .md', () => {
  const context = createMockContext({
    files: {},
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));
  const mdResult = component.renderMarkdown(createRenderArgs(context));

  // renderHTML should return bare slot
  expect(htmlResult).toEqual('<router-slot></router-slot>');
  // renderMarkdown should return router-slot placeholder
  expect(mdResult).toEqual('```router-slot\n```');
});

// ============================================================================
// Slot Presence Tests (Parent/Child Nesting)
// ============================================================================

test('Slot presence - .html + .md with slot: both modes nest properly', () => {
  const htmlContent = '<div class="layout"><router-slot></router-slot></div>';
  const mdContent = '# Layout\n\n```router-slot\n```';
  const context = createMockContext({
    files: { html: htmlContent, md: mdContent },
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));
  const mdResult = component.renderMarkdown(createRenderArgs(context));

  // HTML mode should have slot
  expect(htmlResult).toContain('<router-slot></router-slot>');
  // Markdown mode should have slot
  expect(mdResult).toContain('```router-slot');
});

test('Slot presence - .md only with no explicit slot: auto-adds slot in HTML', () => {
  const mdContent = '# Content';
  const context = createMockContext({
    files: { md: mdContent },
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));

  // Even though .md has no explicit slot, renderHTML adds one for nesting
  expect(htmlResult).toContain('<router-slot></router-slot>');
});

test('Slot presence - No files: both modes produce slots', () => {
  const context = createMockContext({
    files: {},
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));
  const mdResult = component.renderMarkdown(createRenderArgs(context));

  // HTML mode: bare slot
  expect(htmlResult).toEqual('<router-slot></router-slot>');
  // Markdown mode: slot placeholder
  expect(mdResult).toEqual('```router-slot\n```');
});

// ============================================================================
// Edge Cases & Special Scenarios
// ============================================================================

test('Edge case - Empty HTML string', () => {
  const context = createMockContext({
    files: { html: '' },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  // Empty string is falsy, so it falls through to the next fallback: bare slot
  expect(result).toEqual('<router-slot></router-slot>');
});

test('Edge case - Empty Markdown string', () => {
  const context = createMockContext({
    files: { md: '' },
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));

  // Empty markdown is falsy, so it falls through to the next fallback: bare slot
  expect(htmlResult).toEqual('<router-slot></router-slot>');
});

test('Edge case - Markdown with special HTML characters', () => {
  const mdContent = '# Title\n\n```html\n<div>&nbsp;</div>\n```';
  const context = createMockContext({
    files: { md: mdContent },
  });

  const component = new PageComponent();
  const htmlResult = component.renderHTML(createRenderArgs(context));

  // HTML should be escaped when wrapped in mark-down
  expect(htmlResult).toContain('&lt;div&gt;');
});

test('Edge case - CSS with HTML characters', () => {
  const cssContent = 'body::before { content: "<"; }';
  const htmlContent = '<p>Test</p>';
  const context = createMockContext({
    files: { css: cssContent, html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  // CSS is not escaped (it's safe in <style> tags)
  expect(result).toContain('body::before { content: "<"; }');
});

test('Edge case - HTML with newlines and indentation', () => {
  const htmlContent = '<div>\n  <p>Indented</p>\n</div>';
  const context = createMockContext({
    files: { html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  // Whitespace should be preserved
  expect(result).toEqual(htmlContent);
});

test('Edge case - Markdown with code blocks containing router-slot', () => {
  const mdContent = '# Example\n\n```\nrouter-slot\n```\n\nNot a real slot';
  const context = createMockContext({
    files: { md: mdContent },
  });

  const component = new PageComponent();
  const result = component.renderMarkdown(createRenderArgs(context));

  // Should return exact markdown content (code blocks are content, not slots)
  expect(result).toEqual(mdContent);
});

test('Edge case - .html with multiple <mark-down> tags but no .md', () => {
  const htmlContent = '<div><mark-down></mark-down> and <mark-down></mark-down></div>';
  const context = createMockContext({
    files: { html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  // No .md means no replacement, return HTML as-is
  expect(result).toEqual(htmlContent);
});

test('Edge case - CSS + markdown with <mark-down> placeholder in HTML', () => {
  const cssContent = 'p { color: red; }';
  const mdContent = '# Title';
  const htmlContent = '<div><mark-down></mark-down></div>';
  const context = createMockContext({
    files: { css: cssContent, md: mdContent, html: htmlContent },
  });

  const component = new PageComponent();
  const result = component.renderHTML(createRenderArgs(context));

  // CSS should be prepended
  expect(result).toContain('<style>p { color: red; }</style>');
  // Markdown should replace the placeholder
  expect(result).toContain('<mark-down># Title</mark-down>');
});

// ============================================================================
// Default Instance Tests
// ============================================================================

test('Default instance - exported default is PageComponent instance', async () => {
  // Import the default export
  const { default: defaultInstance } = await import(
    '../../src/component/page.component.ts'
  );

  expect(defaultInstance instanceof PageComponent).toEqual(true);
  expect(defaultInstance.name).toEqual('page');
});

// ============================================================================
// getData Override Tests
// ============================================================================

test('getData - default returns null', async () => {
  const component = new PageComponent();
  const result = await component.getData({
    params: {},
    context: createMockContext(),
  });

  expect(result).toEqual(null);
});

// ============================================================================
// getTitle Override Tests
// ============================================================================

test('getTitle - default returns undefined', () => {
  const component = new PageComponent();
  const result = component.getTitle(createRenderArgs());

  expect(result).toEqual(undefined);
});
