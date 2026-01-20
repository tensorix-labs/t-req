import { spawn } from 'node:child_process';
import type { CommandResolverDef } from '../config/types';
import type { Resolver } from '../types';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT_MS = 2000;
const GRACE_PERIOD_MS = 500;
const MAX_STDOUT_BYTES = 1024 * 1024; // 1MB
const MAX_STDERR_BYTES = 64 * 1024; // 64KB

// ============================================================================
// Types
// ============================================================================

type ResolverRequest = {
  resolver: string;
  args: string[];
};

type ResolverResponse = {
  value: string;
};

// ============================================================================
// Command Execution
// ============================================================================

/**
 * Execute a command resolver and return its value.
 */
async function executeCommandResolver(
  def: CommandResolverDef,
  name: string,
  args: string[],
  projectRoot: string
): Promise<string> {
  const timeoutMs = def.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (def.command.length === 0) {
    throw new Error(`Resolver "${name}" has empty command array`);
  }

  const [cmd, ...cmdArgs] = def.command;
  if (!cmd) {
    throw new Error(`Resolver "${name}" has empty command`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let killed = false;
    let timedOut = false;

    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');

      // Grace period before SIGKILL
      setTimeout(() => {
        if (!killed) {
          child.kill('SIGKILL');
        }
      }, GRACE_PERIOD_MS);
    }, timeoutMs);

    // Handle stdout
    child.stdout?.on('data', (data: Buffer) => {
      const remaining = MAX_STDOUT_BYTES - stdoutBytes;
      if (remaining > 0) {
        const chunk = data.slice(0, remaining);
        stdout += chunk.toString('utf-8');
        stdoutBytes += chunk.length;
        if (chunk.length < data.length) {
          stdoutTruncated = true;
        }
      } else {
        stdoutTruncated = true;
      }
    });

    // Handle stderr
    child.stderr?.on('data', (data: Buffer) => {
      const remaining = MAX_STDERR_BYTES - stderrBytes;
      if (remaining > 0) {
        const chunk = data.slice(0, remaining);
        stderr += chunk.toString('utf-8');
        stderrBytes += chunk.length;
        if (chunk.length < data.length) {
          stderrTruncated = true;
        }
      } else {
        stderrTruncated = true;
      }
    });

    // Handle close
    child.on('close', (code, signal) => {
      clearTimeout(timeoutHandle);
      killed = true;

      if (timedOut) {
        reject(
          new Error(
            `Resolver "${name}" timed out after ${timeoutMs}ms${stderr ? `: ${stderr}` : ''}`
          )
        );
        return;
      }

      if (code !== 0) {
        const exitInfo = signal ? `killed by signal ${signal}` : `exit code ${code}`;
        reject(new Error(`Resolver "${name}" failed (${exitInfo})${stderr ? `: ${stderr}` : ''}`));
        return;
      }

      // Parse output as NDJSON
      const trimmed = stdout.trim();
      if (!trimmed) {
        reject(new Error(`Resolver "${name}" returned no output`));
        return;
      }

      // Take first non-empty line (NDJSON protocol) and tolerate CRLF
      const firstLine =
        trimmed
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l.length > 0) ?? '';

      let response: ResolverResponse;
      try {
        response = JSON.parse(firstLine) as ResolverResponse;
      } catch {
        const suffix = stdoutTruncated ? ' (stdout exceeded 1MB limit and was truncated)' : '';
        reject(
          new Error(`Resolver "${name}" returned invalid JSON: ${firstLine.slice(0, 100)}${suffix}`)
        );
        return;
      }

      if (typeof response.value !== 'string') {
        reject(new Error(`Resolver "${name}" returned no value (expected { "value": "..." })`));
        return;
      }

      resolve(response.value);
    });

    // Handle error
    child.on('error', (err) => {
      clearTimeout(timeoutHandle);
      const suffix = stderrTruncated ? ' (stderr exceeded 64KB limit and was truncated)' : '';
      reject(new Error(`Resolver "${name}" failed to execute: ${err.message}${suffix}`));
    });

    // Write request to stdin
    const request: ResolverRequest = {
      resolver: name,
      args
    };

    child.stdin?.write(`${JSON.stringify(request)}\n`);
    child.stdin?.end();
  });
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a Resolver function from a CommandResolverDef.
 *
 * The created resolver executes the external command with the NDJSON protocol:
 * - Writes `{"resolver":"name","args":["arg1","arg2"]}` to stdin
 * - Expects `{"value":"result"}` on stdout
 *
 * @param def - The command resolver definition
 * @param name - The resolver name (used for error messages)
 * @param projectRoot - The project root directory (used as cwd)
 */
export function createCommandResolver(
  def: CommandResolverDef,
  projectRoot: string,
  name?: string
): Resolver {
  const resolverName = name ?? '$command';
  return async (...args: string[]): Promise<string> => {
    return await executeCommandResolver(def, resolverName, args, projectRoot);
  };
}

/**
 * Check if a resolver definition is a command resolver.
 */
export function isCommandResolverDef(def: unknown): def is CommandResolverDef {
  if (!def || typeof def !== 'object') return false;
  const obj = def as Record<string, unknown>;
  return obj['type'] === 'command' && Array.isArray(obj['command']);
}
