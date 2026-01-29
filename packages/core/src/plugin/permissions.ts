import type {
  EnterpriseContext,
  PluginContext,
  PluginPermission,
  ResolvedPluginConfig,
  TreqPlugin
} from './types';

// ============================================================================
// Permission Error
// ============================================================================

/**
 * Error thrown when a plugin tries to access a capability without permission.
 */
export class PermissionDeniedError extends Error {
  constructor(
    public readonly permission: PluginPermission,
    public readonly pluginName: string
  ) {
    super(`Plugin "${pluginName}" does not have "${permission}" permission`);
    this.name = 'PermissionDeniedError';
  }
}

// ============================================================================
// Secrets API
// ============================================================================

/**
 * Simple in-memory secrets store.
 * In production, this would be replaced with Vault, SSM, etc.
 */
class SecretsApi {
  private secrets = new Map<string, string>();

  constructor(initialSecrets?: Record<string, string>) {
    if (initialSecrets) {
      for (const [key, value] of Object.entries(initialSecrets)) {
        this.secrets.set(key, value);
      }
    }
  }

  async get(key: string): Promise<string | undefined> {
    return this.secrets.get(key);
  }

  set(key: string, value: string): void {
    this.secrets.set(key, value);
  }
}

// ============================================================================
// File System API
// ============================================================================

/**
 * Simple file system API.
 */
interface FileSystemApi {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
}

/**
 * Create a file system API that respects project boundaries.
 */
function createFileSystemApi(projectRoot: string, allowOutsideProject: boolean): FileSystemApi {
  // Dynamic require to avoid bundling issues
  const fsPromises = require('node:fs/promises') as typeof import('node:fs/promises');
  const pathModule = require('node:path') as typeof import('node:path');

  const validatePath = (filePath: string): string => {
    const resolved = pathModule.resolve(projectRoot, filePath);

    if (!allowOutsideProject && !resolved.startsWith(projectRoot)) {
      throw new Error(
        `Path "${filePath}" is outside project root. ` +
          `Plugins need "filesystem" permission to access files outside project.`
      );
    }

    return resolved;
  };

  return {
    async readFile(filePath: string): Promise<string> {
      const resolved = validatePath(filePath);
      return await fsPromises.readFile(resolved, 'utf-8');
    },

    async writeFile(filePath: string, content: string): Promise<void> {
      const resolved = validatePath(filePath);
      await fsPromises.writeFile(resolved, content, 'utf-8');
    }
  };
}

// ============================================================================
// Spawn API
// ============================================================================

/**
 * Spawn API for subprocess execution.
 */
interface SpawnResult {
  stdout: string;
  stderr: string;
}

type SpawnFn = (command: string, args: string[]) => Promise<SpawnResult>;

/**
 * Create a spawn function.
 */
function createSpawnApi(projectRoot: string): SpawnFn {
  const childProcess = require('node:child_process') as typeof import('node:child_process');

  return async (command: string, args: string[]): Promise<SpawnResult> => {
    return new Promise((resolve, reject) => {
      const child = childProcess.spawn(command, args, {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString('utf-8');
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf-8');
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (err: Error) => {
        reject(err);
      });
    });
  };
}

// ============================================================================
// Logger
// ============================================================================

/**
 * Create a logger for a plugin.
 */
function createLogger(pluginName: string) {
  const prefix = `[plugin:${pluginName}]`;

  return {
    debug: (message: string) => {
      if (process.env['DEBUG']) {
        console.debug(`${prefix} ${message}`);
      }
    },
    info: (message: string) => {
      console.info(`${prefix} ${message}`);
    },
    warn: (message: string) => {
      console.warn(`${prefix} ${message}`);
    },
    error: (message: string) => {
      console.error(`${prefix} ${message}`);
    }
  };
}

// ============================================================================
// Create Restricted Context
// ============================================================================

export interface CreateRestrictedContextOptions {
  plugin: TreqPlugin;
  permissions: PluginPermission[];
  config: ResolvedPluginConfig;
  enterprise?: EnterpriseContext;
  secrets?: Record<string, string>;
}

/**
 * Create a restricted context for a plugin based on its permissions.
 */
export function createRestrictedContext(options: CreateRestrictedContextOptions): PluginContext {
  const { plugin, permissions, config, enterprise, secrets } = options;
  const pluginName = plugin.name;

  const context: PluginContext = {
    projectRoot: config.projectRoot,
    config,
    log: createLogger(pluginName)
  };

  // Secrets API
  if (permissions.includes('secrets')) {
    context.secrets = new SecretsApi(secrets);
  }

  // Network (fetch)
  if (permissions.includes('network')) {
    context.fetch = globalThis.fetch;
  }

  // File system
  if (permissions.includes('filesystem')) {
    context.fs = createFileSystemApi(
      config.projectRoot,
      config.security.allowPluginsOutsideProject
    );
  }

  // Environment variables
  if (permissions.includes('env')) {
    context.env = process.env as Record<string, string | undefined>;
  }

  // Subprocess
  if (permissions.includes('subprocess')) {
    context.spawn = createSpawnApi(config.projectRoot);
  }

  // Enterprise context
  if (permissions.includes('enterprise') && enterprise) {
    context.enterprise = enterprise;
  }

  return context;
}

// ============================================================================
// Validate Permissions
// ============================================================================

/**
 * Validate that a plugin has the required permissions.
 */
export function validatePermissions(
  plugin: TreqPlugin,
  grantedPermissions: PluginPermission[],
  requiredPermissions: PluginPermission[]
): string[] {
  const warnings: string[] = [];

  for (const perm of requiredPermissions) {
    if (!grantedPermissions.includes(perm)) {
      warnings.push(`Plugin "${plugin.name}" requires "${perm}" permission but it was denied.`);
    }
  }

  return warnings;
}

// ============================================================================
// Check Permission
// ============================================================================

/**
 * Check if a plugin has a specific permission.
 */
export function hasPermission(
  grantedPermissions: PluginPermission[],
  permission: PluginPermission
): boolean {
  return grantedPermissions.includes(permission);
}

/**
 * Assert that a plugin has a specific permission.
 */
export function assertPermission(
  grantedPermissions: PluginPermission[],
  permission: PluginPermission,
  pluginName: string
): void {
  if (!hasPermission(grantedPermissions, permission)) {
    throw new PermissionDeniedError(permission, pluginName);
  }
}
