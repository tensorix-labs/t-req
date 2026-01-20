import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Temporary directory fixture with async dispose pattern.
 * Usage: await using tmp = await tmpdir();
 */
export interface TempDir {
  path: string;
  join(...parts: string[]): string;
  writeFile(relativePath: string, content: string): Promise<void>;
  mkdir(relativePath: string): Promise<void>;
  symlink(target: string, linkPath: string): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

export async function tmpdir(prefix = 'treq-test-'): Promise<TempDir> {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));

  return {
    path: dirPath,

    join(...parts: string[]): string {
      return path.join(dirPath, ...parts);
    },

    async writeFile(relativePath: string, content: string): Promise<void> {
      const fullPath = path.join(dirPath, relativePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    },

    async mkdir(relativePath: string): Promise<void> {
      await fs.mkdir(path.join(dirPath, relativePath), { recursive: true });
    },

    async symlink(target: string, linkPath: string): Promise<void> {
      await fs.symlink(target, path.join(dirPath, linkPath));
    },

    async [Symbol.asyncDispose](): Promise<void> {
      await fs.rm(dirPath, { recursive: true, force: true });
    }
  };
}

/**
 * Legacy helper for backwards compatibility.
 */
export async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  await using tmp = await tmpdir();
  await fn(tmp.path);
}
