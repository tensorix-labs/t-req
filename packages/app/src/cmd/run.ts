import { createEngine, parse } from '@t-req/core';
import { createCookieJar } from '@t-req/core/cookies';
import type { CommandModule } from 'yargs';
import {
  createCookieStoreFromJar,
  dirname,
  existsSync,
  isAbsolute,
  isPathSafe,
  resolve,
  resolveWorkspaceRoot
} from '../utils';

interface RunOptions {
  file: string;
  name?: string;
  index?: number;
  env?: string;
  var?: string[];
  timeout?: number;
  workspace?: string;
  verbose?: boolean;
}

export const DEFAULT_TIMEOUT_MS = 30_000;

export const runCommand: CommandModule<object, RunOptions> = {
  command: 'run <file>',
  describe: 'Execute a .http file',
  builder: {
    file: {
      type: 'string',
      describe: 'Path to .http file',
      demandOption: true
    },
    name: {
      type: 'string',
      describe: 'Select request by @name directive',
      alias: 'n'
    },
    index: {
      type: 'number',
      describe: 'Select request by index (0-based)',
      alias: 'i'
    },
    env: {
      type: 'string',
      describe: 'Environment to use (loads from environments/<env>.ts)',
      alias: 'e'
    },
    var: {
      type: 'array',
      string: true,
      describe: 'Variables in format key=value',
      alias: 'v'
    },
    timeout: {
      type: 'number',
      describe: 'Request timeout in milliseconds',
      alias: 't',
      default: DEFAULT_TIMEOUT_MS
    },
    workspace: {
      type: 'string',
      describe: 'Workspace root directory',
      alias: 'w'
    },
    verbose: {
      type: 'boolean',
      describe: 'Show detailed output',
      default: false
    }
  },
  handler: async (argv) => {
    await runRequest(argv);
  }
};

// ============================================================================
// Utility Functions
// ============================================================================

export function parseVariables(vars: string[] | undefined): Record<string, string> {
  if (!vars) return {};
  const result: Record<string, string> = {};
  for (const v of vars) {
    const eqIndex = v.indexOf('=');
    if (eqIndex === -1) {
      console.warn(`Warning: Invalid variable format "${v}", expected key=value`);
      continue;
    }
    const key = v.slice(0, eqIndex);
    const value = v.slice(eqIndex + 1);
    result[key] = value;
  }
  return result;
}

async function loadEnvironment(
  envName: string,
  workspaceRoot: string
): Promise<Record<string, unknown>> {
  const envRelPaths = [`environments/${envName}.ts`, `environments/${envName}.js`];

  for (const envRelPath of envRelPaths) {
    // Security: environment modules must be workspace-scoped and non-traversing.
    if (!isPathSafe(workspaceRoot, envRelPath)) {
      console.error(`Invalid environment path: ${envRelPath}`);
      process.exit(1);
    }

    const envAbsPath = resolve(workspaceRoot, envRelPath);
    if (!existsSync(envAbsPath)) continue;

    try {
      const module = await import(envAbsPath);
      return module.default ?? module;
    } catch (err) {
      console.error(`Failed to load environment "${envName}":`, err);
      process.exit(1);
    }
  }

  console.error(`Environment "${envName}" not found in environments/`);
  process.exit(1);
}

// Standard fetch Response interface for type assertions
interface FetchResponse {
  status: number;
  statusText: string;
  headers: {
    forEach(callback: (value: string, name: string) => void): void;
    get(name: string): string | null;
    getSetCookie?(): string[];
  };
  text(): Promise<string>;
  clone(): FetchResponse;
  arrayBuffer(): Promise<ArrayBuffer>;
}

type HeaderLike =
  | FetchResponse['headers']
  | Headers
  | Iterable<[string, string]>
  | {
      forEach?: (callback: (value: string, name: string) => void) => void;
      entries?: () => IterableIterator<[string, string]>;
      [Symbol.iterator]?: () => IterableIterator<[string, string]>;
    };

export function formatHeaders(headers: HeaderLike): string {
  const lines: string[] = [];

  // Prefer iteration (works well with `Headers` and plain iterables, and avoids Array.forEach ambiguity).
  const maybeIterator = (headers as { [Symbol.iterator]?: unknown })[Symbol.iterator];
  if (typeof maybeIterator === 'function') {
    for (const [name, value] of headers as Iterable<[string, string]>) {
      lines.push(`  ${name}: ${value}`);
    }
    return lines.join('\n');
  }

  // Next: use `entries()` if it's provided (some header-like objects only expose entries).
  const maybeEntries = (headers as { entries?: unknown }).entries;
  const iterable =
    typeof maybeEntries === 'function'
      ? (headers as { entries: () => IterableIterator<[string, string]> }).entries()
      : [];

  for (const [name, value] of iterable) {
    lines.push(`  ${name}: ${value}`);
  }

  if (lines.length > 0) return lines.join('\n');

  // Last: fall back to `forEach` if available (works with many fetch implementations).
  const maybeForEach = (headers as { forEach?: unknown }).forEach;
  if (typeof maybeForEach === 'function') {
    (headers as { forEach: (cb: (value: string, name: string) => void) => void }).forEach(
      (value, name) => {
        lines.push(`  ${name}: ${value}`);
      }
    );
  }

  return lines.join('\n');
}

export function formatResponseBody(contentType: string, body: string): string {
  if (!body) return '';
  if (contentType.includes('application/json')) {
    try {
      const json = JSON.parse(body);
      return JSON.stringify(json, null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

export function formatVerboseRequestLine(
  index: number,
  request: { name?: string; method: string; url: string }
): string {
  return `Request [${index}]: ${request.name ?? '(unnamed)'}\n${request.method} ${request.url}`;
}

async function runRequest(argv: RunOptions): Promise<void> {
  const workspaceRoot = resolveWorkspaceRoot(argv.workspace);

  // Resolve file path
  let filePath = argv.file;
  if (!isAbsolute(filePath)) {
    filePath = resolve(process.cwd(), filePath);
  }

  // Check file exists
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  // Read and parse file
  const content = await Bun.file(filePath).text();
  const requests = parse(content);

  if (requests.length === 0) {
    console.error('No valid requests found in file');
    process.exit(1);
  }

  // Select request
  let selectedIndex = 0;
  let selectedRequest = requests[0];

  if (argv.name !== undefined && argv.index !== undefined) {
    console.error('Cannot specify both --name and --index');
    process.exit(1);
  }

  if (argv.name !== undefined) {
    const found = requests.findIndex((r) => r.name === argv.name);
    if (found === -1) {
      console.error(`No request found with name "${argv.name}"`);
      console.error('Available requests:');
      requests.forEach((r, i) => {
        console.error(`  [${i}] ${r.name ?? '(unnamed)'}: ${r.method} ${r.url}`);
      });
      process.exit(1);
    }
    selectedIndex = found;
    selectedRequest = requests[found];
  } else if (argv.index !== undefined) {
    if (argv.index < 0 || argv.index >= requests.length) {
      console.error(`Request index ${argv.index} out of range (0-${requests.length - 1})`);
      process.exit(1);
    }
    selectedIndex = argv.index;
    selectedRequest = requests[argv.index];
  }

  if (!selectedRequest) {
    console.error('No request selected');
    process.exit(1);
  }

  // Load variables
  let variables: Record<string, unknown> = {};

  // Load environment if specified
  if (argv.env) {
    const envVars = await loadEnvironment(argv.env, workspaceRoot);
    variables = { ...envVars };
  }

  // Add CLI variables (override env)
  const cliVars = parseVariables(argv.var);
  variables = { ...variables, ...cliVars };

  // Create engine with cookie store
  const cookieJar = createCookieJar();
  const cookieStore = createCookieStoreFromJar(cookieJar);

  const engine = createEngine({
    cookieStore,
    onEvent: argv.verbose
      ? (event) => {
          console.error(`[${event.type}]`, JSON.stringify(event, null, 2));
        }
      : undefined
  });

  // Show request info
  if (argv.verbose) {
    console.error('---');
    console.error(
      formatVerboseRequestLine(selectedIndex, {
        name: selectedRequest.name,
        method: selectedRequest.method,
        url: selectedRequest.url
      })
    );
    console.error('---');
  }

  // Execute
  const basePath = dirname(filePath);

  try {
    const startTime = Date.now();
    const response = await engine.runString(selectedRequest.raw, {
      variables,
      basePath,
      timeoutMs: argv.timeout
    });
    const endTime = Date.now();

    // Cast to FetchResponse for Bun type compatibility
    const fetchResponse = response as unknown as FetchResponse;

    // Output response
    console.log(`HTTP/${fetchResponse.status} ${fetchResponse.statusText}`);
    console.log(formatHeaders(fetchResponse.headers));
    console.log('');

    // Output body
    const contentType = fetchResponse.headers.get('content-type') ?? '';
    const body = await fetchResponse.text();

    if (body) {
      console.log(formatResponseBody(contentType, body));
    }

    if (argv.verbose) {
      console.error('---');
      console.error(`Duration: ${endTime - startTime}ms`);
    }
  } catch (err) {
    console.error('Request failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
