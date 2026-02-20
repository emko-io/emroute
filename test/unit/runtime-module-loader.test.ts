import { assertEquals, assertExists } from "jsr:@std/assert";
import { DenoFsRuntime } from "../../server/runtime/deno/fs/deno-fs.runtime.ts";

const FIXTURES = "test/browser/fixtures";
const runtime = new DenoFsRuntime(FIXTURES);

Deno.test("Runtime: query HTML companion", async () => {
  const response = await runtime.query("/routes/about.page.html");
  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("Content-Type"),
    "text/html; charset=utf-8",
  );
  const html = await response.text();
  assertExists(html);
  assertEquals(html.includes("<"), true);
});

Deno.test("Runtime: query MD companion", async () => {
  const response = await runtime.query("/routes/blog.page.md");
  assertEquals(response.status, 200);
  const md = await response.text();
  assertExists(md);
});

Deno.test("Runtime: query CSS companion", async () => {
  const response = await runtime.query("/routes/about.page.css");
  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("Content-Type"),
    "text/css; charset=utf-8",
  );
});

Deno.test("Runtime: query .page.ts source", async () => {
  const response = await runtime.query("/routes/blog.page.ts");
  assertEquals(response.status, 200);
  const source = await response.text();
  assertEquals(source.includes("BlogPage"), true);
});

Deno.test("Runtime: query non-existent file returns 404", async () => {
  const response = await runtime.query("/routes/nope.html");
  assertEquals(response.status, 404);
});

Deno.test("Runtime: query directory returns JSON listing", async () => {
  const response = await runtime.query("/routes/");
  assertEquals(response.status, 200);
  const entries: string[] = await response.json();
  assertEquals(Array.isArray(entries), true);
  assertEquals(entries.includes("blog.page.ts"), true);
  assertEquals(entries.includes("about.page.html"), true);
});

Deno.test("Runtime: handle passthrough", async () => {
  const response = await runtime.handle("/routes/about.page.css");
  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("Content-Type"),
    "text/css; charset=utf-8",
  );
});
