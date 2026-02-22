import { createTestServer } from './setup.ts';

const port = Number(process.env.TEST_PORT ?? '4106');
await createTestServer({ mode: 'leaf', port, entryPoint: 'hash-main.ts' });
console.log(`\nReady at http://localhost:${port}/html/hash-app\n`);
