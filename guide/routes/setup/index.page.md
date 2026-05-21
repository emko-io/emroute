<!--==chunk:hero==-->

# Project Setup

emroute runs on Bun, Deno, and Node. Pick your runtime — each guide walks
you through install, first route, and running the server.

<!--==chunk:card==-->

## Bun

Native TypeScript. `BunFsRuntime` uses Bun-native I/O and `Bun.Transpiler`
for on-the-fly `.ts` transpilation. Recommended for new projects.

[Setup with Bun →](setup/bun)

<!--==chunk:card==-->

## Deno

Native TypeScript with permissions and import maps. `UniversalFsRuntime`
uses `node:` APIs through Deno's compatibility layer.

[Setup with Deno →](setup/deno)

<!--==chunk:card==-->

## Node

emroute ships compiled JavaScript, so Node can `import` it directly. Pair
with `tsx` or `--experimental-strip-types` for your own `.ts` files.

[Setup with Node →](setup/node)

<!--==chunk:outro==-->

Already set up? Continue to [Pages](pages), [Widgets](widgets), or the
[Architecture overview](architecture).
