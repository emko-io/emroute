/**
 * CLI Integration Tests
 *
 * Tests the CLI entry point (server/cli.bun.ts) by spawning subprocesses
 * with temp project directories. Verifies convention detection, SPA mode
 * inference, flag parsing, subcommands, and error handling.
 */

import { test, expect, describe } from 'bun:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const CLI_PATH = 'server/cli.bun.ts';

/** Run CLI in a temp directory, return stdout+stderr and exit code. */
async function runCli(
  dir: string,
  args: string[],
  options?: { timeout?: number },
): Promise<{ output: string; code: number }> {
  const proc = Bun.spawn([process.execPath, 'run', `${process.cwd()}/${CLI_PATH}`, ...args], {
    cwd: dir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const timeout = options?.timeout ?? 10_000;
  let killed = false;

  const timer = setTimeout(() => {
    killed = true;
    try {
      proc.kill('SIGTERM' as unknown as number);
    } catch { /* already exited */ }
  }, timeout);

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  clearTimeout(timer);

  const output = stdout + stderr;
  const code = killed ? 0 : exitCode;

  return { output, code };
}

/** Create a temp directory with optional files. */
async function createTempProject(
  files?: Record<string, string>,
): Promise<string> {
  const dir = await mkdtemp(tmpdir() + '/emroute-cli-test-');
  if (files) {
    for (const [path, content] of Object.entries(files)) {
      const fullPath = `${dir}/${path}`;
      const parent = fullPath.substring(0, fullPath.lastIndexOf('/'));
      await mkdir(parent, { recursive: true });
      await Bun.write(fullPath, content);
    }
  }
  return dir;
}

// ── Error handling ───────────────────────────────────────────────────

test('cli - exits with error when routes/ missing', async () => {
  const dir = await createTempProject();
  const { output, code } = await runCli(dir, ['start']);
  expect(code).toEqual(1);
  expect(output).toContain('routes/ directory not found');
  await rm(dir, { recursive: true });
});

test('cli - exits with error for unknown command', async () => {
  const dir = await createTempProject();
  const { output, code } = await runCli(dir, ['banana']);
  expect(code).toEqual(1);
  expect(output).toContain('Unknown command: banana');
  await rm(dir, { recursive: true });
});

test('cli - exits with error for invalid --spa value', async () => {
  const dir = await createTempProject({ 'routes/index.page.md': '# Hi' });
  const { output, code } = await runCli(dir, ['start', '--spa', 'invalid']);
  expect(code).toEqual(1);
  expect(output).toContain('Invalid SPA mode');
  await rm(dir, { recursive: true });
});

test('cli - exits with error for unknown flag', async () => {
  const dir = await createTempProject({ 'routes/index.page.md': '# Hi' });
  const { output, code } = await runCli(dir, ['start', '--banana']);
  expect(code).toEqual(1);
  expect(output).toContain('Unknown flag');
  await rm(dir, { recursive: true });
});

// ── SPA mode inference ──────────────────────────────────────────────

test('cli - infers spa=none for md-only project', async () => {
  const dir = await createTempProject({ 'routes/index.page.md': '# Hello' });
  const { output } = await runCli(dir, ['start', '--port', '4210'], { timeout: 5000 });
  expect(output).toContain('spa:     none');
  await rm(dir, { recursive: true });
});

test('cli - infers spa=root when .page.ts exists', async () => {
  const dir = await createTempProject({
    'routes/index.page.md': '# Hello',
    'routes/about.page.ts': 'export default {};',
  });
  const { output } = await runCli(dir, ['start', '--port', '4211'], { timeout: 5000 });
  expect(output).toContain('spa:     root');
  await rm(dir, { recursive: true });
});

test('cli - infers spa=root when widgets/ exists', async () => {
  const dir = await createTempProject({
    'routes/index.page.md': '# Hello',
    'widgets/counter/counter.widget.ts': 'export default {};',
  });
  const { output } = await runCli(dir, ['start', '--port', '4212'], { timeout: 5000 });
  expect(output).toContain('spa:     root');
  await rm(dir, { recursive: true });
});

test('cli - infers spa=root when main.ts exists', async () => {
  const dir = await createTempProject({
    'routes/index.page.md': '# Hello',
    'main.ts': 'console.log("hello");',
  });
  const { output } = await runCli(dir, ['start', '--port', '4213'], { timeout: 5000 });
  expect(output).toContain('spa:     root');
  expect(output).toContain('entry:   main.ts');
  await rm(dir, { recursive: true });
});

test('cli - --spa flag overrides inference', async () => {
  const dir = await createTempProject({
    'routes/index.page.md': '# Hello',
    'routes/about.page.ts': 'export default {};',
  });
  const { output } = await runCli(dir, ['start', '--spa', 'none', '--port', '4214'], {
    timeout: 5000,
  });
  expect(output).toContain('spa:     none');
  await rm(dir, { recursive: true });
});

// ── Generate command ─────────────────────────────────────────────────

test('cli generate - creates routes manifest', async () => {
  const dir = await createTempProject({
    'routes/index.page.md': '# Hello',
    'routes/about.page.md': '# About',
  });
  const { output, code } = await runCli(dir, ['generate']);
  expect(code).toEqual(0);
  expect(output).toContain('routes.manifest.g.ts (2 routes)');

  const manifest = await Bun.file(`${dir}/routes.manifest.g.ts`).text();
  expect(manifest).toContain('routesManifest');
  expect(manifest).toContain("pattern: '/'");
  expect(manifest).toContain("pattern: '/about'");
  await rm(dir, { recursive: true });
});

test('cli generate - creates widgets manifest when widgets/ exists', async () => {
  const dir = await createTempProject({
    'routes/index.page.md': '# Hello',
    'widgets/greeting/greeting.widget.ts': 'export default {};',
  });
  const { output, code } = await runCli(dir, ['generate']);
  expect(code).toEqual(0);
  expect(output).toContain('widgets.manifest.g.ts');

  const manifest = await Bun.file(`${dir}/widgets.manifest.g.ts`).text();
  expect(manifest).toContain('greeting');
  await rm(dir, { recursive: true });
});

test('cli generate - skips widgets manifest when no widgets/', async () => {
  const dir = await createTempProject({ 'routes/index.page.md': '# Hello' });
  const { output, code } = await runCli(dir, ['generate']);
  expect(code).toEqual(0);
  expect(output).toContain('routes.manifest.g.ts');

  let widgetsExists = true;
  try {
    await Bun.file(`${dir}/widgets.manifest.g.ts`).text();
  } catch {
    widgetsExists = false;
  }
  expect(widgetsExists).toEqual(false);
  await rm(dir, { recursive: true });
});

// ── Build command ────────────────────────────────────────────────────

test('cli build - produces shell in none mode (no JS)', async () => {
  const dir = await createTempProject({ 'routes/index.page.md': '# Hello' });
  const { output, code } = await runCli(dir, ['build', '--out', `${dir}/.build`], {
    timeout: 15000,
  });
  expect(code).toEqual(0);
  expect(output).toContain('spa:     none');
  expect(output).toContain('Build complete');

  const shell = await Bun.file(`${dir}/.build/index.html`).text();
  expect(shell).toContain('<!DOCTYPE html>');
  // No script tags in none mode
  expect(shell.includes('<script')).toEqual(false);
  await rm(dir, { recursive: true });
});

// ── Default command ──────────────────────────────────────────────────

test('cli - no subcommand defaults to start', async () => {
  const dir = await createTempProject({ 'routes/index.page.md': '# Hello' });
  const { output } = await runCli(dir, ['--port', '4215'], { timeout: 5000 });
  expect(output).toContain('Starting dev server');
  await rm(dir, { recursive: true });
});

// ── Server responds ──────────────────────────────────────────────────

test('cli start - server responds to HTTP requests', async () => {
  const dir = await createTempProject({ 'routes/index.page.md': '# Welcome' });

  const proc = Bun.spawn([process.execPath, 'run', `${process.cwd()}/${CLI_PATH}`, 'start', '--port', '4216'], {
    cwd: dir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

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

    expect(ready).toEqual(true);

    // Test SSR HTML
    const htmlResp = await fetch('http://localhost:4216/html');
    expect(htmlResp.status).toEqual(200);
    const html = await htmlResp.text();
    expect(html).toContain('Welcome');

    // Test SSR Markdown
    const mdResp = await fetch('http://localhost:4216/md');
    expect(mdResp.status).toEqual(200);
    const md = await mdResp.text();
    expect(md).toContain('# Welcome');
  } finally {
    try {
      proc.kill('SIGTERM' as unknown as number);
    } catch { /* already exited */ }
    await proc.exited;
    await rm(dir, { recursive: true });
  }
});
