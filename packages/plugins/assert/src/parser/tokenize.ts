import type { Token } from '../domain/types';

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i] ?? '')) {
      i++;
    }
    if (i >= input.length) break;

    const start = i;
    const char = input[i];

    if (char === '"' || char === "'") {
      const quote = char;
      i++;
      let escaped = false;
      while (i < input.length) {
        const current = input[i];
        if (current === undefined) break;
        if (escaped) {
          escaped = false;
          i++;
          continue;
        }
        if (current === '\\') {
          escaped = true;
          i++;
          continue;
        }
        if (current === quote) {
          i++;
          break;
        }
        i++;
      }

      const raw = input.slice(start, i);
      tokens.push({ raw, value: raw, start, end: i });
      continue;
    }

    while (i < input.length && !/\s/.test(input[i] ?? '')) {
      i++;
    }

    const raw = input.slice(start, i);
    tokens.push({ raw, value: raw, start, end: i });
  }

  return tokens;
}

export function decodeQuotedString(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.length < 2) return undefined;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (first !== last || (first !== '"' && first !== "'")) return undefined;

  const inner = trimmed.slice(1, -1);
  const quote = first;
  let decoded = '';

  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char !== '\\') {
      decoded += char;
      continue;
    }

    const next = inner[i + 1];
    if (next === undefined) {
      decoded += '\\';
      break;
    }

    if (next === quote || next === '\\') {
      decoded += next;
      i++;
      continue;
    }
    if (next === 'n') {
      decoded += '\n';
      i++;
      continue;
    }
    if (next === 'r') {
      decoded += '\r';
      i++;
      continue;
    }
    if (next === 't') {
      decoded += '\t';
      i++;
      continue;
    }

    decoded += next;
    i++;
  }

  return decoded;
}

export function parseExpectedString(raw: string): string {
  const decoded = decodeQuotedString(raw);
  return decoded !== undefined ? decoded : raw.trim();
}

export function parseExpectedJsonValue(raw: string): unknown {
  const decoded = decodeQuotedString(raw);
  if (decoded !== undefined) {
    return decoded;
  }

  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}
