/**
 * Spike: Can esbuild bundle from in-memory sources without filesystem access?
 */

import * as esbuild from 'npm:esbuild';

// Simulate in-memory files (like a database runtime would provide)
const virtualFiles: Record<string, string> = {
  'app.ts': `
    import { greet } from './utils.ts';
    console.log(greet('world'));
  `,
  'utils.ts': `
    export function greet(name: string): string {
      return 'Hello, ' + name;
    }
  `,
};

const result = await esbuild.build({
  entryPoints: ['app.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  plugins: [{
    name: 'virtual-fs',
    setup(build) {
      // Resolve all imports to virtual namespace
      build.onResolve({ filter: /.*/ }, (args) => {
        const path = args.path.replace(/^\.\//, '');
        if (virtualFiles[path]) {
          return { path, namespace: 'virtual' };
        }
        return undefined;
      });

      // Load from in-memory map
      build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
        const contents = virtualFiles[args.path];
        if (contents) {
          return {
            contents,
            loader: args.path.endsWith('.ts') ? 'ts' : 'js',
          };
        }
        return undefined;
      });
    },
  }],
});

console.log('--- Build succeeded ---');
console.log('Output files:', result.outputFiles?.length);
for (const file of result.outputFiles ?? []) {
  console.log(`\n--- ${file.path} ---`);
  console.log(file.text);
}

await esbuild.stop();
