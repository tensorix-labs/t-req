export type VariableSource = 'file' | 'config' | `profile:${string}`;

export type VariableWithSource = {
  value: unknown;
  source: VariableSource;
};

export type VariablesWithSource = Record<string, VariableWithSource>;

export type VariableMatch = {
  expression: string;
  rawExpression: string;
  start: number;
  end: number;
};

export type ResolveVariablesWithSourceInput = {
  fileVariables?: Record<string, unknown>;
  configVariables?: Record<string, unknown>;
  profileVariables?: Record<string, unknown>;
  profileName?: string;
};

export type FormatHoverContentInput = {
  variableName: string;
  isResolver: boolean;
  value?: unknown;
  source?: VariableSource;
  configLabel?: string;
};

export type FormattedHoverContent =
  | {
      kind: 'resolver';
      variableName: string;
      message: string;
    }
  | {
      kind: 'undefined';
      variableName: string;
      message: string;
      sourceLabel?: string;
    }
  | {
      kind: 'resolved';
      variableName: string;
      value: string;
      sourceLabel?: string;
    };

export function toValueMap(variablesWithSource: VariablesWithSource): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(variablesWithSource)) {
    values[key] = entry.value;
  }
  return values;
}

export function findTopLevelVariableKey(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return '';
  }
  const dotIndex = trimmed.indexOf('.');
  if (dotIndex === -1) {
    return trimmed;
  }
  return trimmed.slice(0, dotIndex);
}

export function findVariableAtPosition(
  lineText: string,
  character: number
): VariableMatch | undefined {
  if (character < 0) {
    return undefined;
  }

  let index = 0;
  while (index < lineText.length) {
    const current = lineText[index];
    const next = lineText[index + 1];
    if (current !== '{' || next !== '{') {
      index += 1;
      continue;
    }

    const start = index;
    index += 2;

    let depth = 1;
    let expression = '';

    while (index < lineText.length) {
      const innerCurrent = lineText[index];
      const innerNext = lineText[index + 1];

      if (innerCurrent === '{' && innerNext === '{') {
        depth += 1;
        expression += '{{';
        index += 2;
        continue;
      }

      if (innerCurrent === '}' && innerNext === '}') {
        depth -= 1;
        if (depth === 0) {
          index += 2;
          break;
        }
        expression += '}}';
        index += 2;
        continue;
      }

      expression += innerCurrent;
      index += 1;
    }

    if (depth !== 0) {
      return undefined;
    }

    const end = index;
    const trimmedExpression = expression.trim();
    if (!trimmedExpression) {
      continue;
    }

    if (character >= start && character < end) {
      return {
        expression: trimmedExpression,
        rawExpression: expression,
        start,
        end
      };
    }
  }

  return undefined;
}

export function isResolverCall(expression: string): boolean {
  const trimmed = expression.trim();
  return trimmed.startsWith('$') && trimmed.includes('(') && trimmed.endsWith(')');
}

export function lookupVariable(variables: Record<string, unknown>, variablePath: string): unknown {
  const parts = variablePath.split('.');
  let current: unknown = variables;

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

export function resolveVariablesWithSource(
  input: ResolveVariablesWithSourceInput
): VariablesWithSource {
  const merged: VariablesWithSource = {};

  for (const [key, value] of Object.entries(input.fileVariables ?? {})) {
    merged[key] = { value, source: 'file' };
  }

  for (const [key, value] of Object.entries(input.configVariables ?? {})) {
    merged[key] = { value, source: 'config' };
  }

  if (input.profileName) {
    for (const [key, value] of Object.entries(input.profileVariables ?? {})) {
      merged[key] = { value, source: `profile:${input.profileName}` };
    }
  }

  return merged;
}

export function formatVariableSource(
  source: VariableSource | undefined,
  configLabel?: string
): string | undefined {
  if (!source) {
    return undefined;
  }

  if (source === 'file') {
    return 'File variable';
  }

  if (source === 'config') {
    return configLabel ? `Config (${configLabel})` : 'Config';
  }

  if (source.startsWith('profile:')) {
    const profileName = source.slice('profile:'.length).trim();
    return profileName ? `Profile ${profileName}` : 'Profile';
  }

  return source;
}

export function stringifyHoverValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return String(value);
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

export function formatHoverContent(input: FormatHoverContentInput): FormattedHoverContent {
  const variableName = input.variableName.trim();

  if (input.isResolver) {
    return {
      kind: 'resolver',
      variableName,
      message: 'Resolver - resolved at runtime'
    };
  }

  if (input.value === undefined) {
    return {
      kind: 'undefined',
      variableName,
      message: 'Undefined variable',
      sourceLabel: formatVariableSource(input.source, input.configLabel)
    };
  }

  return {
    kind: 'resolved',
    variableName,
    value: stringifyHoverValue(input.value),
    sourceLabel: formatVariableSource(input.source, input.configLabel)
  };
}
