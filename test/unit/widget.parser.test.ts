import { test, expect } from 'bun:test';
import { parseWidgetBlocks, replaceWidgetBlocks } from '../../src/widget/widget.parser.ts';
import type { ParsedWidgetBlock } from '../../src/type/widget.type.ts';

test('parseWidgetBlocks - single widget block', () => {
  const markdown = `Some text\n\`\`\`widget:test-widget\n{"key": "value"}\n\`\`\`\nMore text`;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].widgetName).toEqual('test-widget');
  expect(blocks[0].params).toBeDefined();
  expect(blocks[0].params!).toMatchObject({ key: 'value' });
  expect(blocks[0].parseError).toEqual(undefined);
});

test('parseWidgetBlocks - multiple widget blocks', () => {
  const markdown =
    `\`\`\`widget:first-widget\n{"a": 1}\n\`\`\`\nText between\n\`\`\`widget:second-widget\n{"b": 2}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(2);
  expect(blocks[0].widgetName).toEqual('first-widget');
  expect(blocks[1].widgetName).toEqual('second-widget');
  expect(blocks[0].params).toBeDefined();
  expect(blocks[1].params).toBeDefined();
  expect(blocks[0].params!).toMatchObject({ a: 1 });
  expect(blocks[1].params!).toMatchObject({ b: 2 });
});

test('parseWidgetBlocks - widget with valid JSON params', () => {
  const markdown =
    `\`\`\`widget:data-widget\n{"name": "test", "count": 42, "active": true}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].params).toBeDefined();
  expect(blocks[0].params!).toMatchObject({
    name: 'test',
    count: 42,
    active: true,
  });
  expect(blocks[0].parseError).toEqual(undefined);
});

test('parseWidgetBlocks - widget with empty params', () => {
  const markdown = `\`\`\`widget:empty-widget\n\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].widgetName).toEqual('empty-widget');
  expect(blocks[0].params).toBeDefined();
  expect(blocks[0].params!).toMatchObject({});
  expect(blocks[0].parseError).toEqual(undefined);
});

test('parseWidgetBlocks - widget with whitespace only params', () => {
  const markdown = `\`\`\`widget:ws-widget\n   \n\t\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].params).toBeDefined();
  expect(blocks[0].params!).toMatchObject({});
  expect(blocks[0].parseError).toEqual(undefined);
});

test('parseWidgetBlocks - widget with invalid JSON params', () => {
  const markdown = `\`\`\`widget:bad-widget\n{invalid json}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].widgetName).toEqual('bad-widget');
  expect(blocks[0].params).toEqual(null);
  expect(blocks[0].parseError).toBeDefined();
  expect(blocks[0].parseError!).toContain('Invalid JSON');
});

test('parseWidgetBlocks - widget with malformed JSON (missing closing brace)', () => {
  const markdown = `\`\`\`widget:bad-widget\n{"key": "value"\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].params).toEqual(null);
  expect(blocks[0].parseError).toBeDefined();
  expect(blocks[0].parseError!).toContain('Invalid JSON');
});

test('parseWidgetBlocks - widget with array instead of object params', () => {
  const markdown = `\`\`\`widget:array-widget\n[1, 2, 3]\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].params).toEqual(null);
  expect(blocks[0].parseError).toBeDefined();
  expect(blocks[0].parseError).toEqual('Params must be a JSON object');
});

test('parseWidgetBlocks - widget with null params', () => {
  const markdown = `\`\`\`widget:null-widget\nnull\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].params).toEqual(null);
  expect(blocks[0].parseError).toBeDefined();
  expect(blocks[0].parseError).toEqual('Params must be a JSON object');
});

test('parseWidgetBlocks - widget with string params', () => {
  const markdown = `\`\`\`widget:string-widget\n"just a string"\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].params).toEqual(null);
  expect(blocks[0].parseError).toBeDefined();
  expect(blocks[0].parseError).toEqual('Params must be a JSON object');
});

test('parseWidgetBlocks - widget with number params', () => {
  const markdown = `\`\`\`widget:number-widget\n42\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].params).toEqual(null);
  expect(blocks[0].parseError).toBeDefined();
  expect(blocks[0].parseError).toEqual('Params must be a JSON object');
});

test('parseWidgetBlocks - widget with nested objects', () => {
  const markdown =
    `\`\`\`widget:nested-widget\n{"user": {"name": "John", "age": 30}, "tags": ["a", "b"]}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].params).toBeDefined();
  expect(blocks[0].params!).toMatchObject({
    user: { name: 'John', age: 30 },
    tags: ['a', 'b'],
  });
  expect(blocks[0].parseError).toEqual(undefined);
});

test('parseWidgetBlocks - widget with deeply nested objects', () => {
  const markdown = `\`\`\`widget:deep-widget\n{"a": {"b": {"c": {"d": "deep"}}}}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect((blocks[0].params as Record<string, unknown>)?.a).toEqual({
    b: { c: { d: 'deep' } },
  });
});

test('parseWidgetBlocks - widget with special characters in strings', () => {
  const markdown =
    `\`\`\`widget:special-widget\n{"text": "Hello\\nWorld", "emoji": "🎉", "quote": "\\"quoted\\""}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect((blocks[0].params as Record<string, unknown>)?.text).toEqual('Hello\nWorld');
  expect((blocks[0].params as Record<string, unknown>)?.emoji).toEqual('🎉');
  expect((blocks[0].params as Record<string, unknown>)?.quote).toEqual('"quoted"');
});

test('parseWidgetBlocks - no widget blocks', () => {
  const markdown = `# Header\n\nThis is just regular markdown with no widgets.`;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(0);
});

test('parseWidgetBlocks - malformed widget missing backticks', () => {
  const markdown = `widget:test-widget\n{"key": "value"}\n`;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(0);
});

test('parseWidgetBlocks - malformed widget with wrong delimiter', () => {
  const markdown = `~~~widget:test-widget\n{"key": "value"}\n~~~`;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(0);
});

test('parseWidgetBlocks - malformed widget missing closing fence', () => {
  const markdown = `\`\`\`widget:test-widget\n{"key": "value"}`;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(0);
});

test('parseWidgetBlocks - widget with uppercase letters in name', () => {
  const markdown = `\`\`\`widget:TestWidget\n{"key": "value"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(0);
});

test('parseWidgetBlocks - widget with underscore in name', () => {
  const markdown = `\`\`\`widget:test_widget\n{"key": "value"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(0);
});

test('parseWidgetBlocks - widget with valid hyphenated name', () => {
  const markdown = `\`\`\`widget:my-cool-widget\n{"key": "value"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].widgetName).toEqual('my-cool-widget');
});

test('parseWidgetBlocks - widget with numbers in name', () => {
  const markdown = `\`\`\`widget:widget-v2-test\n{"key": "value"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].widgetName).toEqual('widget-v2-test');
});

test('parseWidgetBlocks - widget starting with number', () => {
  const markdown = `\`\`\`widget:2fast\n{"key": "value"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(0);
});

test('parseWidgetBlocks - block positions and indices', () => {
  const markdown = `before\`\`\`widget:first\n{}\n\`\`\`after`;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].startIndex).toEqual(6);
  expect(blocks[0].endIndex).toEqual(28);
  expect(markdown.substring(blocks[0].startIndex, blocks[0].endIndex)).toEqual(blocks[0].fullMatch);
});

test('parseWidgetBlocks - multiple blocks with correct indices', () => {
  const markdown = `\`\`\`widget:first\n{}\n\`\`\`XXX\`\`\`widget:second\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(2);
  expect(markdown.substring(blocks[0].startIndex, blocks[0].endIndex)).toEqual(blocks[0].fullMatch);
  expect(markdown.substring(blocks[1].startIndex, blocks[1].endIndex)).toEqual(blocks[1].fullMatch);
});

test('parseWidgetBlocks - fullMatch property is correct', () => {
  const markdown = `\`\`\`widget:test\n{"key": "value"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks[0].fullMatch).toEqual(markdown);
});

test('parseWidgetBlocks - complex JSON with escaped quotes', () => {
  const markdown = `\`\`\`widget:quote-widget\n{"text": "He said \\"hello\\""}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].params?.text).toEqual('He said "hello"');
  expect(blocks[0].parseError).toEqual(undefined);
});

test('parseWidgetBlocks - JSON with multiline newlines', () => {
  const markdown =
    `\`\`\`widget:multi-widget\n{\n  "key": "value",\n  "nested": {\n    "deep": true\n  }\n}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect((blocks[0].params as Record<string, unknown>)?.key).toEqual('value');
  expect(
    ((blocks[0].params as Record<string, unknown>)?.nested as Record<string, unknown>)?.deep,
  ).toEqual(true);
});

test('parseWidgetBlocks - params with unicode characters', () => {
  const markdown = `\`\`\`widget:unicode-widget\n{"greeting": "你好", "emoji": "🚀🌟"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect((blocks[0].params as Record<string, unknown>)?.greeting).toEqual('你好');
  expect((blocks[0].params as Record<string, unknown>)?.emoji).toEqual('🚀🌟');
});

test('parseWidgetBlocks - empty markdown string', () => {
  const markdown = '';
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(0);
});

test('parseWidgetBlocks - three widget blocks in sequence', () => {
  const markdown = `\`\`\`widget:a\n{}\n\`\`\`\`\`\`widget:b\n{}\n\`\`\`\`\`\`widget:c\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(3);
  expect(blocks[0].widgetName).toEqual('a');
  expect(blocks[1].widgetName).toEqual('b');
  expect(blocks[2].widgetName).toEqual('c');
});

test('replaceWidgetBlocks - replace single block', () => {
  const markdown = `prefix\`\`\`widget:test\n{}\n\`\`\`suffix`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], 'REPLACEMENT']]);

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result).toEqual('prefixREPLACEMENTsuffix');
});

test('replaceWidgetBlocks - replace multiple blocks', () => {
  const markdown = `\`\`\`widget:first\n{}\n\`\`\`TEXT\`\`\`widget:second\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([
    [blocks[0], 'FIRST'],
    [blocks[1], 'SECOND'],
  ]);

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result).toEqual('FIRSTTEXTSECOND');
});

test('replaceWidgetBlocks - order of replacement (descending indices)', () => {
  const markdown = `START\`\`\`widget:first\n{}\n\`\`\`MID\`\`\`widget:second\n{}\n\`\`\`END`;
  const blocks = parseWidgetBlocks(markdown);

  const replacements = new Map([
    [blocks[0], 'FIRST_REPLACED'],
    [blocks[1], 'SECOND_REPLACED'],
  ]);

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result).toEqual('STARTFIRST_REPLACEDMIDSECOND_REPLACEDEND');
});

test('replaceWidgetBlocks - preserve surrounding content', () => {
  const markdown = `# Header\n\nSome paragraph\n\`\`\`widget:widget\n{}\n\`\`\`\n\nMore text`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], '[RENDERED]']]);

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result.includes('# Header')).toEqual(true);
  expect(result.includes('Some paragraph')).toEqual(true);
  expect(result.includes('More text')).toEqual(true);
  expect(result.includes('[RENDERED]')).toEqual(true);
});

test('replaceWidgetBlocks - empty replacement string', () => {
  const markdown = `before\`\`\`widget:test\n{}\n\`\`\`after`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], '']]);

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result).toEqual('beforeafter');
});

test('replaceWidgetBlocks - replacement with special characters', () => {
  const markdown = `\`\`\`widget:test\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], '<div class="special">Content</div>']]);

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result).toEqual('<div class="special">Content</div>');
});

test('replaceWidgetBlocks - replacement with newlines', () => {
  const markdown = `start\`\`\`widget:test\n{}\n\`\`\`end`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], 'line1\nline2\nline3']]);

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result).toEqual('startline1\nline2\nline3end');
});

test('replaceWidgetBlocks - replacement preserves other content in order', () => {
  const markdown = `A\`\`\`widget:first\n{}\n\`\`\`B\`\`\`widget:second\n{}\n\`\`\`C`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([
    [blocks[0], '1'],
    [blocks[1], '2'],
  ]);

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result).toEqual('A1B2C');
});

test('replaceWidgetBlocks - empty replacements map', () => {
  const markdown = `\`\`\`widget:test\n{}\n\`\`\``;
  const replacements = new Map<ParsedWidgetBlock, string>();

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result).toEqual(markdown);
});

test('replaceWidgetBlocks - single block in middle', () => {
  const markdown = `Chapter 1\n\nContent\n\`\`\`widget:sidebar\n{}\n\`\`\`\n\nMore content`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], '<aside>Sidebar</aside>']]);

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result.includes('Chapter 1')).toEqual(true);
  expect(result.includes('<aside>Sidebar</aside>')).toEqual(true);
  expect(result.includes('More content')).toEqual(true);
});

test('replaceWidgetBlocks - three consecutive blocks', () => {
  const markdown = `\`\`\`widget:a\n{}\n\`\`\`\`\`\`widget:b\n{}\n\`\`\`\`\`\`widget:c\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([
    [blocks[0], 'A'],
    [blocks[1], 'B'],
    [blocks[2], 'C'],
  ]);

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result).toEqual('ABC');
});

test('replaceWidgetBlocks - partial replacement (not all blocks)', () => {
  const markdown = `\`\`\`widget:first\n{}\n\`\`\`XXX\`\`\`widget:second\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], 'REPLACED']]);

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result.includes('REPLACED')).toEqual(true);
  expect(result.includes('```widget:second')).toEqual(true);
});

test('replaceWidgetBlocks - replacement longer than original', () => {
  const markdown = `\`\`\`widget:test\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);
  const longReplacement =
    'This is a much longer replacement text that exceeds the original block size';
  const replacements = new Map([[blocks[0], longReplacement]]);

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result).toEqual(longReplacement);
});

test('replaceWidgetBlocks - replacement shorter than original', () => {
  const markdown = `\`\`\`widget:test\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);
  const shortReplacement = 'X';
  const replacements = new Map([[blocks[0], shortReplacement]]);

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result).toEqual('X');
});

test('replaceWidgetBlocks - indices remain accurate after sort', () => {
  const markdown =
    `\`\`\`widget:a\n{}\n\`\`\`X\`\`\`widget:b\n{}\n\`\`\`Y\`\`\`widget:c\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  const replacements = new Map([
    [blocks[2], 'C'],
    [blocks[0], 'A'],
    [blocks[1], 'B'],
  ]);

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result).toEqual('AXBYC');
});

test('parseWidgetBlocks + replaceWidgetBlocks - integration test', () => {
  const markdown =
    `## Config\n\n\`\`\`widget:settings\n{"theme": "dark", "lang": "en"}\n\`\`\`\n\nContent`;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].widgetName).toEqual('settings');
  expect((blocks[0].params as Record<string, unknown>)?.theme).toEqual('dark');

  const replacements = new Map([[blocks[0], '<div>Settings Rendered</div>']]);
  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result.includes('## Config')).toEqual(true);
  expect(result.includes('<div>Settings Rendered</div>')).toEqual(true);
  expect(result.includes('Content')).toEqual(true);
});

test('parseWidgetBlocks - widget name with single character', () => {
  const markdown = `\`\`\`widget:a\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].widgetName).toEqual('a');
});

test('parseWidgetBlocks - widget name with hyphen at end', () => {
  const markdown = `\`\`\`widget:widget-\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].widgetName).toEqual('widget-');
});

test('parseWidgetBlocks - widget name starting with hyphen', () => {
  const markdown = `\`\`\`widget:-widget\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(0);
});

test('parseWidgetBlocks - JSON with boolean values', () => {
  const markdown = `\`\`\`widget:bool-widget\n{"enabled": true, "disabled": false}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect((blocks[0].params as Record<string, unknown>)?.enabled).toEqual(true);
  expect((blocks[0].params as Record<string, unknown>)?.disabled).toEqual(false);
});

test('parseWidgetBlocks - JSON with null values', () => {
  const markdown = `\`\`\`widget:null-field\n{"value": null}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect((blocks[0].params as Record<string, unknown>)?.value).toEqual(null);
  expect(blocks[0].parseError).toEqual(undefined);
});

test('parseWidgetBlocks - JSON with numeric values (float)', () => {
  const markdown = `\`\`\`widget:float-widget\n{"pi": 3.14159}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect((blocks[0].params as Record<string, unknown>)?.pi).toEqual(3.14159);
});

test('parseWidgetBlocks - JSON with numeric values (negative)', () => {
  const markdown = `\`\`\`widget:neg-widget\n{"temp": -5, "debt": -1000}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect((blocks[0].params as Record<string, unknown>)?.temp).toEqual(-5);
  expect((blocks[0].params as Record<string, unknown>)?.debt).toEqual(-1000);
});

test('parseWidgetBlocks - very long widget name', () => {
  const longName = 'very-long-widget-name-with-many-hyphens-and-characters-123';
  const markdown = `\`\`\`widget:${longName}\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].widgetName).toEqual(longName);
});

test('parseWidgetBlocks - params with empty nested object', () => {
  const markdown = `\`\`\`widget:nested\n{"empty": {}}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect((blocks[0].params as Record<string, unknown>)?.empty).toEqual({});
});

test('parseWidgetBlocks - params with empty array inside object', () => {
  const markdown = `\`\`\`widget:array\n{"items": []}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect((blocks[0].params as Record<string, unknown>)?.items).toEqual([]);
});

test('parseWidgetBlocks - whitespace before and after widget content', () => {
  const markdown = `\`\`\`widget:spaces\n  \n  {"key": "value"}  \n  \n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect((blocks[0].params as Record<string, unknown>)?.key).toEqual('value');
});

test('replaceWidgetBlocks - HTML content replacement', () => {
  const markdown = `<header></header>\n\`\`\`widget:content\n{}\n\`\`\`\n<footer></footer>`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([
    [blocks[0], '<main><article>Content goes here</article></main>'],
  ]);

  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result.includes('<header></header>')).toEqual(true);
  expect(result.includes('<main><article>Content goes here</article></main>')).toEqual(true);
  expect(result.includes('<footer></footer>')).toEqual(true);
});

test('parseWidgetBlocks - tabs in params content', () => {
  const markdown = `\`\`\`widget:tabs\n{\t"key":\t"value"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].params?.key).toEqual('value');
});

test('parseWidgetBlocks - carriage returns in params', () => {
  const markdown = `\`\`\`widget:crlf\n{"key": "value"}\r\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(blocks[0].params?.key).toEqual('value');
});

test('parseWidgetBlocks - adjacent widget blocks with no content between', () => {
  const markdown = `\`\`\`widget:first\n{}\n\`\`\`\`\`\`widget:second\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(2);
  expect(blocks[0].endIndex).toEqual(blocks[1].startIndex);
});

test('replaceWidgetBlocks - result indices match after replacement', () => {
  const markdown = `start\`\`\`widget:test\n{}\n\`\`\`end`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], 'MID']]);
  const result = replaceWidgetBlocks(markdown, replacements);

  expect(result).toEqual('startMIDend');
  expect(result.length).toEqual(11);
});

test('parseWidgetBlocks - mixed case widget error message', () => {
  const markdown = `\`\`\`widget:mixed-widget\nnot json\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks[0].params).toEqual(null);
  expect(blocks[0].parseError).toBeDefined();
  expect(blocks[0].parseError!).toContain('Invalid JSON');
});

test('parseWidgetBlocks - JSON with very long string', () => {
  const longString = 'a'.repeat(10000);
  const markdown = `\`\`\`widget:longstring\n{"text": "${longString}"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  expect(blocks.length).toEqual(1);
  expect(
    ((blocks[0].params as Record<string, unknown>)?.text as string)?.length,
  ).toEqual(10000);
});
