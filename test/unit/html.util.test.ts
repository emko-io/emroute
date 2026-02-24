import { test, expect } from 'bun:test';
import {
  escapeHtml,
  HTMLElementBase,
  LAZY_ATTR,
  scopeWidgetCss,
  SSR_ATTR,
  STATUS_MESSAGES,
  unescapeHtml,
} from '../../src/util/html.util.ts';

test('escapeHtml - basic HTML special characters', () => {
  expect(escapeHtml('<div>')).toEqual('&lt;div&gt;');
  expect(escapeHtml('<script>')).toEqual('&lt;script&gt;');
  expect(escapeHtml('</script>')).toEqual('&lt;/script&gt;');
});

test('escapeHtml - ampersand', () => {
  expect(escapeHtml('&')).toEqual('&amp;');
  expect(escapeHtml('&amp;')).toEqual('&amp;amp;');
  expect(escapeHtml('foo & bar')).toEqual('foo &amp; bar');
});

test('escapeHtml - quotes', () => {
  expect(escapeHtml('"test"')).toEqual('&quot;test&quot;');
  expect(escapeHtml("'test'")).toEqual('&#39;test&#39;');
  expect(escapeHtml('`test`')).toEqual('&#96;test&#96;');
});

test('escapeHtml - angle brackets', () => {
  expect(escapeHtml('<')).toEqual('&lt;');
  expect(escapeHtml('>')).toEqual('&gt;');
  expect(escapeHtml('<>')).toEqual('&lt;&gt;');
});

test('escapeHtml - XSS prevention scenarios', () => {
  // Script injection attempt
  expect(
    escapeHtml('<script>alert("xss")</script>'),
  ).toEqual(
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
  );

  // Event handler injection attempt
  expect(
    escapeHtml('<img src="x" onerror="alert(\'xss\')">'),
  ).toEqual(
    '&lt;img src=&quot;x&quot; onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;',
  );

  // HTML entity injection
  expect(
    escapeHtml('&#60;script&#62;'),
  ).toEqual(
    '&amp;#60;script&amp;#62;',
  );

  // JavaScript protocol
  expect(
    escapeHtml('<a href="javascript:alert(\'xss\')">'),
  ).toEqual(
    '&lt;a href=&quot;javascript:alert(&#39;xss&#39;)&quot;&gt;',
  );
});

test('escapeHtml - all escapable characters together', () => {
  expect(
    escapeHtml('<>"\'&`'),
  ).toEqual(
    '&lt;&gt;&quot;&#39;&amp;&#96;',
  );
});

test('escapeHtml - empty string', () => {
  expect(escapeHtml('')).toEqual('');
});

test('escapeHtml - plain text with no special characters', () => {
  expect(escapeHtml('hello world')).toEqual('hello world');
  expect(escapeHtml('123')).toEqual('123');
  expect(escapeHtml('test123')).toEqual('test123');
});

test('escapeHtml - unicode characters', () => {
  expect(escapeHtml('你好')).toEqual('你好');
  expect(escapeHtml('مرحبا')).toEqual('مرحبا');
  expect(escapeHtml('こんにちは')).toEqual('こんにちは');
  expect(escapeHtml('Ñoño')).toEqual('Ñoño');
  expect(escapeHtml('🎉')).toEqual('🎉');
  expect(escapeHtml('Ø')).toEqual('Ø');
});

test('escapeHtml - unicode with special characters', () => {
  expect(escapeHtml('<你好>')).toEqual('&lt;你好&gt;');
  expect(escapeHtml('こんにちは & さようなら')).toEqual('こんにちは &amp; さようなら');
});

test('escapeHtml - whitespace preservation', () => {
  expect(escapeHtml('  hello  ')).toEqual('  hello  ');
  expect(escapeHtml('\t\n\r')).toEqual('\t\n\r');
  expect(escapeHtml('hello\nworld')).toEqual('hello\nworld');
});

test('escapeHtml - multiple consecutive special characters', () => {
  expect(escapeHtml('<<<>>>')).toEqual('&lt;&lt;&lt;&gt;&gt;&gt;');
  expect(escapeHtml('&&&')).toEqual('&amp;&amp;&amp;');
  expect(escapeHtml('""\'\'') ).toEqual('&quot;&quot;&#39;&#39;');
});

test('escapeHtml - complex HTML document', () => {
  const html = '<html><head><title>"Test" & \'Content\'</title></head><body>`code`</body></html>';
  const escaped = escapeHtml(html);
  expect(
    escaped,
  ).toEqual(
    '&lt;html&gt;&lt;head&gt;&lt;title&gt;&quot;Test&quot; &amp; &#39;Content&#39;&lt;/title&gt;&lt;/head&gt;&lt;body&gt;&#96;code&#96;&lt;/body&gt;&lt;/html&gt;',
  );
});

test('unescapeHtml - basic HTML entities', () => {
  expect(unescapeHtml('&lt;div&gt;')).toEqual('<div>');
  expect(unescapeHtml('&lt;script&gt;')).toEqual('<script>');
  expect(unescapeHtml('&lt;/script&gt;')).toEqual('</script>');
});

test('unescapeHtml - ampersand', () => {
  expect(unescapeHtml('&amp;')).toEqual('&');
  expect(unescapeHtml('&amp;amp;')).toEqual('&amp;');
  expect(unescapeHtml('foo &amp; bar')).toEqual('foo & bar');
});

test('unescapeHtml - quotes', () => {
  expect(unescapeHtml('&quot;test&quot;')).toEqual('"test"');
  expect(unescapeHtml('&#39;test&#39;')).toEqual("'test'");
  expect(unescapeHtml('&#96;test&#96;')).toEqual('`test`');
});

test('unescapeHtml - empty string', () => {
  expect(unescapeHtml('')).toEqual('');
});

test('unescapeHtml - plain text', () => {
  expect(unescapeHtml('hello world')).toEqual('hello world');
  expect(unescapeHtml('123')).toEqual('123');
});

test('unescapeHtml - unicode characters', () => {
  expect(unescapeHtml('你好')).toEqual('你好');
  expect(unescapeHtml('مرحبا')).toEqual('مرحبا');
  expect(unescapeHtml('🎉')).toEqual('🎉');
});

test('unescapeHtml - whitespace preservation', () => {
  expect(unescapeHtml('  hello  ')).toEqual('  hello  ');
  expect(unescapeHtml('\t\n\r')).toEqual('\t\n\r');
});

test('unescapeHtml - multiple consecutive entities', () => {
  expect(unescapeHtml('&lt;&lt;&lt;&gt;&gt;&gt;')).toEqual('<<<>>>');
  expect(unescapeHtml('&amp;&amp;&amp;')).toEqual('&&&');
  expect(unescapeHtml('&quot;&quot;&#39;&#39;')).toEqual('""\'\'');
});

test('unescapeHtml - complex HTML document', () => {
  const escaped =
    '&lt;html&gt;&lt;head&gt;&lt;title&gt;&quot;Test&quot; &amp; &#39;Content&#39;&lt;/title&gt;&lt;/head&gt;&lt;body&gt;&#96;code&#96;&lt;/body&gt;&lt;/html&gt;';
  const expected =
    '<html><head><title>"Test" & \'Content\'</title></head><body>`code`</body></html>';
  expect(unescapeHtml(escaped)).toEqual(expected);
});

test('roundtrip: escape then unescape', () => {
  const original = '<script>alert("xss")</script>';
  const escaped = escapeHtml(original);
  const unescaped = unescapeHtml(escaped);
  expect(unescaped).toEqual(original);
});

test('roundtrip: escape then unescape with mixed content', () => {
  const original =
    '<div class="container" data-attr=\'value\'>`code` & "quotes" & \'apostrophes\'</div>';
  const escaped = escapeHtml(original);
  const unescaped = unescapeHtml(escaped);
  expect(unescaped).toEqual(original);
});

test('roundtrip: escape then unescape with unicode', () => {
  const original = '你好 <tag> مرحبا & こんにちは';
  const escaped = escapeHtml(original);
  const unescaped = unescapeHtml(escaped);
  expect(unescaped).toEqual(original);
});

test('roundtrip: unescape then escape', () => {
  const original = '&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt;';
  const unescaped = unescapeHtml(original);
  const escaped = escapeHtml(unescaped);
  expect(escaped).toEqual(original);
});

test('unescapeHtml - partial entities (should not convert)', () => {
  // Incomplete entities should remain as-is
  expect(unescapeHtml('&lt')).toEqual('&lt');
  expect(unescapeHtml('&#39')).toEqual('&#39');
  expect(unescapeHtml('&quot')).toEqual('&quot');
});

test('scopeWidgetCss - basic scoping', () => {
  const css = 'body { color: red; }';
  const result = scopeWidgetCss(css, 'my-widget');
  expect(result).toEqual('@scope (widget-my-widget) {\nbody { color: red; }\n}');
});

test('scopeWidgetCss - with hyphenated widget name', () => {
  const css = '.button { background: blue; }';
  const result = scopeWidgetCss(css, 'awesome-button');
  expect(result).toEqual('@scope (widget-awesome-button) {\n.button { background: blue; }\n}');
});

test('scopeWidgetCss - with empty CSS', () => {
  const result = scopeWidgetCss('', 'widget');
  expect(result).toEqual('@scope (widget-widget) {\n\n}');
});

test('scopeWidgetCss - with multiline CSS', () => {
  const css = `body {
  color: red;
  font-size: 16px;
}

.container {
  padding: 10px;
}`;
  const result = scopeWidgetCss(css, 'complex');
  expect(
    result,
  ).toEqual(
    `@scope (widget-complex) {
${css}
}`,
  );
});

test('scopeWidgetCss - with special characters in widget name', () => {
  const css = 'p { margin: 0; }';
  const result = scopeWidgetCss(css, 'my-awesome-widget-v2');
  expect(result).toEqual('@scope (widget-my-awesome-widget-v2) {\np { margin: 0; }\n}');
});

test('scopeWidgetCss - with unicode in CSS', () => {
  const css = '.content { content: "你好"; }';
  const result = scopeWidgetCss(css, 'i18n');
  expect(result).toEqual('@scope (widget-i18n) {\n.content { content: "你好"; }\n}');
});

test('SSR_ATTR constant', () => {
  expect(SSR_ATTR).toEqual('ssr');
  expect(typeof SSR_ATTR).toBe('string');
});

test('LAZY_ATTR constant', () => {
  expect(LAZY_ATTR).toEqual('lazy');
  expect(typeof LAZY_ATTR).toBe('string');
});

test('STATUS_MESSAGES - contains expected status codes', () => {
  expect(STATUS_MESSAGES[401]).toEqual('Unauthorized');
  expect(STATUS_MESSAGES[403]).toEqual('Forbidden');
  expect(STATUS_MESSAGES[404]).toEqual('Not Found');
  expect(STATUS_MESSAGES[500]).toEqual('Internal Server Error');
});

test('STATUS_MESSAGES - only contains expected keys', () => {
  const expectedKeys = ['401', '403', '404', '500'];
  const actualKeys = Object.keys(STATUS_MESSAGES).sort();
  expect(actualKeys).toEqual(expectedKeys.sort());
});

test('STATUS_MESSAGES - all values are non-empty strings', () => {
  for (const [_code, message] of Object.entries(STATUS_MESSAGES)) {
    expect(typeof message).toBe('string');
    expect(message.length > 0).toEqual(true);
  }
});

test('HTMLElementBase - exports a constructor', () => {
  expect(typeof HTMLElementBase).toBe('function');
});

test('HTMLElementBase - is usable as a base class', () => {
  class TestElement extends HTMLElementBase {
    value = 'test';
  }
  const instance = new TestElement();
  expect(instance.value).toEqual('test');
});

test('escapeHtml - order of replacement matters (ampersand first)', () => {
  // Ensure ampersand is replaced first to avoid double-escaping
  const input = '&<>"\'`';
  const escaped = escapeHtml(input);
  // Each character should appear exactly once escaped
  expect(escaped.match(/&amp;/g)!.length).toEqual(1);
  expect(escaped.match(/&lt;/g)!.length).toEqual(1);
  expect(escaped.match(/&gt;/g)!.length).toEqual(1);
  expect(escaped.match(/&quot;/g)!.length).toEqual(1);
  expect(escaped.match(/&#39;/g)!.length).toEqual(1);
  expect(escaped.match(/&#96;/g)!.length).toEqual(1);
});

test('escapeHtml - long strings with many special characters', () => {
  const input = '<>'.repeat(100) + '&'.repeat(100) + '"\'`'.repeat(100);
  const escaped = escapeHtml(input);
  // Should not contain unescaped special characters
  expect(escaped.includes('<')).toEqual(false);
  expect(escaped.includes('>')).toEqual(false);
  expect(escaped.includes('&') && !escaped.includes('&amp;')).toEqual(false);
});

test('unescapeHtml - unknown entities left unchanged', () => {
  expect(unescapeHtml('&unknown;')).toEqual('&unknown;');
  expect(unescapeHtml('&#999999;')).toEqual('&#999999;');
});

test('escapeHtml and unescapeHtml - idempotence on plain text', () => {
  const plainText = 'This is plain text with no special characters';
  expect(escapeHtml(plainText)).toEqual(plainText);
  expect(unescapeHtml(plainText)).toEqual(plainText);
});

test('escapeHtml - preserves numbers and common symbols that are not escaped', () => {
  const input = '0123456789!@#$%=+-*()[]{}|;:,./? ';
  const expected = '0123456789!@#$%=+-*()[]{}|;:,./? ';
  expect(escapeHtml(input)).toEqual(expected);
});

test('HTML injection prevention - prevents CDATA injection', () => {
  const input = '<![CDATA[alert("xss")]]>';
  const escaped = escapeHtml(input);
  expect(escaped).toEqual('&lt;![CDATA[alert(&quot;xss&quot;)]]&gt;');
});

test('HTML injection prevention - prevents comment injection', () => {
  const input = '<!-- comment with <script> -->';
  const escaped = escapeHtml(input);
  expect(escaped).toEqual('&lt;!-- comment with &lt;script&gt; --&gt;');
});

test('scopeWidgetCss - does not escape CSS content', () => {
  const css = '@media (max-width: 768px) { body { color: < test >; } }';
  const result = scopeWidgetCss(css, 'responsive');
  // CSS content should remain unchanged
  expect(
    result,
  ).toEqual(
    '@scope (widget-responsive) {\n@media (max-width: 768px) { body { color: < test >; } }\n}',
  );
});
