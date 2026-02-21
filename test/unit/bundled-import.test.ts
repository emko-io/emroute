import { assertEquals } from 'jsr:@std/assert';
import { DenoFsRuntime } from '../../server/runtime/deno/fs/deno-fs.runtime.ts';

const sanitize = { sanitizeResources: false, sanitizeOps: false };

Deno.test('bundle() with externals produces importable blob URL', sanitize, async () => {
  const files: Record<string, string> = {
    'entry.ts': `
      import { helper } from './util.ts';
      export const result = helper(42);
    `,
    'util.ts': `
      export function helper(n: number): number { return n * 2; }
    `,
  };

  const js = await DenoFsRuntime.bundle(
    'entry.ts',
    (path) => Promise.resolve(files[path] ?? null),
  );

  const blob = new Blob([js], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    const mod = await import(url) as { result: number };
    assertEquals(mod.result, 84);
  } finally {
    URL.revokeObjectURL(url);
  }
});

Deno.test('bundle() externalizes bare specifiers', sanitize, async () => {
  const files: Record<string, string> = {
    'widget.ts': `
      import type { WidgetComponent } from '@emkodev/emroute';
      export const name = 'test-widget';
    `,
  };

  const js = await DenoFsRuntime.bundle(
    'widget.ts',
    (path) => Promise.resolve(files[path] ?? null),
    { external: ['@emkodev/emroute'] },
  );

  // Type-only import is erased — just verify output exists and has the export
  assertEquals(js.includes('test-widget'), true);
});

Deno.test('bundle() with real external import + blob URL', sanitize, async () => {
  const files: Record<string, string> = {
    'widget.ts': `
      import { PageComponent } from '@emkodev/emroute';
      class TestPage extends PageComponent {
        override readonly name = 'test-page';
      }
      export default new TestPage();
    `,
  };

  const js = await DenoFsRuntime.bundle(
    'widget.ts',
    (path) => Promise.resolve(files[path] ?? null),
    { external: ['@emkodev/emroute'] },
  );

  // The bundled JS should keep the external import
  assertEquals(js.includes('@emkodev/emroute'), true);

  // Import via blob URL — Deno's import map resolves @emkodev/emroute
  const blob = new Blob([js], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    const mod = await import(url) as { default: { name: string } };
    assertEquals(mod.default.name, 'test-page');
  } finally {
    URL.revokeObjectURL(url);
  }
});
