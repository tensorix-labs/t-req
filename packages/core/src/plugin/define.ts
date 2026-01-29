import type { ToolDefinition, ToolSchema, TreqPlugin } from './types';

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
// Tool Schema Builder
// ============================================================================

/**
 * Schema builder for tool arguments.
 * Provides a Zod-like API for defining argument schemas.
 */
export const schema = {
  /**
   * String schema.
   */
  string(): StringSchema {
    return new StringSchema();
  },

  /**
   * Number schema.
   */
  number(): NumberSchema {
    return new NumberSchema();
  },

  /**
   * Boolean schema.
   */
  boolean(): BooleanSchema {
    return new BooleanSchema();
  },

  /**
   * Enum schema.
   */
  enum<T extends string>(values: readonly T[]): EnumSchema<T> {
    return new EnumSchema(values);
  },

  /**
   * Array schema.
   */
  array<T>(itemSchema: ToolSchema<T>): ArraySchema<T> {
    return new ArraySchema(itemSchema);
  },

  /**
   * Object schema.
   */
  object<T extends Record<string, ToolSchema>>(shape: T): ObjectSchema<T> {
    return new ObjectSchema(shape);
  }
};

// Base schema class
abstract class BaseSchema<T> implements ToolSchema<T> {
  protected _description?: string;
  protected _default?: T;
  protected _optional = false;

  describe(description: string): this {
    this._description = description;
    return this;
  }

  default(value: T): this {
    this._default = value;
    this._optional = true;
    return this;
  }

  optional(): OptionalSchema<T> {
    return new OptionalSchema(this);
  }

  abstract parse(value: unknown): T;

  safeParse(value: unknown): { success: true; data: T } | { success: false; error: Error } {
    try {
      const data = this.parse(value);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e : new Error(String(e)) };
    }
  }

  protected handleDefault(value: unknown): unknown {
    if (value === undefined && this._default !== undefined) {
      return this._default;
    }
    return value;
  }
}

// Optional wrapper
class OptionalSchema<T> implements ToolSchema<T | undefined> {
  constructor(private inner: ToolSchema<T>) {}

  parse(value: unknown): T | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    return this.inner.parse(value);
  }

  safeParse(
    value: unknown
  ): { success: true; data: T | undefined } | { success: false; error: Error } {
    try {
      const data = this.parse(value);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e : new Error(String(e)) };
    }
  }
}

// String schema
class StringSchema extends BaseSchema<string> {
  private _minLength?: number;
  private _maxLength?: number;
  private _pattern?: RegExp;

  min(length: number): this {
    this._minLength = length;
    return this;
  }

  max(length: number): this {
    this._maxLength = length;
    return this;
  }

  regex(pattern: RegExp): this {
    this._pattern = pattern;
    return this;
  }

  parse(value: unknown): string {
    const v = this.handleDefault(value);

    if (typeof v !== 'string') {
      throw new Error(`Expected string, got ${typeof v}`);
    }

    if (this._minLength !== undefined && v.length < this._minLength) {
      throw new Error(`String must be at least ${this._minLength} characters`);
    }

    if (this._maxLength !== undefined && v.length > this._maxLength) {
      throw new Error(`String must be at most ${this._maxLength} characters`);
    }

    if (this._pattern && !this._pattern.test(v)) {
      throw new Error(`String does not match pattern ${this._pattern}`);
    }

    return v;
  }

  or<U>(other: ToolSchema<U>): UnionSchema<string, U> {
    return new UnionSchema(this, other);
  }
}

// Number schema
class NumberSchema extends BaseSchema<number> {
  private _min?: number;
  private _max?: number;
  private _integer = false;

  min(value: number): this {
    this._min = value;
    return this;
  }

  max(value: number): this {
    this._max = value;
    return this;
  }

  int(): this {
    this._integer = true;
    return this;
  }

  parse(value: unknown): number {
    const v = this.handleDefault(value);

    if (typeof v === 'string') {
      const num = Number(v);
      if (Number.isNaN(num)) {
        throw new Error(`Cannot parse "${v}" as number`);
      }
      return this.validate(num);
    }

    if (typeof v !== 'number' || Number.isNaN(v)) {
      throw new Error(`Expected number, got ${typeof v}`);
    }

    return this.validate(v);
  }

  private validate(num: number): number {
    if (this._integer && !Number.isInteger(num)) {
      throw new Error(`Expected integer, got ${num}`);
    }

    if (this._min !== undefined && num < this._min) {
      throw new Error(`Number must be at least ${this._min}`);
    }

    if (this._max !== undefined && num > this._max) {
      throw new Error(`Number must be at most ${this._max}`);
    }

    return num;
  }

  or<U>(other: ToolSchema<U>): UnionSchema<number, U> {
    return new UnionSchema(this, other);
  }
}

// Boolean schema
class BooleanSchema extends BaseSchema<boolean> {
  parse(value: unknown): boolean {
    const v = this.handleDefault(value);

    if (typeof v === 'boolean') {
      return v;
    }

    if (v === 'true') return true;
    if (v === 'false') return false;

    throw new Error(`Expected boolean, got ${typeof v}`);
  }
}

// Enum schema
class EnumSchema<T extends string> extends BaseSchema<T> {
  constructor(private values: readonly T[]) {
    super();
  }

  parse(value: unknown): T {
    const v = this.handleDefault(value);

    if (typeof v !== 'string') {
      throw new Error(`Expected string, got ${typeof v}`);
    }

    if (!this.values.includes(v as T)) {
      throw new Error(`Expected one of: ${this.values.join(', ')}. Got: ${v}`);
    }

    return v as T;
  }
}

// Array schema
class ArraySchema<T> extends BaseSchema<T[]> {
  constructor(private itemSchema: ToolSchema<T>) {
    super();
  }

  parse(value: unknown): T[] {
    const v = this.handleDefault(value);

    if (!Array.isArray(v)) {
      throw new Error(`Expected array, got ${typeof v}`);
    }

    return v.map((item, index) => {
      try {
        return this.itemSchema.parse(item);
      } catch (e) {
        throw new Error(
          `Array item at index ${index}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    });
  }
}

// Object schema
class ObjectSchema<T extends Record<string, ToolSchema>> extends BaseSchema<{
  [K in keyof T]: T[K] extends ToolSchema<infer U> ? U : never;
}> {
  private _passthrough = false;

  constructor(private shape: T) {
    super();
  }

  passthrough(): this {
    this._passthrough = true;
    return this;
  }

  parse(value: unknown): { [K in keyof T]: T[K] extends ToolSchema<infer U> ? U : never } {
    const v = this.handleDefault(value);

    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new Error(`Expected object, got ${typeof v}`);
    }

    const obj = v as Record<string, unknown>;
    const result: Record<string, unknown> = this._passthrough ? { ...obj } : {};

    for (const [key, fieldSchema] of Object.entries(this.shape)) {
      try {
        result[key] = fieldSchema.parse(obj[key]);
      } catch (e) {
        throw new Error(`Field "${key}": ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return result as { [K in keyof T]: T[K] extends ToolSchema<infer U> ? U : never };
  }
}

// Union schema
class UnionSchema<T, U> implements ToolSchema<T | U> {
  constructor(
    private left: ToolSchema<T>,
    private right: ToolSchema<U>
  ) {}

  parse(value: unknown): T | U {
    const leftResult = this.left.safeParse(value);
    if (leftResult.success) {
      return leftResult.data;
    }

    const rightResult = this.right.safeParse(value);
    if (rightResult.success) {
      return rightResult.data;
    }

    throw new Error(`Value doesn't match any of the union types`);
  }

  safeParse(value: unknown): { success: true; data: T | U } | { success: false; error: Error } {
    try {
      const data = this.parse(value);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e : new Error(String(e)) };
    }
  }
}

// ============================================================================
// Tool Helper
// ============================================================================

/**
 * Helper to define a tool with type-safe schema.
 *
 * @example
 * ```typescript
 * const hashTool = tool({
 *   description: 'Hash a value with SHA-256',
 *   args: {
 *     value: schema.string().describe('Value to hash'),
 *     encoding: schema.enum(['hex', 'base64']).default('hex'),
 *   },
 *   async execute(args) {
 *     // args.value is typed as string
 *     // args.encoding is typed as 'hex' | 'base64'
 *     return hashValue(args.value, args.encoding);
 *   },
 * });
 * ```
 */
export function tool<TArgs extends Record<string, ToolSchema>>(definition: {
  description: string;
  args: TArgs;
  execute: (
    args: { [K in keyof TArgs]: TArgs[K] extends ToolSchema<infer U> ? U : never },
    ctx: import('./types').ToolContext
  ) => Promise<string> | string;
}): ToolDefinition<{ [K in keyof TArgs]: TArgs[K] extends ToolSchema<infer U> ? U : never }> {
  return {
    description: definition.description,
    args: definition.args as unknown as Record<string, ToolSchema>,
    execute: async (rawArgs, ctx) => {
      // Parse all arguments through their schemas
      const parsedArgs: Record<string, unknown> = {};

      for (const [key, argSchema] of Object.entries(definition.args)) {
        const rawValue = (rawArgs as Record<string, unknown>)[key];
        parsedArgs[key] = argSchema.parse(rawValue);
      }

      return await definition.execute(
        parsedArgs as { [K in keyof TArgs]: TArgs[K] extends ToolSchema<infer U> ? U : never },
        ctx
      );
    }
  };
}

// Attach schema to tool for convenience
tool.schema = schema;
