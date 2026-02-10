import { assertEquals } from '@std/assert';
import { escapeHtml, STATUS_MESSAGES } from '../../src/util/html.util.ts';
import { parseAttrsToParams } from '../../src/util/widget-resolve.util.ts';

Deno.test('escapeHtml - basic ampersand', () => {
  const result = escapeHtml('Hello & goodbye');
  assertEquals(result, 'Hello &amp; goodbye');
});

Deno.test('escapeHtml - basic less than', () => {
  const result = escapeHtml('<script>');
  assertEquals(result, '&lt;script&gt;');
});

Deno.test('escapeHtml - basic greater than', () => {
  const result = escapeHtml('a > b');
  assertEquals(result, 'a &gt; b');
});

Deno.test('escapeHtml - basic double quote', () => {
  const result = escapeHtml('Say "hello"');
  assertEquals(result, 'Say &quot;hello&quot;');
});

Deno.test('escapeHtml - all HTML entities', () => {
  const result = escapeHtml('&<>"');
  assertEquals(result, '&amp;&lt;&gt;&quot;');
});

Deno.test('escapeHtml - mixed text with multiple special characters', () => {
  const result = escapeHtml('This & that <div>"quoted"</div>');
  assertEquals(result, 'This &amp; that &lt;div&gt;&quot;quoted&quot;&lt;/div&gt;');
});

Deno.test('escapeHtml - multiple ampersands', () => {
  const result = escapeHtml('Tom & Jerry & Spike');
  assertEquals(result, 'Tom &amp; Jerry &amp; Spike');
});

Deno.test('escapeHtml - consecutive special characters', () => {
  const result = escapeHtml('<<>>');
  assertEquals(result, '&lt;&lt;&gt;&gt;');
});

Deno.test('escapeHtml - empty string', () => {
  const result = escapeHtml('');
  assertEquals(result, '');
});

Deno.test('escapeHtml - no special characters', () => {
  const result = escapeHtml('Hello World');
  assertEquals(result, 'Hello World');
});

Deno.test('escapeHtml - only spaces', () => {
  const result = escapeHtml('   ');
  assertEquals(result, '   ');
});

Deno.test('escapeHtml - unicode characters', () => {
  const result = escapeHtml('Hello 世界 🌍');
  assertEquals(result, 'Hello 世界 🌍');
});

Deno.test('escapeHtml - unicode with special characters', () => {
  const result = escapeHtml('你好 & goodbye "世界"');
  assertEquals(result, '你好 &amp; goodbye &quot;世界&quot;');
});

Deno.test('escapeHtml - emoji', () => {
  const result = escapeHtml('😀 & "happy"');
  assertEquals(result, '😀 &amp; &quot;happy&quot;');
});

Deno.test('escapeHtml - newlines and tabs preserved', () => {
  const result = escapeHtml('Line1\nLine2\tTabbed');
  assertEquals(result, 'Line1\nLine2\tTabbed');
});

Deno.test('escapeHtml - HTML entities not double-escaped', () => {
  const result = escapeHtml('&lt;');
  assertEquals(result, '&amp;lt;');
});

Deno.test('escapeHtml - complex HTML code example', () => {
  const input = '<script>alert("XSS & injection")</script>';
  const result = escapeHtml(input);
  assertEquals(
    result,
    '&lt;script&gt;alert(&quot;XSS &amp; injection&quot;)&lt;/script&gt;',
  );
});

Deno.test('escapeHtml - HTML attributes example', () => {
  const input = 'onclick="alert(\'gotcha\')"';
  const result = escapeHtml(input);
  assertEquals(result, 'onclick=&quot;alert(&#39;gotcha&#39;)&quot;');
});

Deno.test('STATUS_MESSAGES - 404 status code', () => {
  assertEquals(STATUS_MESSAGES[404], 'Not Found');
});

Deno.test('STATUS_MESSAGES - 401 status code', () => {
  assertEquals(STATUS_MESSAGES[401], 'Unauthorized');
});

Deno.test('STATUS_MESSAGES - 403 status code', () => {
  assertEquals(STATUS_MESSAGES[403], 'Forbidden');
});

Deno.test('STATUS_MESSAGES - 500 status code', () => {
  assertEquals(STATUS_MESSAGES[500], 'Internal Server Error');
});

Deno.test('STATUS_MESSAGES - undefined status code returns undefined', () => {
  assertEquals(STATUS_MESSAGES[418], undefined);
});

Deno.test('STATUS_MESSAGES - zero returns undefined', () => {
  assertEquals(STATUS_MESSAGES[0], undefined);
});

Deno.test('STATUS_MESSAGES - negative code returns undefined', () => {
  assertEquals(STATUS_MESSAGES[-1], undefined);
});

Deno.test('STATUS_MESSAGES - object has correct length', () => {
  const keys = Object.keys(STATUS_MESSAGES);
  assertEquals(keys.length, 4);
});

Deno.test('STATUS_MESSAGES - contains only expected status codes', () => {
  const expectedCodes = [401, 403, 404, 500];
  const actualCodes = Object.keys(STATUS_MESSAGES).map(Number);
  assertEquals(actualCodes.sort(), expectedCodes.sort());
});

Deno.test('STATUS_MESSAGES - all messages are strings', () => {
  Object.values(STATUS_MESSAGES).forEach((message) => {
    assertEquals(typeof message, 'string');
  });
});

Deno.test('STATUS_MESSAGES - all messages are non-empty', () => {
  Object.values(STATUS_MESSAGES).forEach((message) => {
    assertEquals(message.length > 0, true);
  });
});

// =============================================================================
// parseAttrsToParams
// =============================================================================

Deno.test('parseAttrsToParams - double-quoted attribute', () => {
  assertEquals(parseAttrsToParams('coin="bitcoin"'), { coin: 'bitcoin' });
});

Deno.test('parseAttrsToParams - single-quoted attribute', () => {
  assertEquals(parseAttrsToParams("coin='bitcoin'"), { coin: 'bitcoin' });
});

Deno.test('parseAttrsToParams - unquoted attribute', () => {
  assertEquals(parseAttrsToParams('coin=bitcoin'), { coin: 'bitcoin' });
});

Deno.test('parseAttrsToParams - boolean attribute', () => {
  assertEquals(parseAttrsToParams('disabled'), { disabled: '' });
});

Deno.test('parseAttrsToParams - mixed attribute styles', () => {
  assertEquals(
    parseAttrsToParams('coin="bitcoin" name=\'test\' count=42 disabled'),
    { coin: 'bitcoin', name: 'test', count: 42, disabled: '' },
  );
});

Deno.test('parseAttrsToParams - kebab-case to camelCase', () => {
  assertEquals(parseAttrsToParams("my-attr='hello'"), { myAttr: 'hello' });
});

Deno.test('parseAttrsToParams - empty string', () => {
  assertEquals(parseAttrsToParams(''), {});
});

Deno.test('parseAttrsToParams - data-ssr is skipped', () => {
  assertEquals(parseAttrsToParams('coin="bitcoin" data-ssr="ignored"'), { coin: 'bitcoin' });
});

Deno.test('parseAttrsToParams - JSON value in double quotes', () => {
  assertEquals(parseAttrsToParams('count="42"'), { count: 42 });
});

Deno.test('parseAttrsToParams - JSON value in single quotes', () => {
  assertEquals(parseAttrsToParams("active='true'"), { active: true });
});

Deno.test('parseAttrsToParams - unquoted numeric value', () => {
  assertEquals(parseAttrsToParams('count=42'), { count: 42 });
});

Deno.test('parseAttrsToParams - multiple boolean attributes', () => {
  assertEquals(parseAttrsToParams('disabled hidden readonly'), {
    disabled: '',
    hidden: '',
    readonly: '',
  });
});

Deno.test('parseAttrsToParams - HTML entity decoding in double quotes', () => {
  assertEquals(parseAttrsToParams('text="hello &amp; goodbye"'), { text: 'hello & goodbye' });
});

Deno.test('parseAttrsToParams - HTML entity decoding in single quotes', () => {
  assertEquals(parseAttrsToParams("text='hello &amp; goodbye'"), { text: 'hello & goodbye' });
});
