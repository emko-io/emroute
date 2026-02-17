/**
 * CLI Integration Tests
 *
 * Tests the CLI entry point (server/cli.deno.ts) by spawning subprocesses
 * with temp project directories. Verifies convention detection, SPA mode
 * inference, flag parsing, subcommands, and error handling.
 */

import { assertEquals, assertStringIncludes } from '@std/assert';

const CLI_PATH = 'server/cli.deno.ts';

const TEST_PERMISSIONS: Deno.TestDefinition['permissions'] = {
  read: true,
  write: true,
  env: true,
  net: true,
  run: true,
};

/** Run CLI in a temp directory, return stdout+stderr and exit code. */
async function runCli(
  dir: string,
  args: string[],
  options?: { timeout?: number },
): Promise<{ output: string; code: number }> {
  const cmd = new Deno.Command('deno', {
    args: ['run', '-A', `${Deno.cwd()}/${CLI_PATH}`, ...args],
    cwd: dir,
    stdout: 'piped',
    stderr: 'piped',
  });

  const child = cmd.spawn();
  const timeout = options?.timeout ?? 10_000;
  let killed = false;

  const timer = setTimeout(() => {
    killed = true;
    try {
      child.kill('SIGTERM');
    } catch { /* already exited */ }
  }, timeout);

  const result = await child.output();
  clearTimeout(timer);

  const stdout = new TextDecoder().decode(result.stdout);
  const stderr = new TextDecoder().decode(result.stderr);
  const output = stdout + stderr;
  const code = killed ? 0 : result.code;

  return { output, code };
}

/** Create a temp directory with optional files. */
async function createTempProject(
  files?: Record<string, string>,
): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: 'emroute-cli-test-' });
  if (files) {
    for (const [path, content] of Object.entries(files)) {
      const fullPath = `${dir}/${path}`;
      const parent = fullPath.substring(0, fullPath.lastIndexOf('/'));
      await Deno.mkdir(parent, { recursive: true });
      await Deno.writeTextFile(fullPath, content);
    }
  }
  return dir;
}

// ── Error handling ───────────────────────────────────────────────────

Deno.test({
  name: 'cli - exits with error when routes/ missing',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const dir = await createTempProject();
    const { output, code } = await runCli(dir, ['start']);
    assertEquals(code, 1);
    assertStringIncludes(output, 'routes/ directory not found');
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'cli - exits with error for unknown command',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const dir = await createTempProject();
    const { output, code } = await runCli(dir, ['banana']);
    assertEquals(code, 1);
    assertStringIncludes(output, 'Unknown command: banana');
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'cli - exits with error for invalid --spa value',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const dir = await createTempProject({ 'routes/index.page.md': '# Hi' });
    const { output, code } = await runCli(dir, ['start', '--spa', 'invalid']);
    assertEquals(code, 1);
    assertStringIncludes(output, 'Invalid SPA mode');
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'cli - exits with error for unknown flag',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const dir = await createTempProject({ 'routes/index.page.md': '# Hi' });
    const { output, code } = await runCli(dir, ['start', '--banana']);
    assertEquals(code, 1);
    assertStringIncludes(output, 'Unknown flag');
    await Deno.remove(dir, { recursive: true });
  },
});

// ── SPA mode inference ──────────────────────────────────────────────

Deno.test({
  name: 'cli - infers spa=none for md-only project',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const dir = await createTempProject({ 'routes/index.page.md': '# Hello' });
    const { output } = await runCli(dir, ['start', '--port', '4210'], { timeout: 5000 });
    assertStringIncludes(output, 'spa:     none');
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'cli - infers spa=root when .page.ts exists',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const dir = await createTempProject({
      'routes/index.page.md': '# Hello',
      'routes/about.page.ts': 'export default {};',
    });
    const { output } = await runCli(dir, ['start', '--port', '4211'], { timeout: 5000 });
    assertStringIncludes(output, 'spa:     root');
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'cli - infers spa=root when widgets/ exists',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const dir = await createTempProject({
      'routes/index.page.md': '# Hello',
      'widgets/counter/counter.widget.ts': 'export default {};',
    });
    const { output } = await runCli(dir, ['start', '--port', '4212'], { timeout: 5000 });
    assertStringIncludes(output, 'spa:     root');
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'cli - infers spa=root when main.ts exists',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const dir = await createTempProject({
      'routes/index.page.md': '# Hello',
      'main.ts': 'console.log("hello");',
    });
    const { output } = await runCli(dir, ['start', '--port', '4213'], { timeout: 5000 });
    assertStringIncludes(output, 'spa:     root');
    assertStringIncludes(output, 'entry:   main.ts');
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'cli - --spa flag overrides inference',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const dir = await createTempProject({
      'routes/index.page.md': '# Hello',
      'routes/about.page.ts': 'export default {};',
    });
    const { output } = await runCli(dir, ['start', '--spa', 'none', '--port', '4214'], {
      timeout: 5000,
    });
    assertStringIncludes(output, 'spa:     none');
    await Deno.remove(dir, { recursive: true });
  },
});

// ── Generate command ─────────────────────────────────────────────────

Deno.test({
  name: 'cli generate - creates routes manifest',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const dir = await createTempProject({
      'routes/index.page.md': '# Hello',
      'routes/about.page.md': '# About',
    });
    const { output, code } = await runCli(dir, ['generate']);
    assertEquals(code, 0);
    assertStringIncludes(output, 'routes.manifest.g.ts (2 routes)');

    const manifest = await Deno.readTextFile(`${dir}/routes.manifest.g.ts`);
    assertStringIncludes(manifest, 'routesManifest');
    assertStringIncludes(manifest, "pattern: '/'");
    assertStringIncludes(manifest, "pattern: '/about'");
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'cli generate - creates widgets manifest when widgets/ exists',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const dir = await createTempProject({
      'routes/index.page.md': '# Hello',
      'widgets/greeting/greeting.widget.ts': 'export default {};',
    });
    const { output, code } = await runCli(dir, ['generate']);
    assertEquals(code, 0);
    assertStringIncludes(output, 'widgets.manifest.g.ts');

    const manifest = await Deno.readTextFile(`${dir}/widgets.manifest.g.ts`);
    assertStringIncludes(manifest, 'greeting');
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'cli generate - skips widgets manifest when no widgets/',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const dir = await createTempProject({ 'routes/index.page.md': '# Hello' });
    const { output, code } = await runCli(dir, ['generate']);
    assertEquals(code, 0);
    assertStringIncludes(output, 'routes.manifest.g.ts');

    let widgetsExists = true;
    try {
      await Deno.stat(`${dir}/widgets.manifest.g.ts`);
    } catch {
      widgetsExists = false;
    }
    assertEquals(widgetsExists, false);
    await Deno.remove(dir, { recursive: true });
  },
});

// ── Build command ────────────────────────────────────────────────────

Deno.test({
  name: 'cli build - produces shell in none mode (no JS)',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const dir = await createTempProject({ 'routes/index.page.md': '# Hello' });
    const { output, code } = await runCli(dir, ['build', '--out', `${dir}/.build`], {
      timeout: 15000,
    });
    assertEquals(code, 0);
    assertStringIncludes(output, 'spa:     none');
    assertStringIncludes(output, 'Build complete');

    const shell = await Deno.readTextFile(`${dir}/.build/index.html`);
    assertStringIncludes(shell, '<!DOCTYPE html>');
    // No script tags in none mode
    assertEquals(shell.includes('<script'), false);
    await Deno.remove(dir, { recursive: true });
  },
});

// ── Default command ──────────────────────────────────────────────────

Deno.test({
  name: 'cli - no subcommand defaults to start',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const dir = await createTempProject({ 'routes/index.page.md': '# Hello' });
    const { output } = await runCli(dir, ['--port', '4215'], { timeout: 5000 });
    assertStringIncludes(output, 'Starting dev server');
    await Deno.remove(dir, { recursive: true });
  },
});

// ── Server responds ──────────────────────────────────────────────────

Deno.test({
  name: 'cli start - server responds to HTTP requests',
  permissions: TEST_PERMISSIONS,
  fn: async () => {
    const dir = await createTempProject({ 'routes/index.page.md': '# Welcome' });

    const cmd = new Deno.Command('deno', {
      args: ['run', '-A', `${Deno.cwd()}/${CLI_PATH}`, 'start', '--port', '4216'],
      cwd: dir,
      stdout: 'piped',
      stderr: 'piped',
    });

    const child = cmd.spawn();

    try {
      // Wait for server to be ready
      let ready = false;
      for (let i = 0; i < 30; i++) {
        try {
          const resp = await fetch('http://localhost:4216/md');
          await resp.body?.cancel();
          if (resp.ok) {
            ready = true;
            break;
          }
        } catch { /* not ready yet */ }
        await new Promise((r) => setTimeout(r, 200));
      }

      assertEquals(ready, true, 'Server did not become ready');

      // Test SSR HTML
      const htmlResp = await fetch('http://localhost:4216/html');
      assertEquals(htmlResp.status, 200);
      const html = await htmlResp.text();
      assertStringIncludes(html, 'Welcome');

      // Test SSR Markdown
      const mdResp = await fetch('http://localhost:4216/md');
      assertEquals(mdResp.status, 200);
      const md = await mdResp.text();
      assertStringIncludes(md, '# Welcome');
    } finally {
      try {
        child.kill('SIGTERM');
      } catch { /* already exited */ }
      await child.output();
      await Deno.remove(dir, { recursive: true });
    }
  },
});
