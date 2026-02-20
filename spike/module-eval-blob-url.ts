/**
 * Spike: Can we dynamically import modules via Blob URLs?
 *
 * Goal: SSR module loading for non-filesystem runtimes.
 * Advantage: True module semantics, in-memory, URL.createObjectURL available.
 * Note: Blob URLs are browser-native. Deno supports them too.
 */

console.log('=== Test 1: Basic Blob URL import ===');
try {
  const code = `
    export const greeting = 'Hello from Blob URL';
    export function renderHTML(data) {
      return '<div>' + data.message + '</div>';
    }
  `;
  const blob = new Blob([code], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const mod = await import(url);
  URL.revokeObjectURL(url);
  console.log('greeting:', mod.greeting);
  console.log('renderHTML():', mod.renderHTML({ message: 'it works' }));
  console.log('PASS: basic Blob URL import works');
} catch (e) {
  console.log('FAIL:', e);
}

console.log('\n=== Test 2: Async getData() export ===');
try {
  const code = `
    export async function getData() {
      return { message: 'async blob data', timestamp: Date.now() };
    }
    export function renderHTML(data) {
      return '<p>' + data.message + ' at ' + data.timestamp + '</p>';
    }
  `;
  const blob = new Blob([code], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const mod = await import(url);
  URL.revokeObjectURL(url);
  const data = await mod.getData();
  console.log('getData():', data);
  console.log('renderHTML():', mod.renderHTML(data));
  console.log('PASS: async exports work');
} catch (e) {
  console.log('FAIL:', e);
}

console.log('\n=== Test 3: Cross-module import via Blob URLs ===');
try {
  const utilsCode = `
    export function greet(name) { return 'Hello, ' + name + '!'; }
  `;
  const utilsBlob = new Blob([utilsCode], { type: 'text/javascript' });
  const utilsUrl = URL.createObjectURL(utilsBlob);

  const pageCode = `
    import { greet } from '${utilsUrl}';
    export async function getData() {
      return { greeting: greet('World') };
    }
    export function renderHTML(data) {
      return '<h1>' + data.greeting + '</h1>';
    }
  `;
  const pageBlob = new Blob([pageCode], { type: 'text/javascript' });
  const pageUrl = URL.createObjectURL(pageBlob);
  const mod = await import(pageUrl);
  URL.revokeObjectURL(utilsUrl);
  URL.revokeObjectURL(pageUrl);
  const data = await mod.getData();
  console.log('Cross-module:', mod.renderHTML(data));
  console.log('PASS: Blob URL can import another Blob URL');
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
  const blob = new Blob([code], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const mod = await import(url);
  URL.revokeObjectURL(url);
  const widget = new mod.default();
  const data = await widget.getData();
  console.log('Class-based:', widget.renderHTML(data));
  console.log('PASS: default class export works');
} catch (e) {
  console.log('FAIL:', e);
}

console.log('\n=== Test 5: Cleanup - revoked URL cannot be re-imported ===');
try {
  const code = `export const x = 1;`;
  const blob = new Blob([code], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  URL.revokeObjectURL(url);
  await import(url);
  console.log('UNEXPECTED: revoked URL still works (might be cached)');
} catch (e) {
  console.log('PASS: revoked URL correctly fails:', e.constructor.name);
}
