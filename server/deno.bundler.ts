/**
 * Deno Bundler
 *
 * Default Bundler implementation using `deno bundle`.
 * Consumers can swap this for esbuild, Rollup, Vite, etc.
 */

import type { Bundler } from './server-api.type.ts';

export const denoBundler: Bundler = {
  async bundle(entry, output, options) {
    const args = ['bundle', '--platform', 'browser'];
    if (options.minify) args.push('--minify');
    if (options.sourcemap) args.push('--sourcemap');
    if (options.external) {
      for (const ext of options.external) {
        args.push('--external', ext);
      }
    }
    args.push(entry, '-o', output);

    const proc = new Deno.Command('deno', {
      args,
      cwd: options.cwd,
      stdout: 'inherit',
      stderr: 'inherit',
    }).spawn();

    const status = await proc.status;
    if (!status.success) {
      throw new Error(`deno bundle failed with exit code ${status.code}`);
    }
  },
};
