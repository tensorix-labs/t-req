import type {
  LoadedPlugin,
  PluginConfigRef,
  PluginPermission,
  PluginPermissionsConfig,
  SubprocessPluginConfig,
  TreqPlugin
} from './types';

// ============================================================================
// Constants
// ============================================================================

const FILE_PROTOCOL = 'file://';

// ============================================================================
// Plugin Identification
// ============================================================================

/**
 * Get the unique identifier for a plugin: name#instanceId
 */
export function getPluginId(plugin: TreqPlugin): string {
  return `${plugin.name}#${plugin.instanceId ?? 'default'}`;
}

/**
 * Parse a plugin ID into name and instanceId.
 */
export function parsePluginId(id: string): { name: string; instanceId: string } {
  const hashIndex = id.indexOf('#');
  if (hashIndex === -1) {
    return { name: id, instanceId: 'default' };
  }
  return {
    name: id.slice(0, hashIndex),
    instanceId: id.slice(hashIndex + 1)
  };
}

// ============================================================================
// Plugin Type Guards
// ============================================================================

/**
 * Check if a config ref is a subprocess plugin config.
 */
export function isSubprocessPluginConfig(ref: PluginConfigRef): ref is SubprocessPluginConfig {
  return (
    typeof ref === 'object' &&
    ref !== null &&
    !Array.isArray(ref) &&
    'command' in ref &&
    Array.isArray((ref as SubprocessPluginConfig).command)
  );
}

/**
 * Check if a config ref is an inline plugin.
 */
export function isInlinePlugin(ref: PluginConfigRef): ref is TreqPlugin {
  return (
    typeof ref === 'object' &&
    ref !== null &&
    !Array.isArray(ref) &&
    'name' in ref &&
    typeof (ref as TreqPlugin).name === 'string' &&
    !('command' in ref)
  );
}

/**
 * Check if a config ref is a file:// path.
 */
export function isFilePlugin(ref: PluginConfigRef): boolean {
  if (typeof ref === 'string') {
    return ref.startsWith(FILE_PROTOCOL);
  }
  if (Array.isArray(ref) && typeof ref[0] === 'string') {
    return ref[0].startsWith(FILE_PROTOCOL);
  }
  return false;
}

/**
 * Check if a config ref is an npm package.
 */
export function isNpmPlugin(ref: PluginConfigRef): boolean {
  if (typeof ref === 'string') {
    return !ref.startsWith(FILE_PROTOCOL) && !isSubprocessPluginConfig(ref as PluginConfigRef);
  }
  if (Array.isArray(ref) && typeof ref[0] === 'string') {
    return !ref[0].startsWith(FILE_PROTOCOL);
  }
  return false;
}

// ============================================================================
// Path Resolution
// ============================================================================

function isPathWithinRoot(resolved: string, projectRoot: string): boolean {
  const pathModule = require('node:path') as typeof import('node:path');
  const relative = pathModule.relative(projectRoot, resolved);
  // If the relative path starts with '..' or is an absolute path, it's outside
  return !relative.startsWith('..') && !pathModule.isAbsolute(relative);
}

export function resolveFilePath(
  fileUrl: string,
  projectRoot: string,
  allowOutsideProject: boolean
): string {
  if (!fileUrl.startsWith(FILE_PROTOCOL)) {
    throw new Error(`Invalid file URL: ${fileUrl}`);
  }

  const pathModule = require('node:path') as typeof import('node:path');
  const path = fileUrl.slice(FILE_PROTOCOL.length);
  let resolved: string;

  // Absolute path (starts with /)
  if (path.startsWith('/')) {
    resolved = pathModule.normalize(path);
  } else if (path.startsWith('./') || path.startsWith('../')) {
    // Relative path - join with project root
    resolved = pathModule.resolve(projectRoot, path);
  } else {
    throw new Error(
      `Invalid file plugin path: ${fileUrl}. ` +
        `Use file://./relative/path.ts or file:///absolute/path.ts`
    );
  }

  // Check if path is within project root
  if (!allowOutsideProject && !isPathWithinRoot(resolved, projectRoot)) {
    throw new Error(
      `Plugin path "${fileUrl}" resolves outside project root. ` +
        `Set security.allowPluginsOutsideProject: true to allow.`
    );
  }

  return resolved;
}

/**
 * Resolve and validate a file path, following symlinks.
 * This is called after the initial path resolution to verify the real path.
 */
export async function resolveAndValidateFilePath(
  filePath: string,
  projectRoot: string,
  allowOutsideProject: boolean
): Promise<string> {
  const fsPromises = require('node:fs/promises') as typeof import('node:fs/promises');

  if (allowOutsideProject) {
    return filePath;
  }

  try {
    // Resolve symlinks to get the real path
    const realPath = await fsPromises.realpath(filePath);

    // Verify the real path is still within project root
    if (!isPathWithinRoot(realPath, projectRoot)) {
      throw new Error(
        `Plugin path "${filePath}" resolves to "${realPath}" which is outside project root. ` +
          `Symlinks pointing outside the project are not allowed. ` +
          `Set security.allowPluginsOutsideProject: true to allow.`
      );
    }

    return realPath;
  } catch (err) {
    // If the file doesn't exist, we can't resolve symlinks
    // The import will fail with a more appropriate error
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return filePath;
    }
    throw err;
  }
}

// ============================================================================
// Permission Resolution
// ============================================================================

/**
 * Resolve permissions for a plugin.
 */
export function resolvePermissions(
  plugin: TreqPlugin,
  permissionsConfig: PluginPermissionsConfig | undefined,
  warnings: string[]
): PluginPermission[] {
  // Get declared permissions
  const declared = plugin.permissions ?? [];

  // Check for explicit per-plugin config
  const pluginConfig = permissionsConfig?.[plugin.name];
  if (pluginConfig !== undefined) {
    // Check if declared permissions are being denied
    for (const perm of declared) {
      if (!pluginConfig.includes(perm)) {
        warnings.push(
          `Plugin '${plugin.name}' requires '${perm}' permission but it was denied. ` +
            `Some features may not work. Add to security.pluginPermissions to enable.`
        );
      }
    }
    return pluginConfig;
  }

  // Check for default config
  const defaultConfig = permissionsConfig?.['default'];
  if (defaultConfig !== undefined) {
    // Intersect declared with default allowed
    const allowed = declared.filter((p) => defaultConfig.includes(p));
    for (const perm of declared) {
      if (!defaultConfig.includes(perm)) {
        warnings.push(
          `Plugin '${plugin.name}' requires '${perm}' permission but it was denied by default. ` +
            `Some features may not work. Add to security.pluginPermissions to enable.`
        );
      }
    }
    return allowed;
  }

  // No restrictions, grant all declared permissions
  return declared;
}

// ============================================================================
// Plugin Loading
// ============================================================================

export interface LoadPluginsOptions {
  /** Project root directory */
  projectRoot: string;
  /** Plugin configuration references */
  plugins: PluginConfigRef[];
  /** Security settings */
  security?: {
    allowPluginsOutsideProject?: boolean;
  };
  /** Permission configuration */
  pluginPermissions?: PluginPermissionsConfig;
  /** Warning collector */
  warnings?: string[];
}

export interface LoadPluginsResult {
  /** Loaded plugins in order */
  plugins: LoadedPlugin[];
  /** Warnings generated during loading */
  warnings: string[];
}

/**
 * Load plugins from configuration.
 * Handles npm packages, file:// URLs, inline plugins, and subprocess plugins.
 */
export async function loadPlugins(options: LoadPluginsOptions): Promise<LoadPluginsResult> {
  const { projectRoot, plugins: pluginRefs, security, pluginPermissions } = options;

  const warnings = options.warnings ?? [];
  const loadedPlugins: LoadedPlugin[] = [];
  const seenIds = new Map<string, number>(); // id -> index for deduplication

  for (const ref of pluginRefs) {
    try {
      const loaded = await loadPluginRef(ref, {
        projectRoot,
        allowOutsideProject: security?.allowPluginsOutsideProject ?? false,
        warnings,
        ...(pluginPermissions !== undefined ? { pluginPermissions } : {})
      });

      if (!loaded) continue;

      const id = getPluginId(loaded.plugin);

      // Check for duplicate (same name#instanceId)
      const existingIndex = seenIds.get(id);
      if (existingIndex !== undefined) {
        // Later definition overrides earlier one
        loadedPlugins[existingIndex] = loaded;
      } else {
        seenIds.set(id, loadedPlugins.length);
        loadedPlugins.push(loaded);
      }
    } catch (err) {
      // Graceful degradation: log warning and continue
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to load plugin: ${message}`);
    }
  }

  return { plugins: loadedPlugins, warnings };
}

interface LoadPluginRefOptions {
  projectRoot: string;
  allowOutsideProject: boolean;
  pluginPermissions?: PluginPermissionsConfig;
  warnings: string[];
}

/**
 * Load a single plugin reference.
 */
async function loadPluginRef(
  ref: PluginConfigRef,
  options: LoadPluginRefOptions
): Promise<LoadedPlugin | null> {
  const { projectRoot, allowOutsideProject, pluginPermissions, warnings } = options;

  // Handle inline plugin
  if (isInlinePlugin(ref)) {
    const permissions = resolvePermissions(ref, pluginPermissions, warnings);
    return {
      plugin: { ...ref, instanceId: ref.instanceId ?? 'default' },
      id: getPluginId(ref),
      source: 'inline',
      permissions,
      initialized: false
    };
  }

  // Handle subprocess plugin (will be handled by subprocess.ts)
  if (isSubprocessPluginConfig(ref)) {
    // Return a placeholder - actual loading happens in subprocess.ts
    return {
      plugin: {
        name: `subprocess:${ref.command.join(' ')}`,
        instanceId: 'default'
      },
      id: `subprocess:${ref.command.join(' ')}#default`,
      source: 'subprocess',
      permissions: [],
      initialized: false,
      // @ts-expect-error - Store subprocess config for later
      _subprocessConfig: ref
    };
  }

  // Handle tuple format: [package, options]
  let packageName: string;
  let pluginOptions: Record<string, unknown> | undefined;

  if (Array.isArray(ref)) {
    packageName = ref[0];
    pluginOptions = ref[1];
  } else {
    packageName = ref as string;
  }

  // Handle file:// protocol
  if (packageName.startsWith(FILE_PROTOCOL)) {
    const filePath = resolveFilePath(packageName, projectRoot, allowOutsideProject);
    return await loadFilePlugin(
      filePath,
      pluginOptions,
      pluginPermissions,
      warnings,
      projectRoot,
      allowOutsideProject
    );
  }

  // Handle npm package
  return await loadNpmPlugin(packageName, projectRoot, pluginOptions, pluginPermissions, warnings);
}

/**
 * Load a plugin from a file path.
 */
async function loadFilePlugin(
  filePath: string,
  options: Record<string, unknown> | undefined,
  pluginPermissions: PluginPermissionsConfig | undefined,
  warnings: string[],
  projectRoot?: string,
  allowOutsideProject?: boolean
): Promise<LoadedPlugin | null> {
  try {
    // Validate symlinks before import (if project root is provided)
    let validatedPath = filePath;
    if (projectRoot !== undefined) {
      validatedPath = await resolveAndValidateFilePath(
        filePath,
        projectRoot,
        allowOutsideProject ?? false
      );
    }

    // Dynamic import
    const module = await import(validatedPath);
    const pluginOrFactory = module.default ?? module;

    let plugin: TreqPlugin;

    if (typeof pluginOrFactory === 'function') {
      // Factory function
      plugin = options ? pluginOrFactory(options) : pluginOrFactory();
    } else if (typeof pluginOrFactory === 'object' && pluginOrFactory !== null) {
      // Direct plugin export
      plugin = pluginOrFactory as TreqPlugin;
    } else {
      throw new Error(`File "${filePath}" does not export a valid plugin`);
    }

    // Ensure instanceId is set
    plugin = { ...plugin, instanceId: plugin.instanceId ?? 'default' };

    // Handle factory options for instanceId
    if (options && typeof options['instanceId'] === 'string') {
      plugin = { ...plugin, instanceId: options['instanceId'] };
    }

    const permissions = resolvePermissions(plugin, pluginPermissions, warnings);

    return {
      plugin,
      id: getPluginId(plugin),
      source: 'file',
      permissions,
      initialized: false
    };
  } catch (err) {
    throw new Error(
      `Failed to load plugin from "${filePath}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Load a plugin from an npm package.
 */
async function loadNpmPlugin(
  packageName: string,
  projectRoot: string,
  options: Record<string, unknown> | undefined,
  pluginPermissions: PluginPermissionsConfig | undefined,
  warnings: string[]
): Promise<LoadedPlugin | null> {
  try {
    // Parse package name and version
    let name = packageName;

    // Handle @scope/package@version format
    const atIndex = packageName.lastIndexOf('@');
    if (atIndex > 0) {
      name = packageName.slice(0, atIndex);
      // version is packageName.slice(atIndex + 1) - not used but parsed
    }

    // Resolve from the project root so plugins installed as
    // dependencies of the CLI (or the user's project) are found,
    // regardless of package manager isolation strategy.
    const pathModule = require('node:path') as typeof import('node:path');
    const { createRequire } = require('node:module') as typeof import('node:module');
    const projectRequire = createRequire(pathModule.join(projectRoot, 'package.json'));
    const resolved = projectRequire.resolve(name);
    const module = await import(resolved);
    const pluginOrFactory = module.default ?? module;

    let plugin: TreqPlugin;

    if (typeof pluginOrFactory === 'function') {
      // Factory function
      plugin = options ? pluginOrFactory(options) : pluginOrFactory();
    } else if (typeof pluginOrFactory === 'object' && pluginOrFactory !== null) {
      // Direct plugin export
      plugin = pluginOrFactory as TreqPlugin;
    } else {
      throw new Error(`Package "${name}" does not export a valid plugin`);
    }

    // Ensure instanceId is set
    plugin = { ...plugin, instanceId: plugin.instanceId ?? 'default' };

    // Handle factory options for instanceId
    if (options && typeof options['instanceId'] === 'string') {
      plugin = { ...plugin, instanceId: options['instanceId'] };
    }

    const permissions = resolvePermissions(plugin, pluginPermissions, warnings);

    return {
      plugin,
      id: getPluginId(plugin),
      source: 'npm',
      permissions,
      initialized: false
    };
  } catch (err) {
    throw new Error(
      `Failed to load plugin "${packageName}" from project "${projectRoot}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

// ============================================================================
// Plugin Deduplication
// ============================================================================

/**
 * Merge plugin arrays with deduplication by name#instanceId.
 * Later definitions override earlier ones.
 */
export function mergePluginRefs(
  base: PluginConfigRef[],
  overlay: PluginConfigRef[]
): PluginConfigRef[] {
  // Since plugins are identified at load time, we just concatenate
  // The loadPlugins function handles deduplication
  return [...base, ...overlay];
}
