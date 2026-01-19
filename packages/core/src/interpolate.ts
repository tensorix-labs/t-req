import type { InterpolateOptions, Interpolator } from './types';

// Pattern to match {{variable}} or {{$resolver(arg)}}
const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;
const RESOLVER_PATTERN = /^\$(\w+)\(([^)]*)\)$/;

/**
 * Parse comma-separated arguments from a resolver argument string
 */
function parseResolverArgs(argString: string): string[] {
  if (!argString.trim()) return [];
  return argString.split(',').map((arg) => arg.trim());
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Interpolate variables into a string synchronously
 */
function interpolateString(
  str: string,
  variables: Record<string, unknown>,
  options: InterpolateOptions = {}
): string {
  const { resolvers = {}, undefinedBehavior = 'throw' } = options;

  return str.replace(VARIABLE_PATTERN, (match, expression: string) => {
    const trimmedExpr = expression.trim();

    // Check for resolver pattern: $resolver(arg)
    const resolverMatch = trimmedExpr.match(RESOLVER_PATTERN);
    if (resolverMatch) {
      const [, resolverName, arg] = resolverMatch;
      const resolver = resolvers[`$${resolverName}`];

      if (resolver) {
        const args = parseResolverArgs(arg ?? '');
        const result = resolver(...args);
        if (result instanceof Promise) {
          throw new Error(
            `Resolver $${resolverName} returned a Promise. Use createInterpolator() for async resolvers.`
          );
        }
        return String(result);
      }

      // Resolver not found
      if (undefinedBehavior === 'throw') {
        throw new Error(`Unknown resolver: $${resolverName}`);
      }
      return undefinedBehavior === 'keep' ? match : '';
    }

    // Regular variable lookup
    const value = getNestedValue(variables, trimmedExpr);

    if (value === undefined) {
      if (undefinedBehavior === 'throw') {
        throw new Error(`Undefined variable: ${trimmedExpr}`);
      }
      return undefinedBehavior === 'keep' ? match : '';
    }

    return String(value);
  });
}

/**
 * Interpolate variables into a string asynchronously
 */
async function interpolateStringAsync(
  str: string,
  variables: Record<string, unknown>,
  options: InterpolateOptions = {}
): Promise<string> {
  const { resolvers = {}, undefinedBehavior = 'throw' } = options;

  // Find all matches first
  const matches: Array<{ match: string; expression: string; index: number }> = [];
  const regex = new RegExp(VARIABLE_PATTERN.source, 'g');

  let match: RegExpExecArray | null = regex.exec(str);
  while (match !== null) {
    const expression = match[1];
    if (expression === undefined) {
      match = regex.exec(str);
      continue;
    }
    matches.push({
      match: match[0],
      expression,
      index: match.index
    });
    match = regex.exec(str);
  }

  if (matches.length === 0) {
    return str;
  }

  // Resolve all values (potentially async)
  const resolvedValues = await Promise.all(
    matches.map(async ({ match, expression }) => {
      const trimmedExpr = expression.trim();

      // Check for resolver pattern: $resolver(arg)
      const resolverMatch = trimmedExpr.match(RESOLVER_PATTERN);
      if (resolverMatch) {
        const [, resolverName, arg] = resolverMatch;
        const resolver = resolvers[`$${resolverName}`];

        if (resolver) {
          const args = parseResolverArgs(arg ?? '');
          const result = await resolver(...args);
          return String(result);
        }

        // Resolver not found
        if (undefinedBehavior === 'throw') {
          throw new Error(`Unknown resolver: $${resolverName}`);
        }
        return undefinedBehavior === 'keep' ? match : '';
      }

      // Regular variable lookup
      const value = getNestedValue(variables, trimmedExpr);

      if (value === undefined) {
        if (undefinedBehavior === 'throw') {
          throw new Error(`Undefined variable: ${trimmedExpr}`);
        }
        return undefinedBehavior === 'keep' ? match : '';
      }

      return String(value);
    })
  );

  // Build result string
  let result = '';
  let lastIndex = 0;

  for (let i = 0; i < matches.length; i++) {
    const entry = matches[i];
    if (!entry) continue;
    const { match, index } = entry;
    result += str.slice(lastIndex, index);
    result += resolvedValues[i];
    lastIndex = index + match.length;
  }

  result += str.slice(lastIndex);
  return result;
}

/**
 * Deep clone and interpolate an object
 */
function interpolateValue<T>(
  value: T,
  variables: Record<string, unknown>,
  options: InterpolateOptions
): T {
  if (typeof value === 'string') {
    return interpolateString(value, variables, options) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateValue(item, variables, options)) as T;
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = interpolateValue(val, variables, options);
    }
    return result as T;
  }

  return value;
}

/**
 * Deep clone and interpolate an object asynchronously
 */
async function interpolateValueAsync<T>(
  value: T,
  variables: Record<string, unknown>,
  options: InterpolateOptions
): Promise<T> {
  if (typeof value === 'string') {
    return (await interpolateStringAsync(value, variables, options)) as T;
  }

  if (Array.isArray(value)) {
    return (await Promise.all(
      value.map((item) => interpolateValueAsync(item, variables, options))
    )) as T;
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>);
    const resolvedEntries = await Promise.all(
      entries.map(async ([key, val]) => [key, await interpolateValueAsync(val, variables, options)])
    );
    for (const [key, val] of resolvedEntries) {
      result[key as string] = val;
    }
    return result as T;
  }

  return value;
}

/**
 * Interpolate variables into a target object or string
 * For async resolvers, use createInterpolator() instead
 */
export function interpolate<T>(
  target: T,
  variables: Record<string, unknown>,
  options: InterpolateOptions = {}
): T {
  return interpolateValue(target, variables, options);
}

/**
 * Create a reusable interpolator with async resolver support
 */
export function createInterpolator(options: InterpolateOptions = {}): Interpolator {
  return {
    async interpolate<T>(target: T, variables: Record<string, unknown>): Promise<T> {
      return interpolateValueAsync(target, variables, options);
    }
  };
}
