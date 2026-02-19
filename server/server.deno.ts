/**
 * Deno Server Runtime
 *
 * Overrides serve() with Deno.serve() for native HTTP performance.
 * All other methods use the node:* defaults from ServerRuntime.
 */

import { type RequestHandler, type ServerHandle, ServerRuntime } from './server.type.ts';

class DenoServerRuntime extends ServerRuntime {
  override serve(port: number, handler: RequestHandler): ServerHandle {
    const server = Deno.serve({ port }, handler);
    return {
      async shutdown() {
        await server.shutdown();
      },
    };
  }
}

export const denoServerRuntime: ServerRuntime = new DenoServerRuntime();
