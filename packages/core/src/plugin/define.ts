import { type ZodRawShape, z } from 'zod';
import type { ToolContext, ToolDefinition, TreqPlugin } from './types';

// ============================================================================
// definePlugin Helper
// ============================================================================

/**
 * Helper to define a plugin with type safety.
 * Validates plugin structure and provides helpful error messages.
 *
 * @example
 * ```typescript
 * const myPlugin = definePlugin({
 *   name: 'my-plugin',
 *   version: '1.0.0',
 *   hooks: {
 *     async "request.before"(input, output) {
 *       output.request.headers['X-Custom'] = 'value';
 *     }
 *   }
 * });
 * ```
 */
export function definePlugin(plugin: TreqPlugin): TreqPlugin {
  // Validate required fields
  if (!plugin.name) {
    throw new Error('Plugin must have a name');
  }

  if (typeof plugin.name !== 'string' || plugin.name.trim() === '') {
    throw new Error('Plugin name must be a non-empty string');
  }

  // Validate instanceId if provided
  if (plugin.instanceId !== undefined && typeof plugin.instanceId !== 'string') {
    throw new Error('Plugin instanceId must be a string');
  }

  // Validate version if provided
  if (plugin.version !== undefined && typeof plugin.version !== 'string') {
    throw new Error('Plugin version must be a string');
  }

  // Validate permissions if provided
  if (plugin.permissions !== undefined) {
    if (!Array.isArray(plugin.permissions)) {
      throw new Error('Plugin permissions must be an array');
    }
    const validPermissions = [
      'secrets',
      'network',
      'filesystem',
      'env',
      'subprocess',
      'enterprise'
    ];
    for (const perm of plugin.permissions) {
      if (!validPermissions.includes(perm)) {
        throw new Error(
          `Invalid permission: ${perm}. Valid permissions are: ${validPermissions.join(', ')}`
        );
      }
    }
  }

  // Validate resolvers if provided
  if (plugin.resolvers !== undefined) {
    if (typeof plugin.resolvers !== 'object' || plugin.resolvers === null) {
      throw new Error('Plugin resolvers must be an object');
    }
    for (const [name, resolver] of Object.entries(plugin.resolvers)) {
      if (!name.startsWith('$')) {
        throw new Error(`Resolver name "${name}" must start with $ (e.g., "$${name}")`);
      }
      if (typeof resolver !== 'function') {
        throw new Error(`Resolver "${name}" must be a function`);
      }
    }
  }

  // Validate hooks if provided
  if (plugin.hooks !== undefined) {
    if (typeof plugin.hooks !== 'object' || plugin.hooks === null) {
      throw new Error('Plugin hooks must be an object');
    }
    const validHooks = [
      'parse.after',
      'request.before',
      'request.compiled',
      'request.after',
      'response.after',
      'error'
    ];
    for (const [name, hook] of Object.entries(plugin.hooks)) {
      if (!validHooks.includes(name)) {
        throw new Error(`Invalid hook: "${name}". Valid hooks are: ${validHooks.join(', ')}`);
      }
      if (typeof hook !== 'function') {
        throw new Error(`Hook "${name}" must be a function`);
      }
    }
  }

  // Validate commands if provided
  if (plugin.commands !== undefined) {
    if (typeof plugin.commands !== 'object' || plugin.commands === null) {
      throw new Error('Plugin commands must be an object');
    }
    for (const [name, handler] of Object.entries(plugin.commands)) {
      if (typeof handler !== 'function') {
        throw new Error(`Command "${name}" must be a function`);
      }
    }
  }

  // Validate middleware if provided
  if (plugin.middleware !== undefined) {
    if (!Array.isArray(plugin.middleware)) {
      throw new Error('Plugin middleware must be an array');
    }
    for (let i = 0; i < plugin.middleware.length; i++) {
      if (typeof plugin.middleware[i] !== 'function') {
        throw new Error(`Middleware at index ${i} must be a function`);
      }
    }
  }

  // Validate tools if provided
  if (plugin.tools !== undefined) {
    if (typeof plugin.tools !== 'object' || plugin.tools === null) {
      throw new Error('Plugin tools must be an object');
    }
    for (const [name, toolDef] of Object.entries(plugin.tools)) {
      if (typeof toolDef.description !== 'string') {
        throw new Error(`Tool "${name}" must have a description`);
      }
      if (typeof toolDef.args !== 'object' || toolDef.args === null) {
        throw new Error(`Tool "${name}" must have args schema`);
      }
      if (typeof toolDef.execute !== 'function') {
        throw new Error(`Tool "${name}" must have an execute function`);
      }
    }
  }

  // Validate event handler if provided
  if (plugin.event !== undefined && typeof plugin.event !== 'function') {
    throw new Error('Plugin event handler must be a function');
  }

  // Validate setup if provided
  if (plugin.setup !== undefined && typeof plugin.setup !== 'function') {
    throw new Error('Plugin setup must be a function');
  }

  // Validate teardown if provided
  if (plugin.teardown !== undefined && typeof plugin.teardown !== 'function') {
    throw new Error('Plugin teardown must be a function');
  }

  // Set default instanceId
  return {
    ...plugin,
    instanceId: plugin.instanceId ?? 'default'
  };
}

// ============================================================================
// Zod Re-export for Schema Building
// ============================================================================

/**
 * Re-export Zod's z object for schema building.
 *
 * @example
 * ```typescript
 * const hashTool = tool({
 *   description: 'Hash a value',
 *   args: {
 *     value: z.string().describe('Value to hash'),
 *     encoding: z.enum(['hex', 'base64']).default('hex'),
 *   },
 *   execute: async (args) => {
 *     // args.value is typed as string
 *     // args.encoding is typed as 'hex' | 'base64'
 *     return hashValue(args.value, args.encoding);
 *   }
 * });
 * ```
 */
export { z, z as schema };

// ============================================================================
// Tool Helper
// ============================================================================

/**
 * Helper to define a tool with Zod schema validation.
 *
 * @example
 * ```typescript
 * const hashTool = tool({
 *   description: 'Hash a value with SHA-256',
 *   args: {
 *     value: z.string().describe('Value to hash'),
 *     encoding: z.enum(['hex', 'base64']).default('hex'),
 *   },
 *   async execute(args) {
 *     // args.value is typed as string
 *     // args.encoding is typed as 'hex' | 'base64'
 *     return hashValue(args.value, args.encoding);
 *   },
 * });
 * ```
 */
export function tool<T extends ZodRawShape>(definition: {
  description: string;
  args: T;
  execute: (args: z.infer<z.ZodObject<T>>, ctx: ToolContext) => Promise<string> | string;
}): ToolDefinition<z.infer<z.ZodObject<T>>> {
  const argsSchema = z.object(definition.args);

  return {
    description: definition.description,
    args: argsSchema,
    execute: async (rawArgs, ctx) => {
      const parsed = argsSchema.parse(rawArgs);
      return await definition.execute(parsed, ctx);
    }
  };
}
