/**
 * esbuild Runtime Loader Plugin
 *
 * Intercepts file resolution so esbuild reads source files through the
 * runtime's `query()` method instead of the filesystem. This allows
 * bundling to work with any Runtime implementation (filesystem, SQLite,
 * in-memory, etc.).
 *
 * The plugin intercepts `.ts` and `.js` imports that resolve under the
 * virtual root and loads their contents from the runtime.
 */

import type { Runtime } from '../../runtime/abstract.runtime.ts';

interface RuntimeLoaderOptions {
  runtime: Runtime;
  /**
   * The filesystem root that esbuild would normally resolve paths against.
   * Paths starting with this prefix are stripped to produce runtime paths
   * (e.g. `/app/root/routes/index.page.ts` → `/routes/index.page.ts`).
   * For runtimes without a filesystem root, pass an empty string.
   */
  root: string;
}

// deno-lint-ignore no-explicit-any
type EsbuildPlugin = any;

export function createRuntimeLoaderPlugin(options: RuntimeLoaderOptions): EsbuildPlugin {
  const { runtime, root } = options;

  return {
    name: 'emroute-runtime-loader',

    // deno-lint-ignore no-explicit-any
    setup(build: any) {
      // Intercept .ts and .js file resolution — redirect to 'runtime' namespace
      // Only intercepts files that resolve under the runtime root.
      build.onResolve(
        { filter: /\.[tj]s$/ },
        // deno-lint-ignore no-explicit-any
        (args: any) => {
          // Skip bare specifiers (node_modules, packages)
          if (!args.path.startsWith('.') && !args.path.startsWith('/')) return undefined;
          // Skip if already in a custom namespace (except 'runtime' for nested imports)
          // Entry points have namespace '' (empty string)
          if (args.namespace !== 'file' && args.namespace !== 'runtime' && args.namespace !== '') return undefined;

          let absPath: string;
          if (args.path.startsWith('/')) {
            absPath = args.path;
          } else if (args.resolveDir) {
            absPath = args.resolveDir + '/' + args.path;
          } else {
            return undefined;
          }

          // Normalize ../ and ./ segments
          const parts = absPath.split('/');
          const normalized: string[] = [];
          for (const part of parts) {
            if (part === '..') normalized.pop();
            else if (part !== '.' && part !== '') normalized.push(part);
          }
          absPath = '/' + normalized.join('/');

          // Only intercept files under the runtime root
          if (root && !absPath.startsWith(root + '/')) return undefined;

          return { path: absPath, namespace: 'runtime' };
        },
      );

      // Load file contents from the runtime
      build.onLoad(
        { filter: /.*/, namespace: 'runtime' },
        // deno-lint-ignore no-explicit-any
        async (args: any) => {
          // Strip root prefix to get runtime path (e.g. /app/root/routes/x.ts → /routes/x.ts)
          const runtimePath = root && args.path.startsWith(root)
            ? args.path.slice(root.length)
            : args.path;

          const contents = await runtime.query(runtimePath, { as: 'text' });
          const ext = args.path.slice(args.path.lastIndexOf('.') + 1);
          const loader = ext === 'ts' ? 'ts' : 'js';
          const resolveDir = args.path.slice(0, args.path.lastIndexOf('/'));

          return { contents, loader, resolveDir };
        },
      );
    },
  };
}
