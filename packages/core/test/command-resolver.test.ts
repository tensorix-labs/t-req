import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CommandResolverDef } from '../src/config';
import { createCommandResolver } from '../src/resolver';

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'treq-resolver-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('command resolvers', () => {
  test('parses first non-empty NDJSON line and tolerates CRLF', async () => {
    await withTempDir(async (dir) => {
      const scriptPath = path.join(dir, 'resolver.js');
      await writeFile(
        scriptPath,
        `
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  const req = JSON.parse(raw);
  const value = \`name=\${req.resolver};args=\${(req.args || []).join(',')}\`;
  process.stdout.write('\\r\\n');
  process.stdout.write(JSON.stringify({ value }) + '\\r\\n');
  process.stdout.write(JSON.stringify({ value: 'ignored' }) + '\\n');
});
`
      );

      const def: CommandResolverDef = {
        type: 'command',
        command: ['bun', scriptPath],
        timeoutMs: 2000
      };

      const resolver = createCommandResolver(def, dir, '$test');
      const out = await resolver('a', 'b');
      expect(out).toBe('name=$test;args=a,b');
    });
  });

  test('fails with a helpful error when stdout is not JSON', async () => {
    await withTempDir(async (dir) => {
      const scriptPath = path.join(dir, 'bad.js');
      await writeFile(
        scriptPath,
        `
process.stdin.resume();
process.stdout.write('not json\\n');
`
      );

      const def: CommandResolverDef = {
        type: 'command',
        command: ['bun', scriptPath],
        timeoutMs: 2000
      };

      const resolver = createCommandResolver(def, dir, '$bad');
      await expect(resolver('x')).rejects.toThrow(/invalid JSON/i);
    });
  });
});
