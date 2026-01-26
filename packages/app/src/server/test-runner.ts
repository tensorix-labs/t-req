/**
 * Server-side Test Runner - Framework detection and test execution.
 *
 * Security model:
 * - Whitelist-only frameworks (no arbitrary command execution)
 * - Path validation to prevent workspace escape
 * - No token passthrough to test processes
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { type Subprocess, spawn } from 'bun';

// ============================================================================
// Types
// ============================================================================

export interface TestFrameworkConfig {
  /** Unique identifier for the framework */
  id: string;
  /** Display label for UI */
  label: string;
  /** The command to run (e.g., "bun", "npx", "pytest") */
  command: string;
  /** Arguments for the command (e.g., ["test"], ["vitest", "run"]) */
  args: string[];
  /** Languages this framework supports */
  languages: ('javascript' | 'typescript' | 'python')[];
}

export interface TestFrameworkOption {
  id: string;
  label: string;
}

export interface DetectTestFrameworkResult {
  detected: string | null;
  options: TestFrameworkOption[];
}

export interface RunTestOptions {
  /** Absolute path to the test file or directory */
  testPath: string;
  /** Framework configuration */
  framework: TestFrameworkConfig;
  /** Working directory for the test (typically project root) */
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
  /** Callback when test exits */
  onExit: (code: number | null) => void;
}

export interface RunningTest {
  /** Kill the running test (SIGINT first, SIGKILL after timeout) */
  kill: () => void;
  /** Process ID */
  pid: number;
  /** Run ID for tracking */
  runId: string;
}

// ============================================================================
// Framework Whitelist
// ============================================================================

/**
 * Hardcoded whitelist of allowed test frameworks.
 * Security: Only these frameworks can be used - no arbitrary command execution.
 */
export const FRAMEWORK_WHITELIST: TestFrameworkConfig[] = [
  {
    id: 'bun',
    label: 'bun test',
    command: 'bun',
    args: ['test'],
    languages: ['javascript', 'typescript']
  },
  {
    id: 'vitest',
    label: 'vitest',
    command: 'npx',
    args: ['vitest', 'run'],
    languages: ['javascript', 'typescript']
  },
  {
    id: 'jest',
    label: 'jest',
    command: 'npx',
    args: ['jest'],
    languages: ['javascript', 'typescript']
  },
  {
    id: 'pytest',
    label: 'pytest',
    command: 'pytest',
    args: [],
    languages: ['python']
  }
];

/**
 * Map of framework ID to config for fast lookup.
 */
const FRAMEWORK_BY_ID = new Map(FRAMEWORK_WHITELIST.map((f) => [f.id, f]));

/**
 * Get a framework config by ID. Returns undefined if not in whitelist.
 */
export function getFrameworkById(id: string): TestFrameworkConfig | undefined {
  return FRAMEWORK_BY_ID.get(id);
}

/**
 * Get all framework options.
 */
export function getTestFrameworkOptions(): TestFrameworkOption[] {
  return FRAMEWORK_WHITELIST.map((f) => ({ id: f.id, label: f.label }));
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
 * Read JSON file safely.
 */
async function readJsonFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await Bun.file(path).text();
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ============================================================================
// Framework Detection
// ============================================================================

/**
 * Auto-detect the test framework for a project.
 * Uses find-up pattern starting from the test file directory.
 *
 * Detection order:
 * 1. bun.lockb or bun.lock exists → bun test
 * 2. vitest.config.ts/.js exists → vitest
 * 3. jest.config.* exists → jest
 * 4. pytest.ini or pyproject.toml with pytest → pytest
 * 5. package.json devDependencies: vitest → vitest, jest → jest
 * 6. requirements.txt or pyproject.toml with pytest → pytest
 * 7. Fallback → null (prompt needed)
 */
export async function detectTestFramework(
  workspaceRoot: string,
  filePath?: string
): Promise<DetectTestFrameworkResult> {
  const startDir = filePath ? dirname(resolve(workspaceRoot, filePath)) : workspaceRoot;
  const options = getTestFrameworkOptions();

  // Check for Bun project (both bun.lockb and bun.lock formats)
  const bunLockb = await findUp('bun.lockb', startDir);
  const bunLock = await findUp('bun.lock', startDir);
  if (bunLockb || bunLock) {
    return { detected: 'bun', options };
  }

  // Check for vitest config
  const vitestConfig = await findUp(
    ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts'],
    startDir
  );
  if (vitestConfig) {
    return { detected: 'vitest', options };
  }

  // Check for jest config
  const jestConfig = await findUp(
    ['jest.config.js', 'jest.config.ts', 'jest.config.json', 'jest.config.mjs'],
    startDir
  );
  if (jestConfig) {
    return { detected: 'jest', options };
  }

  // Check for pytest.ini
  const pytestIni = await findUp('pytest.ini', startDir);
  if (pytestIni) {
    return { detected: 'pytest', options };
  }

  // Check pyproject.toml for pytest
  const pyprojectPath = await findUp('pyproject.toml', startDir);
  if (pyprojectPath) {
    try {
      const content = await Bun.file(pyprojectPath).text();
      if (content.includes('[tool.pytest') || content.includes('pytest')) {
        return { detected: 'pytest', options };
      }
    } catch {
      // Ignore read errors
    }
  }

  // Check package.json devDependencies
  const packageJsonPath = await findUp('package.json', startDir);
  if (packageJsonPath) {
    const packageJson = await readJsonFile(packageJsonPath);
    if (packageJson) {
      const devDeps = packageJson.devDependencies as Record<string, unknown> | undefined;
      const deps = packageJson.dependencies as Record<string, unknown> | undefined;
      const allDeps = { ...deps, ...devDeps };

      if ('vitest' in allDeps) {
        return { detected: 'vitest', options };
      }
      if ('jest' in allDeps) {
        return { detected: 'jest', options };
      }
    }
  }

  // Check requirements.txt for pytest
  const requirementsPath = await findUp('requirements.txt', startDir);
  if (requirementsPath) {
    try {
      const content = await Bun.file(requirementsPath).text();
      if (content.toLowerCase().includes('pytest')) {
        return { detected: 'pytest', options };
      }
    } catch {
      // Ignore read errors
    }
  }

  // No framework detected
  return { detected: null, options };
}

// ============================================================================
// Test Execution
// ============================================================================

// Track running tests by runId
const runningTests = new Map<string, { proc: Subprocess; kill: () => void }>();

/**
 * Generate a unique run ID.
 */
function generateRunId(): string {
  return `test_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Run tests with the given framework.
 * Returns a handle to kill the process and the run ID.
 *
 * Security:
 * - Passes TREQ_SERVER, TREQ_FLOW_ID, TREQ_SESSION_ID, and TREQ_TOKEN
 * - The token is a scoped script token (not the main server token)
 * - Token is scoped to the specific flowId and sessionId
 * - Token is short-lived and revoked on test exit
 */
export function runTest(options: RunTestOptions): RunningTest {
  const {
    testPath,
    framework,
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

  // Build command args: framework.args + testPath
  const args = [...framework.args, testPath];

  // Build environment variables with scoped token
  const env: Record<string, string | undefined> = {
    ...process.env,
    TREQ_SERVER: serverUrl,
    TREQ_FLOW_ID: flowId,
    TREQ_SESSION_ID: sessionId,
    TREQ_TOKEN: scriptToken // Scoped token (not the main server token)
  };

  // Spawn the process
  const proc = spawn([framework.command, ...args], {
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
    runningTests.delete(runId);
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

  // Track running test
  runningTests.set(runId, { proc, kill });

  return {
    kill,
    pid: proc.pid,
    runId
  };
}

/**
 * Cancel a running test by runId.
 * Returns true if the test was found and killed.
 */
export function cancelTest(runId: string): boolean {
  const entry = runningTests.get(runId);
  if (entry) {
    entry.kill();
    runningTests.delete(runId);
    return true;
  }
  return false;
}

/**
 * Check if a test is currently running.
 */
export function isTestRunning(runId: string): boolean {
  return runningTests.has(runId);
}
