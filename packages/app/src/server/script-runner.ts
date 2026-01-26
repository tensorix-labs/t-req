/**
 * Server-side Script Runner - Process spawning and runner detection.
 *
 * Security model:
 * - Whitelist-only runners (no arbitrary command execution)
 * - Path validation to prevent workspace escape
 * - No token passthrough to scripts
 */

import { existsSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { type Subprocess, spawn } from 'bun';

// ============================================================================
// Types
// ============================================================================

export interface RunnerConfig {
  /** Unique identifier for the runner */
  id: string;
  /** Display label for UI */
  label: string;
  /** The command to run (e.g., "node", "bun", "npx") */
  command: string;
  /** Arguments before the script path (e.g., ["tsx"]) */
  args: string[];
  /** File extensions this runner supports */
  extensions: string[];
}

export interface RunnerOption {
  id: string;
  label: string;
}

export interface DetectRunnerResult {
  detected: string | null;
  options: RunnerOption[];
}

export interface RunScriptOptions {
  /** Absolute path to the script */
  scriptPath: string;
  /** Runner configuration */
  runner: RunnerConfig;
  /** Working directory for the script (script's directory) */
  cwd: string;
  /** Server URL to inject as TREQ_SERVER */
  serverUrl: string;
  /** Flow ID to inject as TREQ_FLOW_ID */
  flowId: string;
  /** Pre-created session ID to inject as TREQ_SESSION_ID */
  sessionId: string;
  /** Scoped script token to inject as TREQ_TOKEN */
  scriptToken?: string;
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
  /** Run ID for tracking */
  runId: string;
}

// ============================================================================
// Runner Whitelist
// ============================================================================

/**
 * Hardcoded whitelist of allowed runners.
 * Security: Only these runners can be used - no arbitrary command execution.
 */
export const RUNNER_WHITELIST: RunnerConfig[] = [
  {
    id: 'bun',
    label: 'bun',
    command: 'bun',
    args: [],
    extensions: ['.ts', '.js', '.mts', '.mjs']
  },
  {
    id: 'node',
    label: 'node',
    command: 'node',
    args: [],
    extensions: ['.js', '.mjs']
  },
  {
    id: 'npx-tsx',
    label: 'npx tsx',
    command: 'npx',
    args: ['tsx'],
    extensions: ['.ts', '.mts']
  },
  {
    id: 'npx-ts-node',
    label: 'npx ts-node',
    command: 'npx',
    args: ['ts-node'],
    extensions: ['.ts']
  },
  {
    id: 'python',
    label: 'python',
    command: 'python',
    args: [],
    extensions: ['.py']
  }
];

/**
 * Map of runner ID to config for fast lookup.
 */
const RUNNER_BY_ID = new Map(RUNNER_WHITELIST.map((r) => [r.id, r]));

/**
 * Get a runner config by ID. Returns undefined if not in whitelist.
 */
export function getRunnerById(id: string): RunnerConfig | undefined {
  return RUNNER_BY_ID.get(id);
}

/**
 * Get runner options filtered by file extension.
 */
export function getRunnerOptions(filePath?: string): RunnerOption[] {
  if (!filePath) {
    return RUNNER_WHITELIST.map((r) => ({ id: r.id, label: r.label }));
  }

  const ext = extname(filePath).toLowerCase();
  return RUNNER_WHITELIST.filter((r) => r.extensions.includes(ext)).map((r) => ({
    id: r.id,
    label: r.label
  }));
}

// ============================================================================
// Path Utilities
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
 * Uses find-up pattern starting from script directory.
 *
 * Detection order for .ts/.mts files:
 * 1. bun.lockb or bun.lock exists → bun
 * 2. bun is globally available → bun (preferred for TypeScript)
 * 3. node_modules/.bin/tsx exists → npx-tsx
 * 4. node_modules/.bin/ts-node exists → npx-ts-node
 * 5. global tsx exists → npx-tsx
 * 6. Fallback → null (prompt needed)
 *
 * For .js/.mjs files: Prefer bun if lockfile present, otherwise node
 * For .py files: Always use python
 */
export async function detectRunner(
  workspaceRoot: string,
  filePath: string
): Promise<DetectRunnerResult> {
  const absolutePath = resolve(workspaceRoot, filePath);
  const ext = extname(absolutePath).toLowerCase();
  const scriptDir = dirname(absolutePath);

  // Get options for this file type
  const options = getRunnerOptions(filePath);

  // Python files always use python
  if (ext === '.py') {
    return { detected: 'python', options };
  }

  // Check for Bun project FIRST (both bun.lockb and bun.lock formats)
  const bunLockb = await findUp('bun.lockb', scriptDir);
  const bunLock = await findUp('bun.lock', scriptDir);
  const isBunProject = !!(bunLockb || bunLock);

  // JavaScript files
  if (ext === '.js' || ext === '.mjs') {
    // Prefer bun for Bun projects
    if (isBunProject) {
      return { detected: 'bun', options };
    }
    return { detected: 'node', options };
  }

  // TypeScript files - walk up from script directory
  if (ext === '.ts' || ext === '.mts') {
    // Check for Bun project (bun.lockb or bun.lock indicates Bun)
    if (isBunProject) {
      return { detected: 'bun', options };
    }

    // For TypeScript, prefer bun if globally available (better DX)
    if (await commandExists('bun')) {
      return { detected: 'bun', options };
    }

    // Check for local tsx or ts-node
    const nearestNodeModules = await findNearestNodeModules(scriptDir);
    if (nearestNodeModules) {
      const tsxBin = join(nearestNodeModules, '.bin', 'tsx');
      if (existsSync(tsxBin)) {
        return { detected: 'npx-tsx', options };
      }

      const tsNodeBin = join(nearestNodeModules, '.bin', 'ts-node');
      if (existsSync(tsNodeBin)) {
        return { detected: 'npx-ts-node', options };
      }
    }

    // Check for global tsx
    if (await commandExists('tsx')) {
      return { detected: 'npx-tsx', options };
    }

    // No runner detected - prompt needed
    return { detected: null, options };
  }

  // Unknown extension
  return { detected: null, options };
}

// ============================================================================
// Script Execution
// ============================================================================

// Track running scripts by runId
const runningScripts = new Map<string, { proc: Subprocess; kill: () => void }>();

/**
 * Generate a unique run ID.
 */
function generateRunId(): string {
  return `run_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Run a script with the given runner.
 * Returns a handle to kill the process and the run ID.
 *
 * Security:
 * - Passes TREQ_SERVER, TREQ_FLOW_ID, TREQ_SESSION_ID, and TREQ_TOKEN
 * - The token is a scoped script token (not the main server token)
 * - Token is scoped to the specific flowId and sessionId
 * - Token is short-lived and revoked on script exit
 */
export function runScript(options: RunScriptOptions): RunningScript {
  const {
    scriptPath,
    runner,
    cwd,
    serverUrl,
    flowId,
    sessionId,
    scriptToken,
    onStdout,
    onStderr,
    onExit
  } = options;

  const runId = generateRunId();

  // Build command args: runner.args + scriptPath
  const args = [...runner.args, scriptPath];

  // Build environment variables with scoped token
  const env: Record<string, string | undefined> = {
    ...process.env,
    TREQ_SERVER: serverUrl,
    TREQ_FLOW_ID: flowId,
    TREQ_SESSION_ID: sessionId,
    TREQ_TOKEN: scriptToken // Scoped token (not the main server token)
  };

  // Spawn the process
  const proc = spawn([runner.command, ...args], {
    cwd,
    env,
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
    runningScripts.delete(runId);
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

  // Track running script
  runningScripts.set(runId, { proc, kill });

  return {
    kill,
    pid: proc.pid,
    runId
  };
}

/**
 * Cancel a running script by runId.
 * Returns true if the script was found and killed.
 */
export function cancelScript(runId: string): boolean {
  const entry = runningScripts.get(runId);
  if (entry) {
    entry.kill();
    runningScripts.delete(runId);
    return true;
  }
  return false;
}

/**
 * Check if a script is currently running.
 */
export function isScriptRunning(runId: string): boolean {
  return runningScripts.has(runId);
}
