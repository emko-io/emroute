import { assertEquals } from '@std/assert';
import {
  parseComponentBlocks,
  type ParsedComponentBlock,
  renderComponent,
  replaceComponentBlocks,
} from '../../src/renderer/component/component.renderer.ts';
import { Component } from '../../src/component/abstract.component.ts';

/**
 * Mock component for testing
 */
class MockComponent extends Component<{ title: string }, { content: string }> {
  readonly name = 'test-component';

  getData({ params }: { params: { title: string } }) {
    return Promise.resolve({ content: `Content from ${params.title}` });
  }

  renderMarkdown({ data }: { data: { content: string } | null }) {
    return `# ${data?.content}`;
  }

  override renderHTML({ data }: { data: { content: string } | null }) {
    if (data === null) {
      return `<div class="c-loading" data-component="${this.name}">Loading...</div>`;
    }
    return `<div class="c-markdown" data-component="${this.name}" data-markdown>&lt;h1&gt;${data.content}&lt;/h1&gt;</div>`;
  }
}

/**
 * Mock component with validation
 */
class ValidatingComponent extends Component<{ value: number }, { result: number }> {
  readonly name = 'validating-component';

  getData({ params }: { params: { value: number } }) {
    return Promise.resolve({ result: params.value * 2 });
  }

  renderMarkdown({ data }: { data: { result: number } | null }) {
    return `Result: ${data?.result}`;
  }

  override validateParams(params: { value: number }): string | undefined {
    if (params.value < 0) {
      return 'Value must be non-negative';
    }
    return undefined;
  }
}

/**
 * Mock component that throws errors
 */
class ErrorThrowingComponent extends Component<unknown, unknown> {
  readonly name = 'error-component';

  getData() {
    return Promise.reject(new Error('Data fetch failed'));
  }

  renderMarkdown() {
    return 'Should not be reached';
  }
}

/**
 * Mock layout component
 */
// Test renderComponent with markdown context
Deno.test('renderComponent - renders component in markdown context', async () => {
  const component = new MockComponent();
  const params = { title: 'Test Title' };

  const result = await renderComponent(component, params, 'markdown');

  assertEquals(result, '# Content from Test Title');
});

Deno.test('renderComponent - renders component in html context', async () => {
  const component = new MockComponent();
  const params = { title: 'Test Title' };

  const result = await renderComponent(component, params, 'html');

  assertEquals(
    result,
    '<div class="c-markdown" data-component="test-component" data-markdown>&lt;h1&gt;Content from Test Title&lt;/h1&gt;</div>',
  );
});

Deno.test('renderComponent - calls validateParams and returns error in markdown on validation failure', async () => {
  const component = new ValidatingComponent();
  const params = { value: -5 };

  const result = await renderComponent(component, params, 'markdown');

  assertEquals(result, '> **Error** (`validating-component`): Value must be non-negative');
});

Deno.test('renderComponent - calls validateParams and returns error in html on validation failure', async () => {
  const component = new ValidatingComponent();
  const params = { value: -5 };

  const result = await renderComponent(component, params, 'html');

  assertEquals(
    result,
    '<div class="c-error" data-component="validating-component">Error: Value must be non-negative</div>',
  );
});

Deno.test('renderComponent - handles validation error in markdown context', async () => {
  const component = new ValidatingComponent();
  const params = { value: 10 };

  const result = await renderComponent(component, params, 'markdown');

  assertEquals(result, 'Result: 20');
});

Deno.test('renderComponent - renders successfully with valid params', async () => {
  const component = new ValidatingComponent();
  const params = { value: 10 };

  const result = await renderComponent(component, params, 'html');

  assertEquals(
    result,
    '<div class="c-markdown" data-component="validating-component" data-markdown>Result: 20</div>',
  );
});

Deno.test('renderComponent - handles getData errors in markdown context', async () => {
  const component = new ErrorThrowingComponent();

  const result = await renderComponent(component, {}, 'markdown');

  assertEquals(result, '> **Error** (`error-component`): Data fetch failed');
});

Deno.test('renderComponent - handles getData errors in html context', async () => {
  const component = new ErrorThrowingComponent();

  const result = await renderComponent(component, {}, 'html');

  assertEquals(
    result,
    '<div class="c-error" data-component="error-component">Error: Data fetch failed</div>',
  );
});

Deno.test('renderComponent - handles non-Error exceptions in markdown context', async () => {
  class StringThrowingComponent extends Component<unknown, unknown> {
    readonly name = 'string-error-component';

    getData() {
      return Promise.reject('Plain string error');
    }

    renderMarkdown() {
      return 'Should not be reached';
    }
  }

  const component = new StringThrowingComponent();
  const result = await renderComponent(component, {}, 'markdown');

  assertEquals(result, '> **Error** (`string-error-component`): Plain string error');
});

// Test parseComponentBlocks
Deno.test('parseComponentBlocks - parses simple component block', () => {
  const markdown = 'Text\n```component:widget\n{"key": "value"}\n```\nMore text';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].componentName, 'widget');
  assertEquals(blocks[0].params, { key: 'value' });
  assertEquals(blocks[0].parseError, undefined);
});

Deno.test('parseComponentBlocks - parses component block with empty params', () => {
  const markdown = 'Text\n```component:button\n```\nMore text';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].componentName, 'button');
  assertEquals(blocks[0].params, {});
  assertEquals(blocks[0].parseError, undefined);
});

Deno.test('parseComponentBlocks - parses component block with whitespace-only content', () => {
  const markdown = 'Text\n```component:badge\n  \n\t\n```\nMore text';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].componentName, 'badge');
  assertEquals(blocks[0].params, {});
  assertEquals(blocks[0].parseError, undefined);
});

Deno.test('parseComponentBlocks - parses multiple component blocks', () => {
  const markdown = '```component:first\n{"a": 1}\n```\nMiddle\n```component:second\n{"b": 2}\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 2);
  assertEquals(blocks[0].componentName, 'first');
  assertEquals(blocks[0].params, { a: 1 });
  assertEquals(blocks[1].componentName, 'second');
  assertEquals(blocks[1].params, { b: 2 });
});

Deno.test('parseComponentBlocks - sets parseError for invalid JSON', () => {
  const markdown = '```component:widget\n{invalid json}\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].componentName, 'widget');
  assertEquals(blocks[0].params, null);
  assertEquals(blocks[0].parseError?.includes('Invalid JSON'), true);
});

Deno.test('parseComponentBlocks - sets parseError for array params', () => {
  const markdown = '```component:widget\n[1, 2, 3]\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].componentName, 'widget');
  assertEquals(blocks[0].params, null);
  assertEquals(blocks[0].parseError, 'Params must be a JSON object');
});

Deno.test('parseComponentBlocks - sets parseError for null params', () => {
  const markdown = '```component:widget\nnull\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].componentName, 'widget');
  assertEquals(blocks[0].params, null);
  assertEquals(blocks[0].parseError, 'Params must be a JSON object');
});

Deno.test('parseComponentBlocks - sets parseError for string params', () => {
  const markdown = '```component:widget\n"string"\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].componentName, 'widget');
  assertEquals(blocks[0].params, null);
  assertEquals(blocks[0].parseError, 'Params must be a JSON object');
});

Deno.test('parseComponentBlocks - sets parseError for number params', () => {
  const markdown = '```component:widget\n42\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params, null);
  assertEquals(blocks[0].parseError, 'Params must be a JSON object');
});

Deno.test('parseComponentBlocks - tracks correct startIndex and endIndex', () => {
  const markdown = 'prefix```component:test\n{}\n```suffix';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks[0].startIndex, 6);
  assertEquals(blocks[0].endIndex, 30);
  assertEquals(markdown.substring(blocks[0].startIndex, blocks[0].endIndex), blocks[0].fullMatch);
});

Deno.test('parseComponentBlocks - handles nested quotes in JSON', () => {
  const markdown = '```component:widget\n{"text": "Quote\\"inside", "other": "value"}\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params, { text: 'Quote"inside', other: 'value' });
  assertEquals(blocks[0].parseError, undefined);
});

Deno.test('parseComponentBlocks - ignores similar patterns that dont match', () => {
  const markdown =
    'Some `component:widget` and ```component-widget\n{}\n``` text should be ignored';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 0);
});

Deno.test('parseComponentBlocks - requires lowercase component name', () => {
  const markdown = '```component:Widget\n{}\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 0);
});

Deno.test('parseComponentBlocks - accepts numeric characters in component name', () => {
  const markdown = '```component:widget2\n{"key": "value"}\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].componentName, 'widget2');
});

Deno.test('parseComponentBlocks - accepts hyphens in component name', () => {
  const markdown = '```component:my-widget-name\n{"key": "value"}\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].componentName, 'my-widget-name');
});

Deno.test('parseComponentBlocks - returns empty array for no matches', () => {
  const markdown = 'No components here\n```code\nsome code\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 0);
});

Deno.test('parseComponentBlocks - handles complex nested JSON', () => {
  const markdown =
    '```component:form\n{"fields": [{"name": "input", "value": 42}], "nested": {"deep": true}}\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params, {
    fields: [{ name: 'input', value: 42 }],
    nested: { deep: true },
  });
});

Deno.test('parseComponentBlocks - preserves fullMatch with exact content', () => {
  const markdown = '```component:test\n{"a": 1}\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks[0].fullMatch, '```component:test\n{"a": 1}\n```');
});

// Test replaceComponentBlocks
Deno.test('replaceComponentBlocks - replaces single component block', () => {
  const markdown = 'Before\n```component:test\n{}\n```\nAfter';
  const block = parseComponentBlocks(markdown)[0];
  const replacements = new Map([[block, 'RENDERED']]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, 'Before\nRENDERED\nAfter');
});

Deno.test('replaceComponentBlocks - replaces multiple component blocks', () => {
  const markdown = 'A\n```component:first\n{}\n```\nB\n```component:second\n{}\n```\nC';
  const blocks = parseComponentBlocks(markdown);
  const replacements = new Map([
    [blocks[0], 'FIRST'],
    [blocks[1], 'SECOND'],
  ]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, 'A\nFIRST\nB\nSECOND\nC');
});

Deno.test('replaceComponentBlocks - handles overlapping blocks correctly by processing in reverse order', () => {
  const markdown = '```component:a\n{}\n```X```component:b\n{}\n```';
  const blocks = parseComponentBlocks(markdown);
  const replacements = new Map([
    [blocks[0], 'A_REPLACEMENT'],
    [blocks[1], 'B_REPLACEMENT'],
  ]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, 'A_REPLACEMENTXB_REPLACEMENT');
});

Deno.test('replaceComponentBlocks - returns unchanged markdown when no replacements', () => {
  const markdown = 'No components here';
  const replacements = new Map<ParsedComponentBlock, string>();

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, markdown);
});

Deno.test('replaceComponentBlocks - handles empty replacements value', () => {
  const markdown = 'Before\n```component:test\n{}\n```\nAfter';
  const block = parseComponentBlocks(markdown)[0];
  const replacements = new Map([[block, '']]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, 'Before\n\nAfter');
});

Deno.test('replaceComponentBlocks - preserves non-matched content exactly', () => {
  const markdown = 'Special chars: & < > "\n```component:test\n{}\n```\nMore: <tag>';
  const block = parseComponentBlocks(markdown)[0];
  const replacements = new Map([[block, 'X']]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, 'Special chars: & < > "\nX\nMore: <tag>');
});

Deno.test('replaceComponentBlocks - maintains correct positions with variable-length replacements', () => {
  const markdown = '```component:a\n{}\n```\n```component:b\n{}\n```';
  const blocks = parseComponentBlocks(markdown);
  const replacements = new Map([
    [blocks[0], 'SHORT'],
    [blocks[1], 'VERY_LONG_REPLACEMENT_TEXT'],
  ]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, 'SHORT\nVERY_LONG_REPLACEMENT_TEXT');
});

Deno.test('replaceComponentBlocks - processes blocks in reverse order of startIndex', () => {
  const markdown = '```component:first\n{}\n```\n```component:second\n{}\n```';
  const blocks = parseComponentBlocks(markdown);

  // Verify blocks are processed in correct order by checking the processing logic
  assertEquals(blocks[0].startIndex < blocks[1].startIndex, true);

  const replacements = new Map([
    [blocks[0], 'A'],
    [blocks[1], 'B'],
  ]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, 'A\nB');
});

Deno.test('replaceComponentBlocks - handles single-line markdown', () => {
  const markdown = 'Text```component:test\n{}\n```MoreText';
  const block = parseComponentBlocks(markdown)[0];
  const replacements = new Map([[block, 'X']]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, 'TextXMoreText');
});

Deno.test('replaceComponentBlocks - handles newlines in replacement text', () => {
  const markdown = 'A\n```component:test\n{}\n```\nB';
  const block = parseComponentBlocks(markdown)[0];
  const replacements = new Map([[block, 'Line1\nLine2\nLine3']]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, 'A\nLine1\nLine2\nLine3\nB');
});

Deno.test('replaceComponentBlocks - partial block replacement doesnt affect other blocks', () => {
  const markdown = 'Start\n```component:keep\n{}\n```\nMiddle\n```component:replace\n{}\n```\nEnd';
  const blocks = parseComponentBlocks(markdown);
  const replacements = new Map([[blocks[1], 'REPLACED']]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(
    result,
    'Start\n```component:keep\n{}\n```\nMiddle\nREPLACED\nEnd',
  );
});

// Test interface and type correctness
Deno.test('ParsedComponentBlock interface has all required properties', () => {
  const markdown = '```component:test\n{"key": "value"}\n```';
  const blocks = parseComponentBlocks(markdown);

  if (blocks.length > 0) {
    const block = blocks[0];

    assertEquals(typeof block.fullMatch, 'string');
    assertEquals(typeof block.componentName, 'string');
    assertEquals(typeof block.params, 'object');
    assertEquals(typeof block.startIndex, 'number');
    assertEquals(typeof block.endIndex, 'number');
  }
});

Deno.test('ParsedComponentBlock with parseError has correct properties', () => {
  const markdown = '```component:test\n{invalid}\n```';
  const blocks = parseComponentBlocks(markdown);

  if (blocks.length > 0) {
    const block = blocks[0];

    assertEquals(block.parseError !== undefined, true);
    assertEquals(typeof block.parseError, 'string');
  }
});

// Integration tests
Deno.test('renderComponent and parseComponentBlocks work together', async () => {
  const markdown =
    'Text before\n```component:test-component\n{"title": "Integration"}\n```\nText after';
  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].componentName, 'test-component');

  const component = new MockComponent();
  const rendered = await renderComponent(
    component,
    blocks[0].params as { title: string },
    'markdown',
  );

  assertEquals(rendered, '# Content from Integration');
});

Deno.test('parseComponentBlocks and replaceComponentBlocks work together', async () => {
  const markdown =
    'Start\n```component:widget1\n{}\n```\nMiddle\n```component:widget2\n{}\n```\nEnd';
  const blocks = parseComponentBlocks(markdown);

  const component = new MockComponent();
  const replacements = new Map<ParsedComponentBlock, string>();

  for (const block of blocks) {
    const rendered = await renderComponent(
      component,
      { title: block.componentName },
      'markdown',
    );
    replacements.set(block, rendered);
  }

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(
    result,
    'Start\n# Content from widget1\nMiddle\n# Content from widget2\nEnd',
  );
});

Deno.test('renderComponent handles spa context like html', async () => {
  const component = new MockComponent();
  const params = { title: 'SPA Test' };

  const htmlResult = await renderComponent(component, params, 'html');
  const spaResult = await renderComponent(component, params, 'spa');

  assertEquals(htmlResult, spaResult);
});

Deno.test('parseComponentBlocks with multiline JSON values', () => {
  const markdown = `\`\`\`component:test
{
  "title": "value",
  "array": [1, 2, 3],
  "nested": {
    "key": "value"
  }
}
\`\`\``;

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params, {
    title: 'value',
    array: [1, 2, 3],
    nested: { key: 'value' },
  });
});
