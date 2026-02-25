import { scanTemplateTokens } from './template-variables';

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

type FormatJsonBodyResult =
  | {
      ok: true;
      text: string;
    }
  | {
      ok: false;
      message: string;
    };

type TemplatePlaceholderReplacement = {
  placeholder: string;
  raw: string;
};

const TEMPLATE_PLACEHOLDER_PREFIX = '__treq_template_placeholder_';

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
  let replacementIndex = 0;
  let cursor = 0;
  let sanitizedText = '';

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
      const placeholder = `${TEMPLATE_PLACEHOLDER_PREFIX}${replacementIndex}__`;
      replacements.push({ placeholder, raw: token.raw });
      sanitizedText += `"${placeholder}"`;
      replacementIndex += 1;
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
