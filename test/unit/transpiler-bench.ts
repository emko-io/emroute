const source = await Deno.readTextFile("test/browser/fixtures/routes/blog.page.ts");
const iterations = 10;

// typescript
const ts = (await import("npm:typescript")).default;
let start = performance.now();
for (let i = 0; i < iterations; i++) {
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      verbatimModuleSyntax: false,
    },
  });
}
console.log(
  "typescript:",
  ((performance.now() - start) / iterations).toFixed(1),
  "ms/iter",
);

// esbuild
const esbuild = await import("npm:esbuild");
start = performance.now();
for (let i = 0; i < iterations; i++) {
  await esbuild.transform(source, {
    loader: "ts",
    format: "esm",
    target: "esnext",
  });
}
console.log(
  "esbuild:",
  ((performance.now() - start) / iterations).toFixed(1),
  "ms/iter",
);
await esbuild.stop();

// swc
const swc = (await import("npm:@swc/core")).default;
start = performance.now();
for (let i = 0; i < iterations; i++) {
  swc.transformSync(source, {
    jsc: {
      parser: { syntax: "typescript", decorators: true },
      target: "esnext",
    },
    module: { type: "es6" },
  });
}
console.log(
  "swc:",
  ((performance.now() - start) / iterations).toFixed(1),
  "ms/iter",
);

// deno bundle (CLI — includes process spawn overhead)
start = performance.now();
for (let i = 0; i < iterations; i++) {
  const proc = new Deno.Command("deno", {
    args: [
      "bundle",
      "test/browser/fixtures/routes/blog.page.ts",
      "--platform",
      "browser",
    ],
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  await proc.output();
}
console.log(
  "deno bundle:",
  ((performance.now() - start) / iterations).toFixed(1),
  "ms/iter (CLI, includes spawn + resolve + bundle)",
);

// tsgo (native binary)
start = performance.now();
for (let i = 0; i < iterations; i++) {
  const proc = new Deno.Command("tsgo", {
    args: [
      "--target",
      "esnext",
      "--module",
      "esnext",
      "--isolatedModules",
      "--noCheck",
      "--outDir",
      "/tmp/tsgo-out",
      "test/browser/fixtures/routes/blog.page.ts",
    ],
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  await proc.output();
}
console.log(
  "tsgo:",
  ((performance.now() - start) / iterations).toFixed(1),
  "ms/iter (CLI native binary, includes spawn)",
);
