type ParseJsonBodyResult =
  | {
      ok: true;
      value: unknown;
      templateReplacements: TemplatePlaceholderReplacement[];
    }
  | {
      ok: false;
      message: string;
    };

export type FormatJsonBodyResult =
  | {
      ok: true;
      text: string;
    }
  | {
      ok: false;
      message: string;
    };

type TemplateTokenKind = 'variable' | 'resolver' | 'invalid';

type TemplateToken = {
  raw: string;
  expression: string;
  start: number;
  end: number;
  kind: TemplateTokenKind;
};

type TemplatePlaceholderReplacement = {
  placeholder: string;
  raw: string;
};

const TEMPLATE_PLACEHOLDER_PREFIX = '__treq_template_placeholder_';
const WORD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

type ResolverExpression = {
  name: string;
};

function parseResolverExpression(expression: string): ResolverExpression | undefined {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('$') || !trimmed.endsWith(')')) {
    return undefined;
  }

  const openParenIndex = trimmed.indexOf('(');
  if (openParenIndex === -1) {
    return undefined;
  }

  const resolverName = trimmed.slice(1, openParenIndex).trim();
  if (!resolverName || !WORD_PATTERN.test(resolverName)) {
    return undefined;
  }

  return { name: resolverName };
}

function scanTemplateTokens(content: string): TemplateToken[] {
  const tokens: TemplateToken[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const current = content[cursor];
    const next = content[cursor + 1];

    if (current !== '{' || next !== '{') {
      cursor += 1;
      continue;
    }

    const start = cursor;
    cursor += 2;
    let depth = 1;
    let expression = '';

    while (cursor < content.length) {
      const char = content[cursor];
      const charNext = content[cursor + 1];

      if (char === '{' && charNext === '{') {
        depth += 1;
        expression += '{{';
        cursor += 2;
        continue;
      }

      if (char === '}' && charNext === '}') {
        depth -= 1;
        if (depth === 0) {
          cursor += 2;
          break;
        }
        expression += '}}';
        cursor += 2;
        continue;
      }

      expression += char;
      cursor += 1;
    }

    if (depth !== 0) {
      tokens.push({
        raw: '{{',
        expression: '',
        start,
        end: Math.min(start + 2, content.length),
        kind: 'invalid'
      });
      cursor = Math.min(start + 2, content.length);
      continue;
    }

    const raw = content.slice(start, cursor);
    const trimmedExpression = expression.trim();
    const resolver = parseResolverExpression(trimmedExpression);

    if (!trimmedExpression) {
      tokens.push({
        raw,
        expression: trimmedExpression,
        start,
        end: cursor,
        kind: 'invalid'
      });
      continue;
    }

    if (resolver) {
      tokens.push({
        raw,
        expression: trimmedExpression,
        start,
        end: cursor,
        kind: 'resolver'
      });
      continue;
    }

    tokens.push({
      raw,
      expression: trimmedExpression,
      start,
      end: cursor,
      kind: 'variable'
    });
  }

  return tokens;
}

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

function isInsideDoubleQuotedString(content: string, targetOffset: number): boolean {
  let inString = false;
  let escaped = false;

  for (let index = 0; index < targetOffset && index < content.length; index += 1) {
    const char = content.charAt(index);

    if (!inString) {
      if (char === '"') {
        inString = true;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = false;
    }
  }

  return inString;
}

function sanitizeTemplatePlaceholders(content: string): {
  sanitizedText: string;
  replacements: TemplatePlaceholderReplacement[];
} {
  const tokens = scanTemplateTokens(content);
  if (tokens.length === 0) {
    return {
      sanitizedText: content,
      replacements: []
    };
  }

  const replacements: TemplatePlaceholderReplacement[] = [];
  const usedPlaceholders = new Set<string>();
  let replacementIndex = 0;
  let cursor = 0;
  let sanitizedText = '';

  const createPlaceholder = (): string => {
    while (true) {
      const nextPlaceholder = `${TEMPLATE_PLACEHOLDER_PREFIX}${replacementIndex}__`;
      replacementIndex += 1;

      if (usedPlaceholders.has(nextPlaceholder)) {
        continue;
      }
      if (content.includes(nextPlaceholder)) {
        continue;
      }

      usedPlaceholders.add(nextPlaceholder);
      return nextPlaceholder;
    }
  };

  for (const token of tokens) {
    if (token.kind === 'invalid') {
      continue;
    }
    if (token.start < cursor) {
      continue;
    }

    sanitizedText += content.slice(cursor, token.start);

    if (isInsideDoubleQuotedString(content, token.start)) {
      sanitizedText += content.slice(token.start, token.end);
    } else {
      const placeholder = createPlaceholder();
      replacements.push({ placeholder, raw: token.raw });
      sanitizedText += `"${placeholder}"`;
    }

    cursor = token.end;
  }

  sanitizedText += content.slice(cursor);

  return {
    sanitizedText,
    replacements
  };
}

function restoreTemplatePlaceholders(
  content: string,
  replacements: TemplatePlaceholderReplacement[]
): string {
  let restored = content;

  for (const replacement of replacements) {
    restored = restored.split(`"${replacement.placeholder}"`).join(replacement.raw);
  }

  return restored;
}

function parseJsonBody(text: string): ParseJsonBodyResult {
  const normalized = stripTrailingCommas(stripJsonComments(text));
  const { sanitizedText, replacements } = sanitizeTemplatePlaceholders(normalized);

  try {
    return {
      ok: true,
      value: JSON.parse(sanitizedText) as unknown,
      templateReplacements: replacements
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
    text: restoreTemplatePlaceholders(
      mode === 'prettify' ? JSON.stringify(parsed.value, null, 2) : JSON.stringify(parsed.value),
      parsed.templateReplacements
    )
  };
}
