import { assertEquals, assertStrictEquals } from '@std/assert';
import {
  DATA_SSR_ATTR,
  escapeHtml,
  HTMLElementBase,
  LAZY_ATTR,
  scopeWidgetCss,
  STATUS_MESSAGES,
  unescapeHtml,
} from '../../src/util/html.util.ts';

Deno.test('escapeHtml - basic HTML special characters', () => {
  assertEquals(escapeHtml('<div>'), '&lt;div&gt;');
  assertEquals(escapeHtml('<script>'), '&lt;script&gt;');
  assertEquals(escapeHtml('</script>'), '&lt;/script&gt;');
});

Deno.test('escapeHtml - ampersand', () => {
  assertEquals(escapeHtml('&'), '&amp;');
  assertEquals(escapeHtml('&amp;'), '&amp;amp;');
  assertEquals(escapeHtml('foo & bar'), 'foo &amp; bar');
});

Deno.test('escapeHtml - quotes', () => {
  assertEquals(escapeHtml('"test"'), '&quot;test&quot;');
  assertEquals(escapeHtml("'test'"), '&#39;test&#39;');
  assertEquals(escapeHtml('`test`'), '&#96;test&#96;');
});

Deno.test('escapeHtml - angle brackets', () => {
  assertEquals(escapeHtml('<'), '&lt;');
  assertEquals(escapeHtml('>'), '&gt;');
  assertEquals(escapeHtml('<>'), '&lt;&gt;');
});

Deno.test('escapeHtml - XSS prevention scenarios', () => {
  // Script injection attempt
  assertEquals(
    escapeHtml('<script>alert("xss")</script>'),
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
  );

  // Event handler injection attempt
  assertEquals(
    escapeHtml('<img src="x" onerror="alert(\'xss\')">'),
    '&lt;img src=&quot;x&quot; onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;',
  );

  // HTML entity injection
  assertEquals(
    escapeHtml('&#60;script&#62;'),
    '&amp;#60;script&amp;#62;',
  );

  // JavaScript protocol
  assertEquals(
    escapeHtml('<a href="javascript:alert(\'xss\')">'),
    '&lt;a href=&quot;javascript:alert(&#39;xss&#39;)&quot;&gt;',
  );
});

Deno.test('escapeHtml - all escapable characters together', () => {
  assertEquals(
    escapeHtml('<>"\'&`'),
    '&lt;&gt;&quot;&#39;&amp;&#96;',
  );
});

Deno.test('escapeHtml - empty string', () => {
  assertEquals(escapeHtml(''), '');
});

Deno.test('escapeHtml - plain text with no special characters', () => {
  assertEquals(escapeHtml('hello world'), 'hello world');
  assertEquals(escapeHtml('123'), '123');
  assertEquals(escapeHtml('test123'), 'test123');
});

Deno.test('escapeHtml - unicode characters', () => {
  assertEquals(escapeHtml('你好'), '你好');
  assertEquals(escapeHtml('مرحبا'), 'مرحبا');
  assertEquals(escapeHtml('こんにちは'), 'こんにちは');
  assertEquals(escapeHtml('Ñoño'), 'Ñoño');
  assertEquals(escapeHtml('🎉'), '🎉');
  assertEquals(escapeHtml('Ø'), 'Ø');
});

Deno.test('escapeHtml - unicode with special characters', () => {
  assertEquals(escapeHtml('<你好>'), '&lt;你好&gt;');
  assertEquals(escapeHtml('こんにちは & さようなら'), 'こんにちは &amp; さようなら');
});

Deno.test('escapeHtml - whitespace preservation', () => {
  assertEquals(escapeHtml('  hello  '), '  hello  ');
  assertEquals(escapeHtml('\t\n\r'), '\t\n\r');
  assertEquals(escapeHtml('hello\nworld'), 'hello\nworld');
});

Deno.test('escapeHtml - multiple consecutive special characters', () => {
  assertEquals(escapeHtml('<<<>>>'), '&lt;&lt;&lt;&gt;&gt;&gt;');
  assertEquals(escapeHtml('&&&'), '&amp;&amp;&amp;');
  assertEquals(escapeHtml('""\'\''), '&quot;&quot;&#39;&#39;');
});

Deno.test('escapeHtml - complex HTML document', () => {
  const html = '<html><head><title>"Test" & \'Content\'</title></head><body>`code`</body></html>';
  const escaped = escapeHtml(html);
  assertEquals(
    escaped,
    '&lt;html&gt;&lt;head&gt;&lt;title&gt;&quot;Test&quot; &amp; &#39;Content&#39;&lt;/title&gt;&lt;/head&gt;&lt;body&gt;&#96;code&#96;&lt;/body&gt;&lt;/html&gt;',
  );
});

Deno.test('unescapeHtml - basic HTML entities', () => {
  assertEquals(unescapeHtml('&lt;div&gt;'), '<div>');
  assertEquals(unescapeHtml('&lt;script&gt;'), '<script>');
  assertEquals(unescapeHtml('&lt;/script&gt;'), '</script>');
});

Deno.test('unescapeHtml - ampersand', () => {
  assertEquals(unescapeHtml('&amp;'), '&');
  assertEquals(unescapeHtml('&amp;amp;'), '&amp;');
  assertEquals(unescapeHtml('foo &amp; bar'), 'foo & bar');
});

Deno.test('unescapeHtml - quotes', () => {
  assertEquals(unescapeHtml('&quot;test&quot;'), '"test"');
  assertEquals(unescapeHtml('&#39;test&#39;'), "'test'");
  assertEquals(unescapeHtml('&#96;test&#96;'), '`test`');
});

Deno.test('unescapeHtml - empty string', () => {
  assertEquals(unescapeHtml(''), '');
});

Deno.test('unescapeHtml - plain text', () => {
  assertEquals(unescapeHtml('hello world'), 'hello world');
  assertEquals(unescapeHtml('123'), '123');
});

Deno.test('unescapeHtml - unicode characters', () => {
  assertEquals(unescapeHtml('你好'), '你好');
  assertEquals(unescapeHtml('مرحبا'), 'مرحبا');
  assertEquals(unescapeHtml('🎉'), '🎉');
});

Deno.test('unescapeHtml - whitespace preservation', () => {
  assertEquals(unescapeHtml('  hello  '), '  hello  ');
  assertEquals(unescapeHtml('\t\n\r'), '\t\n\r');
});

Deno.test('unescapeHtml - multiple consecutive entities', () => {
  assertEquals(unescapeHtml('&lt;&lt;&lt;&gt;&gt;&gt;'), '<<<>>>');
  assertEquals(unescapeHtml('&amp;&amp;&amp;'), '&&&');
  assertEquals(unescapeHtml('&quot;&quot;&#39;&#39;'), '""\'\'');
});

Deno.test('unescapeHtml - complex HTML document', () => {
  const escaped =
    '&lt;html&gt;&lt;head&gt;&lt;title&gt;&quot;Test&quot; &amp; &#39;Content&#39;&lt;/title&gt;&lt;/head&gt;&lt;body&gt;&#96;code&#96;&lt;/body&gt;&lt;/html&gt;';
  const expected =
    '<html><head><title>"Test" & \'Content\'</title></head><body>`code`</body></html>';
  assertEquals(unescapeHtml(escaped), expected);
});

Deno.test('roundtrip: escape then unescape', () => {
  const original = '<script>alert("xss")</script>';
  const escaped = escapeHtml(original);
  const unescaped = unescapeHtml(escaped);
  assertEquals(unescaped, original);
});

Deno.test('roundtrip: escape then unescape with mixed content', () => {
  const original =
    '<div class="container" data-attr=\'value\'>`code` & "quotes" & \'apostrophes\'</div>';
  const escaped = escapeHtml(original);
  const unescaped = unescapeHtml(escaped);
  assertEquals(unescaped, original);
});

Deno.test('roundtrip: escape then unescape with unicode', () => {
  const original = '你好 <tag> مرحبا & こんにちは';
  const escaped = escapeHtml(original);
  const unescaped = unescapeHtml(escaped);
  assertEquals(unescaped, original);
});

Deno.test('roundtrip: unescape then escape', () => {
  const original = '&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt;';
  const unescaped = unescapeHtml(original);
  const escaped = escapeHtml(unescaped);
  assertEquals(escaped, original);
});

Deno.test('unescapeHtml - partial entities (should not convert)', () => {
  // Incomplete entities should remain as-is
  assertEquals(unescapeHtml('&lt'), '&lt');
  assertEquals(unescapeHtml('&#39'), '&#39');
  assertEquals(unescapeHtml('&quot'), '&quot');
});

Deno.test('scopeWidgetCss - basic scoping', () => {
  const css = 'body { color: red; }';
  const result = scopeWidgetCss(css, 'my-widget');
  assertEquals(result, '@scope (widget-my-widget) {\nbody { color: red; }\n}');
});

Deno.test('scopeWidgetCss - with hyphenated widget name', () => {
  const css = '.button { background: blue; }';
  const result = scopeWidgetCss(css, 'awesome-button');
  assertEquals(result, '@scope (widget-awesome-button) {\n.button { background: blue; }\n}');
});

Deno.test('scopeWidgetCss - with empty CSS', () => {
  const result = scopeWidgetCss('', 'widget');
  assertEquals(result, '@scope (widget-widget) {\n\n}');
});

Deno.test('scopeWidgetCss - with multiline CSS', () => {
  const css = `body {
  color: red;
  font-size: 16px;
}

.container {
  padding: 10px;
}`;
  const result = scopeWidgetCss(css, 'complex');
  assertEquals(
    result,
    `@scope (widget-complex) {
${css}
}`,
  );
});

Deno.test('scopeWidgetCss - with special characters in widget name', () => {
  const css = 'p { margin: 0; }';
  const result = scopeWidgetCss(css, 'my-awesome-widget-v2');
  assertEquals(result, '@scope (widget-my-awesome-widget-v2) {\np { margin: 0; }\n}');
});

Deno.test('scopeWidgetCss - with unicode in CSS', () => {
  const css = '.content { content: "你好"; }';
  const result = scopeWidgetCss(css, 'i18n');
  assertEquals(result, '@scope (widget-i18n) {\n.content { content: "你好"; }\n}');
});

Deno.test('DATA_SSR_ATTR constant', () => {
  assertEquals(DATA_SSR_ATTR, 'data-ssr');
  assertStrictEquals(typeof DATA_SSR_ATTR, 'string');
});

Deno.test('LAZY_ATTR constant', () => {
  assertEquals(LAZY_ATTR, 'lazy');
  assertStrictEquals(typeof LAZY_ATTR, 'string');
});

Deno.test('STATUS_MESSAGES - contains expected status codes', () => {
  assertEquals(STATUS_MESSAGES[401], 'Unauthorized');
  assertEquals(STATUS_MESSAGES[403], 'Forbidden');
  assertEquals(STATUS_MESSAGES[404], 'Not Found');
  assertEquals(STATUS_MESSAGES[500], 'Internal Server Error');
});

Deno.test('STATUS_MESSAGES - only contains expected keys', () => {
  const expectedKeys = ['401', '403', '404', '500'];
  const actualKeys = Object.keys(STATUS_MESSAGES).sort();
  assertEquals(actualKeys, expectedKeys.sort());
});

Deno.test('STATUS_MESSAGES - all values are non-empty strings', () => {
  for (const [code, message] of Object.entries(STATUS_MESSAGES)) {
    assertStrictEquals(typeof message, 'string');
    assertEquals(message.length > 0, true, `Status ${code} has empty message`);
  }
});

Deno.test('HTMLElementBase - exports a constructor', () => {
  assertStrictEquals(typeof HTMLElementBase, 'function');
});

Deno.test('HTMLElementBase - is usable as a base class', () => {
  class TestElement extends HTMLElementBase {
    value = 'test';
  }
  const instance = new TestElement();
  assertEquals(instance.value, 'test');
});

Deno.test('escapeHtml - order of replacement matters (ampersand first)', () => {
  // Ensure ampersand is replaced first to avoid double-escaping
  const input = '&<>"\'`';
  const escaped = escapeHtml(input);
  // Each character should appear exactly once escaped
  assertEquals(escaped.match(/&amp;/g)!.length, 1);
  assertEquals(escaped.match(/&lt;/g)!.length, 1);
  assertEquals(escaped.match(/&gt;/g)!.length, 1);
  assertEquals(escaped.match(/&quot;/g)!.length, 1);
  assertEquals(escaped.match(/&#39;/g)!.length, 1);
  assertEquals(escaped.match(/&#96;/g)!.length, 1);
});

Deno.test('escapeHtml - long strings with many special characters', () => {
  const input = '<>'.repeat(100) + '&'.repeat(100) + '"\'`'.repeat(100);
  const escaped = escapeHtml(input);
  // Should not contain unescaped special characters
  assertEquals(escaped.includes('<'), false);
  assertEquals(escaped.includes('>'), false);
  assertEquals(escaped.includes('&') && !escaped.includes('&amp;'), false);
});

Deno.test('unescapeHtml - unknown entities left unchanged', () => {
  assertEquals(unescapeHtml('&unknown;'), '&unknown;');
  assertEquals(unescapeHtml('&#999999;'), '&#999999;');
});

Deno.test('escapeHtml and unescapeHtml - idempotence on plain text', () => {
  const plainText = 'This is plain text with no special characters';
  assertEquals(escapeHtml(plainText), plainText);
  assertEquals(unescapeHtml(plainText), plainText);
});

Deno.test('escapeHtml - preserves numbers and common symbols that are not escaped', () => {
  const input = '0123456789!@#$%=+-*()[]{}|;:,./? ';
  const expected = '0123456789!@#$%=+-*()[]{}|;:,./? ';
  assertEquals(escapeHtml(input), expected);
});

Deno.test('HTML injection prevention - prevents CDATA injection', () => {
  const input = '<![CDATA[alert("xss")]]>';
  const escaped = escapeHtml(input);
  assertEquals(escaped, '&lt;![CDATA[alert(&quot;xss&quot;)]]&gt;');
});

Deno.test('HTML injection prevention - prevents comment injection', () => {
  const input = '<!-- comment with <script> -->';
  const escaped = escapeHtml(input);
  assertEquals(escaped, '&lt;!-- comment with &lt;script&gt; --&gt;');
});

Deno.test('scopeWidgetCss - does not escape CSS content', () => {
  const css = '@media (max-width: 768px) { body { color: < test >; } }';
  const result = scopeWidgetCss(css, 'responsive');
  // CSS content should remain unchanged
  assertEquals(
    result,
    '@scope (widget-responsive) {\n@media (max-width: 768px) { body { color: < test >; } }\n}',
  );
});
