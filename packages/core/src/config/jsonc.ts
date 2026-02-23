/**
 * JSONC (JSON with Comments) parser
 *
 * Strips single-line (//) and multi-line comments from JSON text
 * while preserving '//' inside string values (e.g., URLs).
 */

type State = 'code' | 'string' | 'line-comment' | 'block-comment';

/**
 * Strips JSONC comments from a string while preserving URLs and other
 * strings containing '//' or comment-like sequences.
 */
export function stripJsonComments(content: string): string {
  const result: string[] = [];
  let state: State = 'code';
  let i = 0;

  const trimTrailingWhitespaceOnLine = (): void => {
    // Remove whitespace immediately before a `//` comment so we don't leave
    // trailing spaces on that line. This is safe for JSON since whitespace is
    // insignificant outside strings, and we only do this in `code` state.
    while (result.length > 0) {
      const last = result[result.length - 1];
      if (last === ' ' || last === '\t') {
        result.pop();
        continue;
      }
      break;
    }
  };

  while (i < content.length) {
    // `charAt` avoids non-null assertions and is safe with bounds checks.
    const char = content.charAt(i);
    const next = content[i + 1];

    switch (state) {
      case 'code':
        if (char === '"') {
          // Enter string
          result.push(char);
          state = 'string';
          i++;
        } else if (char === '/' && next === '/') {
          // Enter line comment
          trimTrailingWhitespaceOnLine();
          state = 'line-comment';
          i += 2;
        } else if (char === '/' && next === '*') {
          // Enter block comment
          state = 'block-comment';
          i += 2;
        } else {
          result.push(char);
          i++;
        }
        break;

      case 'string':
        result.push(char);
        if (char === '\\' && next !== undefined) {
          // Escape sequence - consume next char
          result.push(next);
          i += 2;
        } else if (char === '"') {
          // Exit string
          state = 'code';
          i++;
        } else {
          i++;
        }
        break;

      case 'line-comment':
        if (char === '\n' || char === '\r') {
          // Exit line comment, preserve newline
          result.push(char);
          state = 'code';
        }
        i++;
        break;

      case 'block-comment':
        if (char === '*' && next === '/') {
          // Exit block comment
          state = 'code';
          i += 2;
        } else {
          // Preserve newlines in block comments for line number accuracy
          if (char === '\n' || char === '\r') {
            result.push(char);
          }
          i++;
        }
        break;
    }
  }

  return result.join('');
}

/**
 * Strips trailing commas from JSON-like objects/arrays while preserving commas
 * inside string values.
 */
export function stripTrailingCommas(content: string): string {
  const result: string[] = [];
  let state: 'code' | 'string' = 'code';
  let i = 0;

  while (i < content.length) {
    const char = content.charAt(i);
    const next = content[i + 1];

    if (state === 'code') {
      if (char === '"') {
        result.push(char);
        state = 'string';
        i++;
        continue;
      }

      if (char === ',') {
        let lookahead = i + 1;
        while (lookahead < content.length) {
          const nextChar = content.charAt(lookahead);
          if (nextChar === ' ' || nextChar === '\t' || nextChar === '\n' || nextChar === '\r') {
            lookahead++;
            continue;
          }
          break;
        }

        const tokenAfterComma = content.charAt(lookahead);
        if (tokenAfterComma === '}' || tokenAfterComma === ']') {
          i++;
          continue;
        }
      }

      result.push(char);
      i++;
      continue;
    }

    result.push(char);
    if (char === '\\' && next !== undefined) {
      result.push(next);
      i += 2;
      continue;
    }
    if (char === '"') {
      state = 'code';
    }
    i++;
  }

  return result.join('');
}

/**
 * Parse JSONC content (JSON with comments) to an object.
 *
 * @throws {SyntaxError} if the content is not valid JSON after stripping comments
 */
export function parseJsonc<T = unknown>(content: string): T {
  const stripped = stripTrailingCommas(stripJsonComments(content));
  try {
    return JSON.parse(stripped) as T;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new SyntaxError(`Invalid JSONC: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Normalize JSONC text into strict JSON.
 *
 * This removes comments/trailing commas and serializes with standard JSON encoding.
 */
export function normalizeJsonc(content: string): string {
  const parsed = parseJsonc<unknown>(content);
  return JSON.stringify(parsed);
}
