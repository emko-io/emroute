import {
  assertEquals,
  assertExists,
  assertIsError,
  assertObjectMatch,
  assertStringIncludes,
} from '@std/assert';
import { parseWidgetBlocks, replaceWidgetBlocks } from '../../src/widget/widget.parser.ts';
import type { ParsedWidgetBlock } from '../../src/type/widget.type.ts';

Deno.test('parseWidgetBlocks - single widget block', () => {
  const markdown = `Some text\n\`\`\`widget:test-widget\n{"key": "value"}\n\`\`\`\nMore text`;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].widgetName, 'test-widget');
  assertExists(blocks[0].params);
  assertObjectMatch(blocks[0].params!, { key: 'value' });
  assertEquals(blocks[0].parseError, undefined);
});

Deno.test('parseWidgetBlocks - multiple widget blocks', () => {
  const markdown =
    `\`\`\`widget:first-widget\n{"a": 1}\n\`\`\`\nText between\n\`\`\`widget:second-widget\n{"b": 2}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 2);
  assertEquals(blocks[0].widgetName, 'first-widget');
  assertEquals(blocks[1].widgetName, 'second-widget');
  assertExists(blocks[0].params);
  assertExists(blocks[1].params);
  assertObjectMatch(blocks[0].params!, { a: 1 });
  assertObjectMatch(blocks[1].params!, { b: 2 });
});

Deno.test('parseWidgetBlocks - widget with valid JSON params', () => {
  const markdown =
    `\`\`\`widget:data-widget\n{"name": "test", "count": 42, "active": true}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertExists(blocks[0].params);
  assertObjectMatch(blocks[0].params!, {
    name: 'test',
    count: 42,
    active: true,
  });
  assertEquals(blocks[0].parseError, undefined);
});

Deno.test('parseWidgetBlocks - widget with empty params', () => {
  const markdown = `\`\`\`widget:empty-widget\n\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].widgetName, 'empty-widget');
  assertExists(blocks[0].params);
  assertObjectMatch(blocks[0].params!, {});
  assertEquals(blocks[0].parseError, undefined);
});

Deno.test('parseWidgetBlocks - widget with whitespace only params', () => {
  const markdown = `\`\`\`widget:ws-widget\n   \n\t\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertExists(blocks[0].params);
  assertObjectMatch(blocks[0].params!, {});
  assertEquals(blocks[0].parseError, undefined);
});

Deno.test('parseWidgetBlocks - widget with invalid JSON params', () => {
  const markdown = `\`\`\`widget:bad-widget\n{invalid json}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].widgetName, 'bad-widget');
  assertEquals(blocks[0].params, null);
  assertExists(blocks[0].parseError);
  assertStringIncludes(blocks[0].parseError!, 'Invalid JSON');
});

Deno.test('parseWidgetBlocks - widget with malformed JSON (missing closing brace)', () => {
  const markdown = `\`\`\`widget:bad-widget\n{"key": "value"\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params, null);
  assertExists(blocks[0].parseError);
  assertStringIncludes(blocks[0].parseError!, 'Invalid JSON');
});

Deno.test('parseWidgetBlocks - widget with array instead of object params', () => {
  const markdown = `\`\`\`widget:array-widget\n[1, 2, 3]\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params, null);
  assertExists(blocks[0].parseError);
  assertEquals(blocks[0].parseError, 'Params must be a JSON object');
});

Deno.test('parseWidgetBlocks - widget with null params', () => {
  const markdown = `\`\`\`widget:null-widget\nnull\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params, null);
  assertExists(blocks[0].parseError);
  assertEquals(blocks[0].parseError, 'Params must be a JSON object');
});

Deno.test('parseWidgetBlocks - widget with string params', () => {
  const markdown = `\`\`\`widget:string-widget\n"just a string"\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params, null);
  assertExists(blocks[0].parseError);
  assertEquals(blocks[0].parseError, 'Params must be a JSON object');
});

Deno.test('parseWidgetBlocks - widget with number params', () => {
  const markdown = `\`\`\`widget:number-widget\n42\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params, null);
  assertExists(blocks[0].parseError);
  assertEquals(blocks[0].parseError, 'Params must be a JSON object');
});

Deno.test('parseWidgetBlocks - widget with nested objects', () => {
  const markdown =
    `\`\`\`widget:nested-widget\n{"user": {"name": "John", "age": 30}, "tags": ["a", "b"]}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertExists(blocks[0].params);
  assertObjectMatch(blocks[0].params!, {
    user: { name: 'John', age: 30 },
    tags: ['a', 'b'],
  });
  assertEquals(blocks[0].parseError, undefined);
});

Deno.test('parseWidgetBlocks - widget with deeply nested objects', () => {
  const markdown = `\`\`\`widget:deep-widget\n{"a": {"b": {"c": {"d": "deep"}}}}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals((blocks[0].params as Record<string, unknown>)?.a, {
    b: { c: { d: 'deep' } },
  });
});

Deno.test('parseWidgetBlocks - widget with special characters in strings', () => {
  const markdown =
    `\`\`\`widget:special-widget\n{"text": "Hello\\nWorld", "emoji": "🎉", "quote": "\\"quoted\\""}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals((blocks[0].params as Record<string, unknown>)?.text, 'Hello\nWorld');
  assertEquals((blocks[0].params as Record<string, unknown>)?.emoji, '🎉');
  assertEquals((blocks[0].params as Record<string, unknown>)?.quote, '"quoted"');
});

Deno.test('parseWidgetBlocks - no widget blocks', () => {
  const markdown = `# Header\n\nThis is just regular markdown with no widgets.`;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 0);
});

Deno.test('parseWidgetBlocks - malformed widget missing backticks', () => {
  const markdown = `widget:test-widget\n{"key": "value"}\n`;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 0);
});

Deno.test('parseWidgetBlocks - malformed widget with wrong delimiter', () => {
  const markdown = `~~~widget:test-widget\n{"key": "value"}\n~~~`;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 0);
});

Deno.test('parseWidgetBlocks - malformed widget missing closing fence', () => {
  const markdown = `\`\`\`widget:test-widget\n{"key": "value"}`;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 0);
});

Deno.test('parseWidgetBlocks - widget with uppercase letters in name', () => {
  const markdown = `\`\`\`widget:TestWidget\n{"key": "value"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 0);
});

Deno.test('parseWidgetBlocks - widget with underscore in name', () => {
  const markdown = `\`\`\`widget:test_widget\n{"key": "value"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 0);
});

Deno.test('parseWidgetBlocks - widget with valid hyphenated name', () => {
  const markdown = `\`\`\`widget:my-cool-widget\n{"key": "value"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].widgetName, 'my-cool-widget');
});

Deno.test('parseWidgetBlocks - widget with numbers in name', () => {
  const markdown = `\`\`\`widget:widget-v2-test\n{"key": "value"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].widgetName, 'widget-v2-test');
});

Deno.test('parseWidgetBlocks - widget starting with number', () => {
  const markdown = `\`\`\`widget:2fast\n{"key": "value"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 0);
});

Deno.test('parseWidgetBlocks - block positions and indices', () => {
  const markdown = `before\`\`\`widget:first\n{}\n\`\`\`after`;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].startIndex, 6);
  assertEquals(blocks[0].endIndex, 28);
  assertEquals(markdown.substring(blocks[0].startIndex, blocks[0].endIndex), blocks[0].fullMatch);
});

Deno.test('parseWidgetBlocks - multiple blocks with correct indices', () => {
  const markdown = `\`\`\`widget:first\n{}\n\`\`\`XXX\`\`\`widget:second\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 2);
  assertEquals(markdown.substring(blocks[0].startIndex, blocks[0].endIndex), blocks[0].fullMatch);
  assertEquals(markdown.substring(blocks[1].startIndex, blocks[1].endIndex), blocks[1].fullMatch);
});

Deno.test('parseWidgetBlocks - fullMatch property is correct', () => {
  const markdown = `\`\`\`widget:test\n{"key": "value"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks[0].fullMatch, markdown);
});

Deno.test('parseWidgetBlocks - complex JSON with escaped quotes', () => {
  const markdown = `\`\`\`widget:quote-widget\n{"text": "He said \\"hello\\""}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params?.text, 'He said "hello"');
  assertEquals(blocks[0].parseError, undefined);
});

Deno.test('parseWidgetBlocks - JSON with multiline newlines', () => {
  const markdown =
    `\`\`\`widget:multi-widget\n{\n  "key": "value",\n  "nested": {\n    "deep": true\n  }\n}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals((blocks[0].params as Record<string, unknown>)?.key, 'value');
  assertEquals(
    ((blocks[0].params as Record<string, unknown>)?.nested as Record<string, unknown>)?.deep,
    true,
  );
});

Deno.test('parseWidgetBlocks - params with unicode characters', () => {
  const markdown = `\`\`\`widget:unicode-widget\n{"greeting": "你好", "emoji": "🚀🌟"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals((blocks[0].params as Record<string, unknown>)?.greeting, '你好');
  assertEquals((blocks[0].params as Record<string, unknown>)?.emoji, '🚀🌟');
});

Deno.test('parseWidgetBlocks - empty markdown string', () => {
  const markdown = '';
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 0);
});

Deno.test('parseWidgetBlocks - three widget blocks in sequence', () => {
  const markdown = `\`\`\`widget:a\n{}\n\`\`\`\`\`\`widget:b\n{}\n\`\`\`\`\`\`widget:c\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 3);
  assertEquals(blocks[0].widgetName, 'a');
  assertEquals(blocks[1].widgetName, 'b');
  assertEquals(blocks[2].widgetName, 'c');
});

Deno.test('replaceWidgetBlocks - replace single block', () => {
  const markdown = `prefix\`\`\`widget:test\n{}\n\`\`\`suffix`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], 'REPLACEMENT']]);

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result, 'prefixREPLACEMENTsuffix');
});

Deno.test('replaceWidgetBlocks - replace multiple blocks', () => {
  const markdown = `\`\`\`widget:first\n{}\n\`\`\`TEXT\`\`\`widget:second\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([
    [blocks[0], 'FIRST'],
    [blocks[1], 'SECOND'],
  ]);

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result, 'FIRSTTEXTSECOND');
});

Deno.test('replaceWidgetBlocks - order of replacement (descending indices)', () => {
  const markdown = `START\`\`\`widget:first\n{}\n\`\`\`MID\`\`\`widget:second\n{}\n\`\`\`END`;
  const blocks = parseWidgetBlocks(markdown);

  const replacements = new Map([
    [blocks[0], 'FIRST_REPLACED'],
    [blocks[1], 'SECOND_REPLACED'],
  ]);

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result, 'STARTFIRST_REPLACEDMIDSECOND_REPLACEDEND');
});

Deno.test('replaceWidgetBlocks - preserve surrounding content', () => {
  const markdown = `# Header\n\nSome paragraph\n\`\`\`widget:widget\n{}\n\`\`\`\n\nMore text`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], '[RENDERED]']]);

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result.includes('# Header'), true);
  assertEquals(result.includes('Some paragraph'), true);
  assertEquals(result.includes('More text'), true);
  assertEquals(result.includes('[RENDERED]'), true);
});

Deno.test('replaceWidgetBlocks - empty replacement string', () => {
  const markdown = `before\`\`\`widget:test\n{}\n\`\`\`after`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], '']]);

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result, 'beforeafter');
});

Deno.test('replaceWidgetBlocks - replacement with special characters', () => {
  const markdown = `\`\`\`widget:test\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], '<div class="special">Content</div>']]);

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result, '<div class="special">Content</div>');
});

Deno.test('replaceWidgetBlocks - replacement with newlines', () => {
  const markdown = `start\`\`\`widget:test\n{}\n\`\`\`end`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], 'line1\nline2\nline3']]);

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result, 'startline1\nline2\nline3end');
});

Deno.test('replaceWidgetBlocks - replacement preserves other content in order', () => {
  const markdown = `A\`\`\`widget:first\n{}\n\`\`\`B\`\`\`widget:second\n{}\n\`\`\`C`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([
    [blocks[0], '1'],
    [blocks[1], '2'],
  ]);

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result, 'A1B2C');
});

Deno.test('replaceWidgetBlocks - empty replacements map', () => {
  const markdown = `\`\`\`widget:test\n{}\n\`\`\``;
  const replacements = new Map<ParsedWidgetBlock, string>();

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result, markdown);
});

Deno.test('replaceWidgetBlocks - single block in middle', () => {
  const markdown = `Chapter 1\n\nContent\n\`\`\`widget:sidebar\n{}\n\`\`\`\n\nMore content`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], '<aside>Sidebar</aside>']]);

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result.includes('Chapter 1'), true);
  assertEquals(result.includes('<aside>Sidebar</aside>'), true);
  assertEquals(result.includes('More content'), true);
});

Deno.test('replaceWidgetBlocks - three consecutive blocks', () => {
  const markdown = `\`\`\`widget:a\n{}\n\`\`\`\`\`\`widget:b\n{}\n\`\`\`\`\`\`widget:c\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([
    [blocks[0], 'A'],
    [blocks[1], 'B'],
    [blocks[2], 'C'],
  ]);

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result, 'ABC');
});

Deno.test('replaceWidgetBlocks - partial replacement (not all blocks)', () => {
  const markdown = `\`\`\`widget:first\n{}\n\`\`\`XXX\`\`\`widget:second\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], 'REPLACED']]);

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result.includes('REPLACED'), true);
  assertEquals(result.includes('```widget:second'), true);
});

Deno.test('replaceWidgetBlocks - replacement longer than original', () => {
  const markdown = `\`\`\`widget:test\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);
  const longReplacement =
    'This is a much longer replacement text that exceeds the original block size';
  const replacements = new Map([[blocks[0], longReplacement]]);

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result, longReplacement);
});

Deno.test('replaceWidgetBlocks - replacement shorter than original', () => {
  const markdown = `\`\`\`widget:test\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);
  const shortReplacement = 'X';
  const replacements = new Map([[blocks[0], shortReplacement]]);

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result, 'X');
});

Deno.test('replaceWidgetBlocks - indices remain accurate after sort', () => {
  const markdown =
    `\`\`\`widget:a\n{}\n\`\`\`X\`\`\`widget:b\n{}\n\`\`\`Y\`\`\`widget:c\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  const replacements = new Map([
    [blocks[2], 'C'],
    [blocks[0], 'A'],
    [blocks[1], 'B'],
  ]);

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result, 'AXBYC');
});

Deno.test('parseWidgetBlocks + replaceWidgetBlocks - integration test', () => {
  const markdown =
    `## Config\n\n\`\`\`widget:settings\n{"theme": "dark", "lang": "en"}\n\`\`\`\n\nContent`;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].widgetName, 'settings');
  assertEquals((blocks[0].params as Record<string, unknown>)?.theme, 'dark');

  const replacements = new Map([[blocks[0], '<div>Settings Rendered</div>']]);
  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result.includes('## Config'), true);
  assertEquals(result.includes('<div>Settings Rendered</div>'), true);
  assertEquals(result.includes('Content'), true);
});

Deno.test('parseWidgetBlocks - widget name with single character', () => {
  const markdown = `\`\`\`widget:a\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].widgetName, 'a');
});

Deno.test('parseWidgetBlocks - widget name with hyphen at end', () => {
  const markdown = `\`\`\`widget:widget-\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].widgetName, 'widget-');
});

Deno.test('parseWidgetBlocks - widget name starting with hyphen', () => {
  const markdown = `\`\`\`widget:-widget\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 0);
});

Deno.test('parseWidgetBlocks - JSON with boolean values', () => {
  const markdown = `\`\`\`widget:bool-widget\n{"enabled": true, "disabled": false}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals((blocks[0].params as Record<string, unknown>)?.enabled, true);
  assertEquals((blocks[0].params as Record<string, unknown>)?.disabled, false);
});

Deno.test('parseWidgetBlocks - JSON with null values', () => {
  const markdown = `\`\`\`widget:null-field\n{"value": null}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals((blocks[0].params as Record<string, unknown>)?.value, null);
  assertEquals(blocks[0].parseError, undefined);
});

Deno.test('parseWidgetBlocks - JSON with numeric values (float)', () => {
  const markdown = `\`\`\`widget:float-widget\n{"pi": 3.14159}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals((blocks[0].params as Record<string, unknown>)?.pi, 3.14159);
});

Deno.test('parseWidgetBlocks - JSON with numeric values (negative)', () => {
  const markdown = `\`\`\`widget:neg-widget\n{"temp": -5, "debt": -1000}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals((blocks[0].params as Record<string, unknown>)?.temp, -5);
  assertEquals((blocks[0].params as Record<string, unknown>)?.debt, -1000);
});

Deno.test('parseWidgetBlocks - very long widget name', () => {
  const longName = 'very-long-widget-name-with-many-hyphens-and-characters-123';
  const markdown = `\`\`\`widget:${longName}\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].widgetName, longName);
});

Deno.test('parseWidgetBlocks - params with empty nested object', () => {
  const markdown = `\`\`\`widget:nested\n{"empty": {}}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals((blocks[0].params as Record<string, unknown>)?.empty, {});
});

Deno.test('parseWidgetBlocks - params with empty array inside object', () => {
  const markdown = `\`\`\`widget:array\n{"items": []}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals((blocks[0].params as Record<string, unknown>)?.items, []);
});

Deno.test('parseWidgetBlocks - whitespace before and after widget content', () => {
  const markdown = `\`\`\`widget:spaces\n  \n  {"key": "value"}  \n  \n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals((blocks[0].params as Record<string, unknown>)?.key, 'value');
});

Deno.test('replaceWidgetBlocks - HTML content replacement', () => {
  const markdown = `<header></header>\n\`\`\`widget:content\n{}\n\`\`\`\n<footer></footer>`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([
    [blocks[0], '<main><article>Content goes here</article></main>'],
  ]);

  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result.includes('<header></header>'), true);
  assertEquals(result.includes('<main><article>Content goes here</article></main>'), true);
  assertEquals(result.includes('<footer></footer>'), true);
});

Deno.test('parseWidgetBlocks - tabs in params content', () => {
  const markdown = `\`\`\`widget:tabs\n{\t"key":\t"value"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params?.key, 'value');
});

Deno.test('parseWidgetBlocks - carriage returns in params', () => {
  const markdown = `\`\`\`widget:crlf\n{"key": "value"}\r\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params?.key, 'value');
});

Deno.test('parseWidgetBlocks - adjacent widget blocks with no content between', () => {
  const markdown = `\`\`\`widget:first\n{}\n\`\`\`\`\`\`widget:second\n{}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 2);
  assertEquals(blocks[0].endIndex, blocks[1].startIndex);
});

Deno.test('replaceWidgetBlocks - result indices match after replacement', () => {
  const markdown = `start\`\`\`widget:test\n{}\n\`\`\`end`;
  const blocks = parseWidgetBlocks(markdown);
  const replacements = new Map([[blocks[0], 'MID']]);
  const result = replaceWidgetBlocks(markdown, replacements);

  assertEquals(result, 'startMIDend');
  assertEquals(result.length, 11);
});

Deno.test('parseWidgetBlocks - mixed case widget error message', () => {
  const markdown = `\`\`\`widget:mixed-widget\nnot json\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks[0].params, null);
  assertExists(blocks[0].parseError);
  assertStringIncludes(blocks[0].parseError!, 'Invalid JSON');
});

Deno.test('parseWidgetBlocks - JSON with very long string', () => {
  const longString = 'a'.repeat(10000);
  const markdown = `\`\`\`widget:longstring\n{"text": "${longString}"}\n\`\`\``;
  const blocks = parseWidgetBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(
    ((blocks[0].params as Record<string, unknown>)?.text as string)?.length,
    10000,
  );
});
