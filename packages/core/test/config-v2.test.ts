import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveProjectConfig } from '../src/config';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'treq-core-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('Config v2 (resolveProjectConfig)', () => {
  test('applies profile + overrideLayers and runs substitutions after merge', async () => {
    await withTempDir(async (dir) => {
      process.env.TEST_VAR = 'VALUE';

      const configPath = path.join(dir, 'treq.jsonc');
      await writeFile(
        configPath,
        `{
  "variables": { "v": "file" },
  "profiles": {
    "dev": { "variables": { "v": "{env:TEST_VAR}" } }
  }
}`
      );

      const { config, meta } = await resolveProjectConfig({
        startDir: dir,
        stopDir: dir,
        profile: 'dev',
        overrideLayers: [{ name: 'cli', overrides: { variables: { v: '{env:TEST_VAR}-cli' } } }]
      });

      expect(config.variables.v).toBe('VALUE-cli');
      expect(meta.layersApplied).toEqual(['file', 'profile:dev', 'cli']);
    });
  });

  test('stopDir prevents picking a parent config outside workspace', async () => {
    await withTempDir(async (dir) => {
      const parentDir = path.join(dir, 'parent');
      const workspaceRoot = path.join(parentDir, 'workspace');
      const nestedDir = path.join(workspaceRoot, 'a', 'b');

      await mkdir(nestedDir, { recursive: true });

      // Parent config exists above workspaceRoot and should NOT be discovered.
      await writeFile(
        path.join(parentDir, 'treq.jsonc'),
        `{
  "variables": { "found": "in-parent" }
}`
      );

      const { config, meta } = await resolveProjectConfig({
        startDir: nestedDir,
        stopDir: workspaceRoot
      });

      expect(meta.configPath).toBeUndefined();
      expect(meta.layersApplied).toEqual([]);
      expect(config.projectRoot).toBe(path.resolve(workspaceRoot));
      expect(config.variables).toEqual({});
    });
  });

  test('file substitution blocks symlink escape outside workspace unless allowExternalFiles=true', async () => {
    if (process.platform === 'win32') {
      // Symlink creation is not reliable on Windows in CI without special permissions.
      return;
    }

    await withTempDir(async (dir) => {
      const workspaceRoot = path.join(dir, 'workspace');
      const outsideRoot = path.join(dir, 'outside');
      await mkdir(workspaceRoot, { recursive: true });
      await mkdir(outsideRoot, { recursive: true });

      const secretPath = path.join(outsideRoot, 'secret.txt');
      await writeFile(secretPath, 'secret-token\n');

      // Symlink inside workspace → outside
      const linkPath = path.join(workspaceRoot, 'token.txt');
      await symlink(secretPath, linkPath);

      // Default security (allowExternalFiles=false) should reject symlink escape.
      await writeFile(
        path.join(workspaceRoot, 'treq.jsonc'),
        `{
  "variables": { "token": "{file:./token.txt}" }
}`
      );

      await expect(
        resolveProjectConfig({
          startDir: workspaceRoot,
          stopDir: workspaceRoot
        })
      ).rejects.toThrow(/outside workspace/i);

      // With allowExternalFiles=true, allow reading the resolved target.
      await writeFile(
        path.join(workspaceRoot, 'treq.jsonc'),
        `{
  "security": { "allowExternalFiles": true },
  "variables": { "token": "{file:./token.txt}" }
}`
      );

      // Small delay for filesystems that require it (rare, but avoids flakiness).
      await sleep(5);

      const { config } = await resolveProjectConfig({
        startDir: workspaceRoot,
        stopDir: workspaceRoot
      });

      // trimEnd applied by substitution implementation
      expect(config.variables.token).toBe('secret-token');
    });
  });
});
