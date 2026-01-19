import { access, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { IO } from './types';

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Node IO adapter (fs + path) for running `runFile()` and file references.
 */
export function createNodeIO(): IO {
  return {
    cwd: () => process.cwd(),
    path: {
      resolve: (...parts) => path.resolve(...parts),
      dirname: (p) => path.dirname(p),
      basename: (p) => path.basename(p),
      extname: (p) => path.extname(p),
      isAbsolute: (p) => path.isAbsolute(p),
      sep: path.sep
    },
    exists,
    readText: async (p) => await readFile(p, 'utf8'),
    readBinary: async (p) => {
      const buf = await readFile(p);
      // Ensure we return an ArrayBuffer exactly sized to the file contents.
      // Note: Node's Buffer.buffer is never a SharedArrayBuffer, but TypeScript doesn't know that.
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    }
  };
}
