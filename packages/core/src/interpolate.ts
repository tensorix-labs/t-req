import type { InterpolateOptions, Interpolator } from './types';

type TemplatePart =
  | { type: 'text'; value: string }
  | { type: 'expr'; expression: string; raw: string };

function isWord(s: string): boolean {
  return /^[A-Za-z0-9_]+$/.test(s);
}

function splitTemplate(input: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let i = 0;
  let textStart = 0;

  while (i < input.length) {
    const c = input[i];
    const n = input[i + 1];

    if (c === '{' && n === '{') {
      if (i > textStart) {
        parts.push({ type: 'text', value: input.slice(textStart, i) });
      }

      const start = i;
      i += 2; // consume {{

      let depth = 1;
      let expr = '';

      while (i < input.length) {
        const cc = input[i];
        const nn = input[i + 1];

        if (cc === '{' && nn === '{') {
          depth++;
          expr += '{{';
          i += 2;
          continue;
        }

        if (cc === '}' && nn === '}') {
          depth--;
          if (depth === 0) {
            i += 2; // consume final }}
            break;
          }
          expr += '}}';
          i += 2;
          continue;
        }

        expr += cc;
        i++;
      }

      if (depth !== 0) {
        throw new Error('Unterminated interpolation: missing "}}"');
      }

      const raw = input.slice(start, i);
      parts.push({ type: 'expr', expression: expr, raw });
      textStart = i;
      continue;
    }

    i++;
  }

  if (textStart < input.length) {
    parts.push({ type: 'text', value: input.slice(textStart) });
  }

  return parts;
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

function parseResolverCall(expression: string): { resolverKey: string; argText: string } | null {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('$')) return null;
  if (!trimmed.endsWith(')')) return null;

  const openIdx = trimmed.indexOf('(');
  if (openIdx === -1) return null;

  const name = trimmed.slice(1, openIdx).trim();
  if (!name || !isWord(name)) return null;

  const argText = trimmed.slice(openIdx + 1, -1);
  return { resolverKey: `$${name}`, argText };
}

function interpolateVariablesOnly(
  str: string,
  variables: Record<string, unknown>,
  undefinedBehavior: NonNullable<InterpolateOptions['undefinedBehavior']>
): string {
  const parts = splitTemplate(str);
  if (parts.length === 1 && parts[0]?.type === 'text') return str;

  let out = '';
  for (const part of parts) {
    if (part.type === 'text') {
      out += part.value;
      continue;
    }

    const expr = part.expression.trim();
    if (parseResolverCall(expr)) {
      throw new Error(`Resolver calls are not allowed inside resolver args: ${part.raw}`);
    }

    const value = getNestedValue(variables, expr);
    if (value === undefined) {
      if (undefinedBehavior === 'throw') {
        throw new Error(`Undefined variable: ${expr}`);
      }
      out += undefinedBehavior === 'keep' ? part.raw : '';
      continue;
    }

    out += String(value);
  }

  return out;
}

function parseResolverArgsFromText(
  argText: string,
  variables: Record<string, unknown>,
  undefinedBehavior: NonNullable<InterpolateOptions['undefinedBehavior']>
): string[] {
  const interpolated = interpolateVariablesOnly(argText, variables, undefinedBehavior).trim();
  if (!interpolated) return [];

  try {
    const parsed = JSON.parse(interpolated) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v));
    }
  } catch {
    // Fallback below
  }

  return [interpolated];
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

  const parts = splitTemplate(str);
  if (parts.length === 1 && parts[0]?.type === 'text') return str;

  let out = '';
  for (const part of parts) {
    if (part.type === 'text') {
      out += part.value;
      continue;
    }

    const parsed = parseResolverCall(part.expression);
    if (parsed) {
      const resolver = resolvers[parsed.resolverKey];
      if (resolver) {
        const args = parseResolverArgsFromText(parsed.argText, variables, undefinedBehavior);
        const result = resolver(...args);
        if (result instanceof Promise) {
          throw new Error(
            `Resolver ${parsed.resolverKey} returned a Promise. Use createInterpolator() for async resolvers.`
          );
        }
        out += String(result);
        continue;
      }

      if (undefinedBehavior === 'throw') {
        throw new Error(`Unknown resolver: ${parsed.resolverKey}`);
      }
      out += undefinedBehavior === 'keep' ? part.raw : '';
      continue;
    }

    const expr = part.expression.trim();
    const value = getNestedValue(variables, expr);
    if (value === undefined) {
      if (undefinedBehavior === 'throw') {
        throw new Error(`Undefined variable: ${expr}`);
      }
      out += undefinedBehavior === 'keep' ? part.raw : '';
      continue;
    }

    out += String(value);
  }

  return out;
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
  const parts = splitTemplate(str);
  if (parts.length === 1 && parts[0]?.type === 'text') return str;

  let out = '';
  for (const part of parts) {
    if (part.type === 'text') {
      out += part.value;
      continue;
    }

    const parsed = parseResolverCall(part.expression);
    if (parsed) {
      const resolver = resolvers[parsed.resolverKey];
      if (resolver) {
        const args = parseResolverArgsFromText(parsed.argText, variables, undefinedBehavior);
        const result = await resolver(...args);
        out += String(result);
        continue;
      }

      if (undefinedBehavior === 'throw') {
        throw new Error(`Unknown resolver: ${parsed.resolverKey}`);
      }
      out += undefinedBehavior === 'keep' ? part.raw : '';
      continue;
    }

    const expr = part.expression.trim();
    const value = getNestedValue(variables, expr);
    if (value === undefined) {
      if (undefinedBehavior === 'throw') {
        throw new Error(`Undefined variable: ${expr}`);
      }
      out += undefinedBehavior === 'keep' ? part.raw : '';
      continue;
    }

    out += String(value);
  }

  return out;
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
