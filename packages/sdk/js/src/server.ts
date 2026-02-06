/**
 * @t-req/sdk/server — Spawn and manage a t-req server process.
 */

import { type ChildProcess, spawn } from 'node:child_process';

export interface TreqServerOptions {
  /** Workspace directory for the server */
  workspace?: string;
  /** Port to listen on (default: 0 for random) */
  port?: number;
  /** Path to the treq binary (default: "treq") */
  bin?: string;
}

export interface TreqServer {
  /** The resolved server URL (e.g. http://localhost:4097) */
  url: string;
  /** The server process */
  process: ChildProcess;
  /** Stop the server */
  close(): void;
}

/**
 * Spawn a `treq serve` process and wait for it to be ready.
 * Returns the server URL and a close() handle.
 */
export async function createTreqServer(options?: TreqServerOptions): Promise<TreqServer> {
  const bin = options?.bin ?? 'treq';
  const port = options?.port ?? 0;
  const args = ['serve', '--port', String(port)];

  if (options?.workspace) {
    args.push(options.workspace);
  }

  const child = spawn(bin, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const url = await new Promise<string>((resolve, reject) => {
    let stdout = '';

    const onData = (chunk: Buffer) => {
      stdout += chunk.toString();
      // The server prints "Listening on http://..." when ready
      const match = stdout.match(/Listening on (http:\/\/[^\s]+)/);
      if (match?.[1]) {
        child.stdout?.off('data', onData);
        resolve(match[1]);
      }
    };

    child.stdout?.on('data', onData);

    child.on('error', (err) => {
      reject(new Error(`Failed to start treq server: ${err.message}`));
    });

    child.on('exit', (code) => {
      if (code !== null && code !== 0) {
        reject(new Error(`treq server exited with code ${code}`));
      }
    });
  });

  return {
    url,
    process: child,
    close() {
      child.kill('SIGTERM');
    }
  };
}
