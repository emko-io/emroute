/**
 * Spike: Can we execute TS-compiled modules via new Function() / AsyncFunction?
 *
 * Goal: SSR module loading for non-filesystem runtimes.
 * Trade-off: Runs in current scope (no module semantics, no `import`).
 */

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// Simulate a compiled widget module (TS already transpiled to JS)
const widgetSource = `
  const greeting = 'Hello from Function eval';

  return {
    getData: async () => ({ message: greeting, timestamp: Date.now() }),
    renderHTML: (data) => '<div>' + data.message + ' at ' + data.timestamp + '</div>',
  };
`;

console.log('=== Test 1: Sync Function (returns module-like object) ===');
try {
  const factory = new Function(widgetSource);
  const mod = factory();
  const data = await mod.getData();
  console.log('getData():', data);
  console.log('renderHTML():', mod.renderHTML(data));
  console.log('PASS: sync Function works for simple modules');
} catch (e) {
  console.log('FAIL:', e);
}

console.log('\n=== Test 2: AsyncFunction (async module body) ===');
const asyncWidgetSource = `
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  await delay(10);
  return {
    getData: async () => ({ message: 'Hello from AsyncFunction', ts: Date.now() }),
    renderHTML: (data) => '<p>' + data.message + '</p>',
  };
`;

try {
  const factory = new AsyncFunction(asyncWidgetSource);
  const mod = await factory();
  const data = await mod.getData();
  console.log('getData():', data);
  console.log('renderHTML():', mod.renderHTML(data));
  console.log('PASS: AsyncFunction works for async modules');
} catch (e) {
  console.log('FAIL:', e);
}

console.log('\n=== Test 3: Injecting dependencies (simulating imports) ===');
const moduleWithDeps = `
  const { html, escape } = deps;
  return {
    renderHTML: (data) => html('<div>' + escape(data.name) + '</div>'),
  };
`;

try {
  const factory = new Function('deps', moduleWithDeps);
  const deps = {
    html: (s: string) => s,
    escape: (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  };
  const mod = factory(deps);
  console.log('renderHTML():', mod.renderHTML({ name: '<script>xss</script>' }));
  console.log('PASS: dependency injection works');
} catch (e) {
  console.log('FAIL:', e);
}

console.log('\n=== Test 4: Can we share state between "modules"? ===');
const utilSource = `
  return { greet: (name) => 'Hello, ' + name + '!' };
`;
const pageSource = `
  const { utils } = deps;
  return {
    getData: async () => ({ greeting: utils.greet('World') }),
    renderHTML: (data) => '<h1>' + data.greeting + '</h1>',
  };
`;

try {
  const utils = new Function(utilSource)();
  const page = new Function('deps', pageSource)({ utils });
  const data = await page.getData();
  console.log('Cross-module:', page.renderHTML(data));
  console.log('PASS: cross-module dependency works via injection');
} catch (e) {
  console.log('FAIL:', e);
}
