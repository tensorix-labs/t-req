const FILE_VARIABLE_PATTERN = /^@([A-Za-z_][\w.]*)\s*=\s*(.+)$/;
const WORD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_PREVIEW_LENGTH = 140;
const DEFAULT_UNRESOLVED_VARIABLE_PREVIEW_LIMIT = 4;

export type TemplateTokenKind = 'variable' | 'resolver' | 'invalid';

export type TemplateToken = {
  raw: string;
  expression: string;
  start: number;
  end: number;
  kind: TemplateTokenKind;
  variablePath?: string;
  resolverName?: string;
};

export type TemplateTokenResolutionStatus = 'resolved' | 'missing' | 'resolver' | 'invalid';

export type TemplateTokenResolution = {
  status: TemplateTokenResolutionStatus;
  displayValue: string;
  value?: unknown;
};

export type TemplateUsageAnalysis = {
  tokens: TemplateToken[];
  unresolvedVariables: string[];
};

type ResolverExpression = {
  name: string;
};

function truncateForPreview(value: string): string {
  if (value.length <= MAX_PREVIEW_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_PREVIEW_LENGTH - 1)}...`;
}

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

function getNestedValue(variables: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = variables;

  for (const segment of segments) {
    if (!segment) {
      return undefined;
    }
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function formatPreviewValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'string') {
    return truncateForPreview(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      return String(value);
    }
    return truncateForPreview(serialized);
  } catch {
    return truncateForPreview(String(value));
  }
}

function formatInterpolationValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) {
      return serialized;
    }
    return String(value);
  } catch {
    return String(value);
  }
}

export function scanTemplateTokens(content: string): TemplateToken[] {
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
        kind: 'resolver',
        resolverName: resolver.name
      });
      continue;
    }

    tokens.push({
      raw,
      expression: trimmedExpression,
      start,
      end: cursor,
      kind: 'variable',
      variablePath: trimmedExpression
    });
  }

  return tokens;
}

export function extractFileVariablesFromContent(content: string): Record<string, string> {
  const fileVariables: Record<string, string> = {};

  for (const line of content.split(/\r?\n/u)) {
    const match = line.trim().match(FILE_VARIABLE_PATTERN);
    if (!match) {
      continue;
    }

    const [, key, value] = match;
    if (!key || value === undefined) {
      continue;
    }

    fileVariables[key] = value.trim();
  }

  return fileVariables;
}

export function buildTemplatePreviewVariables(input: {
  resolvedVariables?: Record<string, unknown>;
  draftContent?: string;
}): Record<string, unknown> {
  const mergedVariables: Record<string, unknown> = {
    ...(input.resolvedVariables ?? {})
  };

  const fileVariables = extractFileVariablesFromContent(input.draftContent ?? '');
  for (const [key, value] of Object.entries(fileVariables)) {
    mergedVariables[key] = value;
  }

  return mergedVariables;
}

export function resolveTemplateTokenFromVariables(
  token: TemplateToken,
  variables: Record<string, unknown>
): TemplateTokenResolution {
  if (token.kind === 'invalid') {
    return {
      status: 'invalid',
      displayValue: 'Invalid template expression.'
    };
  }

  if (token.kind === 'resolver') {
    return {
      status: 'resolver',
      displayValue: token.resolverName
        ? `Resolver $${token.resolverName} is evaluated at runtime.`
        : 'Resolver is evaluated at runtime.'
    };
  }

  const variablePath = token.variablePath ?? token.expression;
  const value = getNestedValue(variables, variablePath);

  if (value === undefined) {
    return {
      status: 'missing',
      displayValue: `Variable "${variablePath}" is not defined.`
    };
  }

  return {
    status: 'resolved',
    displayValue: formatPreviewValue(value),
    value
  };
}

export function analyzeTemplateUsage(
  content: string,
  variables: Record<string, unknown>
): TemplateUsageAnalysis {
  const tokens = scanTemplateTokens(content);
  const unresolved = new Set<string>();

  for (const token of tokens) {
    if (token.kind !== 'variable') {
      continue;
    }

    const resolution = resolveTemplateTokenFromVariables(token, variables);
    if (resolution.status === 'missing' && token.variablePath) {
      unresolved.add(token.variablePath);
    }
  }

  return {
    tokens,
    unresolvedVariables: [...unresolved].sort((left, right) => left.localeCompare(right))
  };
}

export function formatUnresolvedVariablesPreview(
  values: string[],
  limit = DEFAULT_UNRESOLVED_VARIABLE_PREVIEW_LIMIT
): string {
  if (values.length <= limit) {
    return values.join(', ');
  }

  const preview = values.slice(0, limit).join(', ');
  return `${preview}, +${values.length - limit} more`;
}

export function interpolateTemplatePreview(
  content: string,
  variables: Record<string, unknown>
): string {
  const tokens = scanTemplateTokens(content);
  if (tokens.length === 0) {
    return content;
  }

  let output = '';
  let cursor = 0;

  for (const token of tokens) {
    if (token.start < cursor) {
      continue;
    }

    output += content.slice(cursor, token.start);
    const resolution = resolveTemplateTokenFromVariables(token, variables);

    if (resolution.status === 'resolved') {
      output += formatInterpolationValue(resolution.value);
    } else {
      // Keep unresolved/resolver/invalid tokens as-is in preview output.
      output += token.raw;
    }

    cursor = token.end;
  }

  output += content.slice(cursor);
  return output;
}
