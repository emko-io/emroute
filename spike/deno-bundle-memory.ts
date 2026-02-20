/**
 * Spike: Can `deno bundle` work without pre-existing files on disk?
 *
 * Test 1: Write temp files, bundle, clean up
 * Test 2: Check if deno bundle supports stdin
 */

// --- Test 1: Temp files approach ---
console.log('=== Test 1: Temp files ===');

const tempDir = await Deno.makeTempDir({ prefix: 'emroute-bundle-' });

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

for (const [name, content] of Object.entries(virtualFiles)) {
  await Deno.writeTextFile(`${tempDir}/${name}`, content);
}

const outFile = `${tempDir}/out.js`;
const proc1 = new Deno.Command('deno', {
  args: ['bundle', '--platform', 'browser', `${tempDir}/app.ts`, '-o', outFile],
  stdout: 'piped',
  stderr: 'piped',
}).spawn();

const { code: code1, stdout: stdout1, stderr: stderr1 } = await proc1.output();
console.log('Exit code:', code1);
if (code1 === 0) {
  const output = await Deno.readTextFile(outFile);
  console.log('Output:');
  console.log(output);
} else {
  console.log('stderr:', new TextDecoder().decode(stderr1));
}

await Deno.remove(tempDir, { recursive: true });
console.log('Temp dir cleaned up');

// --- Test 2: stdin approach ---
console.log('\n=== Test 2: stdin (if supported) ===');

const proc2 = new Deno.Command('deno', {
  args: ['bundle', '--platform', 'browser', '-'],
  stdin: 'piped',
  stdout: 'piped',
  stderr: 'piped',
}).spawn();

const writer = proc2.stdin.getWriter();
await writer.write(new TextEncoder().encode(`console.log('hello from stdin');`));
await writer.close();

const { code: code2, stdout: stdout2, stderr: stderr2 } = await proc2.output();
console.log('Exit code:', code2);
if (code2 === 0) {
  console.log('Output:', new TextDecoder().decode(stdout2));
} else {
  console.log('stdin not supported:', new TextDecoder().decode(stderr2));
}