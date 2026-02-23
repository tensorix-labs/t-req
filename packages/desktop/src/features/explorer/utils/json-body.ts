type ParseJsonBodyResult =
  | {
      ok: true;
      value: unknown;
    }
  | {
      ok: false;
      message: string;
    };

type FormatJsonBodyResult =
  | {
      ok: true;
      text: string;
    }
  | {
      ok: false;
      message: string;
    };

function stripJsonComments(content: string): string {
  const result: string[] = [];
  let state: 'code' | 'string' | 'line-comment' | 'block-comment' = 'code';
  let index = 0;

  while (index < content.length) {
    const char = content.charAt(index);
    const next = content[index + 1];

    switch (state) {
      case 'code':
        if (char === '"') {
          result.push(char);
          state = 'string';
          index += 1;
          continue;
        }
        if (char === '/' && next === '/') {
          state = 'line-comment';
          index += 2;
          continue;
        }
        if (char === '/' && next === '*') {
          state = 'block-comment';
          index += 2;
          continue;
        }
        result.push(char);
        index += 1;
        continue;

      case 'string':
        result.push(char);
        if (char === '\\' && next !== undefined) {
          result.push(next);
          index += 2;
          continue;
        }
        if (char === '"') {
          state = 'code';
        }
        index += 1;
        continue;

      case 'line-comment':
        if (char === '\n' || char === '\r') {
          result.push(char);
          state = 'code';
        }
        index += 1;
        continue;

      case 'block-comment':
        if (char === '*' && next === '/') {
          state = 'code';
          index += 2;
          continue;
        }
        if (char === '\n' || char === '\r') {
          result.push(char);
        }
        index += 1;
        continue;
    }
  }

  return result.join('');
}

function stripTrailingCommas(content: string): string {
  const result: string[] = [];
  let state: 'code' | 'string' = 'code';
  let index = 0;

  while (index < content.length) {
    const char = content.charAt(index);
    const next = content[index + 1];

    if (state === 'string') {
      result.push(char);
      if (char === '\\' && next !== undefined) {
        result.push(next);
        index += 2;
        continue;
      }
      if (char === '"') {
        state = 'code';
      }
      index += 1;
      continue;
    }

    if (char === '"') {
      result.push(char);
      state = 'string';
      index += 1;
      continue;
    }

    if (char === ',') {
      let lookahead = index + 1;
      while (lookahead < content.length) {
        const nextChar = content.charAt(lookahead);
        if (nextChar === ' ' || nextChar === '\t' || nextChar === '\n' || nextChar === '\r') {
          lookahead += 1;
          continue;
        }
        break;
      }

      const tokenAfterComma = content.charAt(lookahead);
      if (tokenAfterComma === '}' || tokenAfterComma === ']') {
        index += 1;
        continue;
      }
    }

    result.push(char);
    index += 1;
  }

  return result.join('');
}

function parseJsonBody(text: string): ParseJsonBodyResult {
  const normalized = stripTrailingCommas(stripJsonComments(text));
  try {
    return {
      ok: true,
      value: JSON.parse(normalized) as unknown
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export function validateJsonBodyText(text: string): string | undefined {
  const parsed = parseJsonBody(text);
  if (!parsed.ok) {
    return parsed.message;
  }
  return undefined;
}

export function formatJsonBodyText(
  text: string,
  mode: 'prettify' | 'minify'
): FormatJsonBodyResult {
  const parsed = parseJsonBody(text);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true,
    text: mode === 'prettify' ? JSON.stringify(parsed.value, null, 2) : JSON.stringify(parsed.value)
  };
}
