import { createEngine, parseDocument } from '@t-req/core';
import {
  buildEngineOptions,
  type ConfigOverrideLayer,
  DEFAULT_TIMEOUT_MS,
  resolveProjectConfig
} from '@t-req/core/config';
import { createCookieJar } from '@t-req/core/cookies';
import {
  cookieJarToData,
  loadCookieJarData,
  saveCookieJarData
} from '@t-req/core/cookies/persistence';
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
  profile?: string;
  env?: string;
  var?: string[];
  timeout?: number;
  workspace?: string;
  verbose?: boolean;
  json?: boolean;
  noPlugins?: boolean;
  plugin?: string[];
}

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
    profile: {
      type: 'string',
      describe: 'Config profile to use',
      alias: 'p'
    },
    env: {
      type: 'string',
      describe: 'Environment to load from environments/<env>.ts',
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
      alias: 't'
      // NOTE: No default here - config timeout wins if not specified
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
    },
    json: {
      type: 'boolean',
      describe: 'Output response as JSON (includes plugin info)',
      default: false
    },
    'no-plugins': {
      type: 'boolean',
      describe: 'Disable plugin loading',
      default: false
    },
    plugin: {
      type: 'array',
      string: true,
      describe: 'Load additional plugins (npm package or file:// path)',
      alias: 'P'
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

  // Build overrides from --env and --var
  let envVariables: Record<string, unknown> = {};
  if (argv.env) {
    envVariables = await loadEnvironment(argv.env, workspaceRoot);
  }
  const cliVars = parseVariables(argv.var);

  const overrideLayers: ConfigOverrideLayer[] = [];

  if (argv.env && Object.keys(envVariables).length > 0) {
    overrideLayers.push({
      name: `env:${argv.env}`,
      overrides: { variables: envVariables }
    });
  }

  if (Object.keys(cliVars).length > 0) {
    overrideLayers.push({
      name: 'cli',
      overrides: { variables: cliVars }
    });
  }

  // Build plugin overrides from CLI flags
  const pluginOverrides: { plugins?: string[] } = {};
  if (argv.noPlugins) {
    // Disable all plugins by setting empty array
    pluginOverrides.plugins = [];
  } else if (argv.plugin && argv.plugin.length > 0) {
    // Add CLI-specified plugins
    pluginOverrides.plugins = argv.plugin;
  }

  if (pluginOverrides.plugins !== undefined) {
    overrideLayers.push({
      name: 'cli-plugins',
      overrides: pluginOverrides
    });
  }

  // Resolve project config
  const { config, meta } = await resolveProjectConfig({
    startDir: dirname(filePath),
    stopDir: workspaceRoot,
    profile: argv.profile,
    overrideLayers
  });

  // Log any warnings from config resolution
  for (const warning of meta.warnings) {
    console.error(`Warning: ${warning}`);
  }

  if (argv.verbose && meta.configPath) {
    console.error(`Config: ${meta.configPath}`);
    console.error(`Profile: ${meta.profile ?? '(none)'}`);
    console.error(`Layers: ${meta.layersApplied.join(' < ')}`);
  }

  // Show plugin info in verbose mode
  if (argv.verbose && config.pluginManager) {
    const pluginInfo = config.pluginManager.getPluginInfo();
    if (pluginInfo.length > 0) {
      console.error('Plugins loaded:');
      for (const plugin of pluginInfo) {
        const perms =
          plugin.permissions.length > 0 ? ` [permissions: ${plugin.permissions.join(', ')}]` : '';
        console.error(
          `  ✓ ${plugin.name}${plugin.version ? `@${plugin.version}` : ''} (${plugin.source})${perms}`
        );
      }
    }
  }

  // Read and parse file
  const content = await Bun.file(filePath).text();
  const { requests, fileVariables } = parseDocument(content);

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

  // Create cookie jar (with persistence if configured)
  const cookieJar = createCookieJar();

  // Load persistent cookies if configured
  if (config.cookies.mode === 'persistent' && config.cookies.jarPath) {
    const jarPath = resolve(config.projectRoot, config.cookies.jarPath);
    const jarData = loadCookieJarData(jarPath);
    if (jarData) {
      // Restore cookies to jar
      for (const cookie of jarData.cookies) {
        try {
          const cookieStr = `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}`;
          cookieJar.setCookieSync(cookieStr, `https://${cookie.domain}${cookie.path}`);
        } catch {
          // Ignore invalid cookies
        }
      }
    }
  }

  const cookieStore = createCookieStoreFromJar(cookieJar);

  // Build engine options using centralized helper
  const { engineOptions, requestDefaults } = buildEngineOptions({
    config,
    cookieStore,
    onEvent: argv.verbose
      ? (event) => {
          console.error(`[${event.type}]`, JSON.stringify(event, null, 2));
        }
      : undefined
  });

  const engine = createEngine(engineOptions);

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

  // Determine timeout: CLI flag wins, then config default
  const timeoutMs = argv.timeout ?? requestDefaults.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const startTime = Date.now();
    const response = await engine.runString(selectedRequest.raw, {
      variables: { ...fileVariables, ...config.variables },
      basePath,
      timeoutMs,
      followRedirects: requestDefaults.followRedirects,
      validateSSL: requestDefaults.validateSSL,
      proxy: requestDefaults.proxy
    });
    const endTime = Date.now();

    // Save persistent cookies if configured
    if (config.cookies.mode === 'persistent' && config.cookies.jarPath) {
      const jarPath = resolve(config.projectRoot, config.cookies.jarPath);
      const jarData = cookieJarToData(cookieJar);
      saveCookieJarData(jarPath, jarData);
    }

    // Cast to FetchResponse for Bun type compatibility
    const fetchResponse = response as unknown as FetchResponse;
    const contentType = fetchResponse.headers.get('content-type') ?? '';
    const body = await fetchResponse.text();

    // JSON output mode
    if (argv.json) {
      // Collect headers as array
      const headers: Array<{ name: string; value: string }> = [];
      fetchResponse.headers.forEach((value, name) => {
        headers.push({ name, value });
      });

      // Collect plugin info if available
      const plugins = config.pluginManager
        ? config.pluginManager.getPluginInfo().map((p) => ({
            name: p.name,
            version: p.version,
            source: p.source,
            permissions: p.permissions
          }))
        : [];

      // Collect plugin reports
      const reports = config.pluginManager?.getReports() ?? [];

      // Build JSON output
      const jsonOutput = {
        request: {
          index: selectedIndex,
          name: selectedRequest.name,
          method: selectedRequest.method,
          url: selectedRequest.url
        },
        response: {
          status: fetchResponse.status,
          statusText: fetchResponse.statusText,
          headers,
          body: contentType.includes('application/json')
            ? (() => {
                try {
                  return JSON.parse(body);
                } catch {
                  return body;
                }
              })()
            : body
        },
        timing: {
          startTime,
          endTime,
          durationMs: endTime - startTime
        },
        plugins,
        ...(reports.length > 0 ? { reports } : {})
      };

      console.log(JSON.stringify(jsonOutput, null, 2));

      // Exit 1 if any report signals failure
      if (reports.some((r) => (r.data as Record<string, unknown>).passed === false)) {
        process.exit(1);
      }
    } else {
      // Standard text output
      console.log(`HTTP/${fetchResponse.status} ${fetchResponse.statusText}`);
      console.log(formatHeaders(fetchResponse.headers));
      console.log('');

      if (body) {
        console.log(formatResponseBody(contentType, body));
      }

      // Render plugin reports using duck-typed conventions
      const reports = config.pluginManager?.getReports() ?? [];
      for (const report of reports) {
        const d = report.data as Record<string, unknown>;
        const hasSummary = typeof d.summary === 'string';
        const hasDetails = Array.isArray(d.details);

        if (!hasSummary && !hasDetails) continue;

        console.log('');
        console.log(`── ${report.pluginName} ──`);

        if (hasSummary) {
          console.log(d.summary as string);
        }

        if (hasDetails) {
          for (const line of d.details as unknown[]) {
            if (typeof line === 'string') console.log(line);
          }
        }
      }

      if (argv.verbose) {
        console.error('---');
        console.error(`Duration: ${endTime - startTime}ms`);
      }

      // Exit 1 if any report signals failure
      if (reports.some((r) => (r.data as Record<string, unknown>).passed === false)) {
        process.exit(1);
      }
    }
  } catch (err) {
    console.error('Request failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// Re-export for backward compatibility
export { DEFAULT_TIMEOUT_MS };
