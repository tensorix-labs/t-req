import type { ParseResult } from '../domain/types';

const DEFAULT_CACHE_ENTRIES = 512;

export type AssertionParser = (expression: string) => ParseResult;

function normalizeExpression(expression: string): string {
  return expression.trim();
}

export function createMemoizedParser(
  parseExpression: AssertionParser,
  maxEntries = DEFAULT_CACHE_ENTRIES
): AssertionParser {
  if (maxEntries <= 0) {
    return (expression: string) => parseExpression(normalizeExpression(expression));
  }

  const cache = new Map<string, ParseResult>();

  return (expression: string): ParseResult => {
    const key = normalizeExpression(expression);
    const cached = cache.get(key);
    if (cached !== undefined) {
      // Refresh insertion order to keep recent entries.
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }

    const parsed = parseExpression(key);

    if (cache.size >= maxEntries) {
      const oldest = cache.keys().next();
      if (!oldest.done) {
        cache.delete(oldest.value);
      }
    }

    cache.set(key, parsed);
    return parsed;
  };
}
