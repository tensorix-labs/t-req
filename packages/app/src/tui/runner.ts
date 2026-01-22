/**
 * Runner module - Script spawning and runner detection for TUI.
 *
 * Handles auto-detection of TypeScript/JavaScript runners based on project configuration
 * and spawning scripts with TREQ_* environment variables injected.
 */

import { existsSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { spawn } from 'bun';

// ============================================================================
// Types
// ============================================================================

export interface RunnerConfig {
  /** The command to run (e.g., "node", "bun", "npx") */
  command: string;
  /** Additional arguments before the script path (e.g., ["tsx"], ["run"]) */
  args: string[];
}

export interface RunScriptOptions {
  /** Absolute path to the script */
  scriptPath: string;
  /** Runner configuration */
  runner: RunnerConfig;
  /** Environment variables to inject (TREQ_SERVER, TREQ_FLOW_ID, etc.) */
  env: Record<string, string>;
  /** Working directory for the script */
  cwd: string;
  /** Callback for stdout data */
  onStdout: (data: string) => void;
  /** Callback for stderr data */
  onStderr: (data: string) => void;
  /** Callback when script exits */
  onExit: (code: number | null) => void;
}

export interface RunningScript {
  /** Kill the running script (SIGINT first, SIGKILL after timeout) */
  kill: () => void;
  /** Process ID */
  pid: number;
}

// ============================================================================
// Lockfile/Package Detection
// ============================================================================

/**
 * Walk up from a directory to find the nearest file matching one of the given names.
 */
async function findUp(names: string | string[], startDir: string): Promise<string | undefined> {
  const nameList = Array.isArray(names) ? names : [names];
  let current = resolve(startDir);
  const root = resolve('/');

  while (current !== root) {
    for (const name of nameList) {
      const candidate = join(current, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return undefined;
}

/**
 * Find the nearest node_modules directory.
 */
async function findNearestNodeModules(startDir: string): Promise<string | undefined> {
  const result = await findUp('node_modules', startDir);
  if (result && statSync(result).isDirectory()) {
    return result;
  }
  return undefined;
}

/**
 * Check if a command is globally available.
 */
async function commandExists(command: string): Promise<boolean> {
  try {
    const proc = spawn([process.platform === 'win32' ? 'where' : 'which', command], {
      stdout: 'pipe',
      stderr: 'pipe'
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

// ============================================================================
// Runner Detection
// ============================================================================

/**
 * Auto-detect the appropriate runner for a script.
 *
 * Detection order for .ts/.mts files:
 * 1. bun.lockb exists at script's nearest lockfile → bun <file>
 * 2. node_modules/.bin/tsx exists → npx tsx <file>
 * 3. node_modules/.bin/ts-node exists → npx ts-node <file>
 * 4. Global tsx available → tsx <file>
 * 5. Fallback → null (prompt needed)
 *
 * For .js/.mjs files: Always use node <file>
 */
export async function detectRunner(scriptPath: string): Promise<RunnerConfig | null> {
  const ext = extname(scriptPath).toLowerCase();
  const scriptDir = dirname(scriptPath);

  // JavaScript files always use Node
  if (ext === '.js' || ext === '.mjs') {
    return { command: 'node', args: [] };
  }

  // TypeScript files - walk up from script directory
  if (ext === '.ts' || ext === '.mts') {
    // Check for bun.lockb (indicates Bun project)
    const nearestLockfile = await findUp(
      ['bun.lockb', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'],
      scriptDir
    );

    if (nearestLockfile?.endsWith('bun.lockb')) {
      return { command: 'bun', args: [] };
    }

    // Check for local tsx or ts-node
    const nearestNodeModules = await findNearestNodeModules(scriptDir);
    if (nearestNodeModules) {
      const tsxBin = join(nearestNodeModules, '.bin', 'tsx');
      if (existsSync(tsxBin)) {
        return { command: 'npx', args: ['tsx'] };
      }

      const tsNodeBin = join(nearestNodeModules, '.bin', 'ts-node');
      if (existsSync(tsNodeBin)) {
        return { command: 'npx', args: ['ts-node'] };
      }
    }

    // Check for global tsx
    if (await commandExists('tsx')) {
      return { command: 'tsx', args: [] };
    }

    // No runner detected - prompt needed
    return null;
  }

  // Unknown extension - try node
  return { command: 'node', args: [] };
}

/**
 * Get available runner options for the runner selection dialog.
 */
export function getRunnerOptions(): Array<{ id: string; label: string; runner: RunnerConfig }> {
  return [
    { id: 'bun', label: 'bun', runner: { command: 'bun', args: [] } },
    { id: 'npx-tsx', label: 'npx tsx', runner: { command: 'npx', args: ['tsx'] } },
    { id: 'npx-ts-node', label: 'npx ts-node', runner: { command: 'npx', args: ['ts-node'] } },
    { id: 'tsx', label: 'tsx (global)', runner: { command: 'tsx', args: [] } },
    {
      id: 'node-tsx',
      label: 'node --import tsx',
      runner: { command: 'node', args: ['--import', 'tsx'] }
    }
  ];
}

// ============================================================================
// Script Spawning
// ============================================================================

/**
 * Run a script with the given runner and environment.
 * Returns a handle to kill the process and the PID.
 */
export function runScript(options: RunScriptOptions): RunningScript {
  const { scriptPath, runner, env, cwd, onStdout, onStderr, onExit } = options;

  // Build command args: runner.args + scriptPath
  const args = [...runner.args, scriptPath];

  // Merge environment variables
  const mergedEnv = {
    ...process.env,
    ...env
  };

  // Spawn the process
  const proc = spawn([runner.command, ...args], {
    cwd,
    env: mergedEnv,
    stdout: 'pipe',
    stderr: 'pipe'
  });

  // Handle stdout
  (async () => {
    if (proc.stdout) {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          onStdout(decoder.decode(value));
        }
      } catch {
        // Stream closed
      }
    }
  })();

  // Handle stderr
  (async () => {
    if (proc.stderr) {
      const reader = proc.stderr.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          onStderr(decoder.decode(value));
        }
      } catch {
        // Stream closed
      }
    }
  })();

  // Handle exit
  proc.exited.then((code) => {
    onExit(code);
  });

  // Kill handler with SIGINT → SIGKILL fallback
  const kill = () => {
    try {
      // Try SIGINT first (graceful)
      proc.kill('SIGINT');

      // After 3 seconds, force kill if still running
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Already dead
        }
      }, 3000);
    } catch {
      // Process already dead
    }
  };

  return {
    kill,
    pid: proc.pid
  };
}

// ============================================================================
// Runner Config Persistence
// ============================================================================

const RUNNER_CONFIG_FILENAME = 'tui-runner.json';

export interface PersistedRunnerConfig {
  runner: RunnerConfig;
  savedAt: number;
}

/**
 * Load persisted runner config from .treq/tui-runner.json
 */
export async function loadPersistedRunner(
  workspaceRoot: string
): Promise<PersistedRunnerConfig | null> {
  const configPath = join(workspaceRoot, '.treq', RUNNER_CONFIG_FILENAME);
  try {
    const content = await Bun.file(configPath).text();
    const data = JSON.parse(content) as PersistedRunnerConfig;
    if (data.runner && typeof data.runner.command === 'string') {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save runner config to .treq/tui-runner.json
 */
export async function savePersistedRunner(
  workspaceRoot: string,
  runner: RunnerConfig
): Promise<void> {
  const configDir = join(workspaceRoot, '.treq');
  const configPath = join(configDir, RUNNER_CONFIG_FILENAME);

  // Ensure .treq directory exists
  try {
    await Bun.write(
      configPath,
      JSON.stringify(
        {
          runner,
          savedAt: Date.now()
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error('Failed to save runner config:', err);
  }
}
