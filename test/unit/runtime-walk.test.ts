import { assertEquals } from "jsr:@std/assert";
import { DenoFsRuntime } from "../../server/runtime/deno/fs/deno-fs.runtime.ts";

const runtime = new DenoFsRuntime("test/browser/fixtures");

/** Walk directory recursively via Runtime, collecting all file paths. */
async function* walk(runtime: DenoFsRuntime, dir: string): AsyncGenerator<string> {
  const response = await runtime.query(dir);
  const entries: string[] = await response.json();

  for (const entry of entries) {
    const path = `${dir}${entry}`;
    if (entry.endsWith("/")) {
      yield* walk(runtime, path);
    } else {
      yield path;
    }
  }
}

Deno.test("Walk: discover route files via Runtime", async () => {
  const files: string[] = [];
  for await (const file of walk(runtime, "/routes/")) {
    files.push(file);
  }

  // Should find .page.ts, .page.html, .page.md, .page.css files
  const pageFiles = files.filter((f) => f.includes(".page."));
  assertEquals(pageFiles.length > 0, true);
  assertEquals(files.some((f) => f.endsWith(".page.ts")), true);
  assertEquals(files.some((f) => f.endsWith(".page.html")), true);
  assertEquals(files.some((f) => f.endsWith(".page.md")), true);
});

Deno.test("Walk: exists check via Runtime", async () => {
  const found = await runtime.query("/routes/blog.page.ts");
  assertEquals(found.status, 200);

  const notFound = await runtime.query("/routes/nope.page.ts");
  assertEquals(notFound.status, 404);
});

Deno.test("Shell: resolve index.html via Runtime", async () => {
  // Exists case
  const response = await runtime.query("/index.html");
  assertEquals(response.status, 200);
  const html = await response.text();
  assertEquals(html.includes("<!DOCTYPE html>") || html.includes("<html"), true);
});

Deno.test("Shell: resolve index.html as text via Runtime", async () => {
  const html = await runtime.query("/index.html", { as: "text" });
  assertEquals(typeof html, "string");
  assertEquals(html.includes("<"), true);
});

Deno.test("Shell: missing file returns 404 (no shell fallback)", async () => {
  const response = await runtime.query("/nonexistent.html");
  assertEquals(response.status, 404);
});

Deno.test("Write: write and read back via Runtime", async () => {
  const path = "/test-output.g.ts";
  const content = "export const manifest = { routes: [] };\n";

  // Write via command
  const writeResponse = await runtime.command(path, { body: content });
  assertEquals(writeResponse.status, 204);

  // Read back via query
  const readBack = await runtime.query(path, { as: "text" });
  assertEquals(readBack, content);

  // Clean up
  await Deno.remove("test/browser/fixtures/test-output.g.ts");
});
