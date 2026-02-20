/**
 * Spike: Can we dynamically import modules via data: URLs?
 *
 * Goal: SSR module loading for non-filesystem runtimes.
 * Advantage: True module semantics (import/export work).
 * Requirement: Pre-compiled JS (no TypeScript in data: URLs).
 */

console.log('=== Test 1: Basic data: URL import ===');
try {
  const code = `
    export const greeting = 'Hello from data: URL';
    export function renderHTML(data) {
      return '<div>' + data.message + '</div>';
    }
  `;
  const mod = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);
  console.log('greeting:', mod.greeting);
  console.log('renderHTML():', mod.renderHTML({ message: 'it works' }));
  console.log('PASS: basic data: URL import works');
} catch (e) {
  console.log('FAIL:', e);
}

console.log('\n=== Test 2: Async getData() export ===');
try {
  const code = `
    export async function getData() {
      return { message: 'async data', timestamp: Date.now() };
    }
    export function renderHTML(data) {
      return '<p>' + data.message + ' at ' + data.timestamp + '</p>';
    }
  `;
  const mod = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);
  const data = await mod.getData();
  console.log('getData():', data);
  console.log('renderHTML():', mod.renderHTML(data));
  console.log('PASS: async exports work');
} catch (e) {
  console.log('FAIL:', e);
}

console.log('\n=== Test 3: Module importing another data: URL module ===');
try {
  const utilsCode = `
    export function greet(name) { return 'Hello, ' + name + '!'; }
  `;
  const utilsUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(utilsCode)}`;

  const pageCode = `
    import { greet } from '${utilsUrl}';
    export async function getData() {
      return { greeting: greet('World') };
    }
    export function renderHTML(data) {
      return '<h1>' + data.greeting + '</h1>';
    }
  `;
  const mod = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(pageCode)}`);
  const data = await mod.getData();
  console.log('Cross-module:', mod.renderHTML(data));
  console.log('PASS: data: URL can import another data: URL');
} catch (e) {
  console.log('FAIL:', e);
}

console.log('\n=== Test 4: Default export (class-based widget) ===');
try {
  const code = `
    export default class MyWidget {
      async getData() {
        return { count: 42 };
      }
      renderHTML(data) {
        return '<span>Count: ' + data.count + '</span>';
      }
    }
  `;
  const mod = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);
  const widget = new mod.default();
  const data = await widget.getData();
  console.log('Class-based:', widget.renderHTML(data));
  console.log('PASS: default class export works');
} catch (e) {
  console.log('FAIL:', e);
}

console.log('\n=== Test 5: Importing real npm/jsr packages from data: URL ===');
try {
  // This tests if a data: URL module can import from a specifier
  // that the runtime resolves (e.g., via import map)
  const code = `
    // Can't easily test real package imports without import maps
    // But we can test that the module runs in proper module scope
    const meta = import.meta;
    export const url = meta.url;
    export const hasProperScope = typeof meta !== 'undefined';
  `;
  const mod = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);
  console.log('import.meta.url:', mod.url);
  console.log('Has proper module scope:', mod.hasProperScope);
  console.log('PASS: proper module scope');
} catch (e) {
  console.log('FAIL:', e);
}
