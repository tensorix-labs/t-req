import { createDiagnostic } from './diagnostics';
import type { TokenizeResult } from './types';

function stripCommandDecorators(input: string): string {
  const trimmed = input.trim();
  const fenced = trimmed.match(/^```(?:bash|sh|zsh|shell)?\n([\s\S]*?)\n```$/i);
  const body = fenced?.[1] ?? trimmed;

  return body
    .split('\n')
    .map((line) => {
      const startTrimmed = line.trimStart();
      return startTrimmed.startsWith('$ ') ? startTrimmed.slice(2) : line;
    })
    .join('\n');
}

export function tokenizeCurlCommand(input: string): TokenizeResult {
  const diagnostics: TokenizeResult['diagnostics'] = [];
  const tokens: string[] = [];
  const normalizedInput = stripCommandDecorators(input);

  let token = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of normalizedInput) {
    if (escaped) {
      if (char !== '\n') {
        token += char;
      }
      escaped = false;
      continue;
    }

    if (quote === "'") {
      if (char === "'") {
        quote = null;
      } else {
        token += char;
      }
      continue;
    }

    if (quote === '"') {
      if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        quote = null;
      } else {
        token += char;
      }
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (token !== '') {
        tokens.push(token);
        token = '';
      }
      continue;
    }

    token += char;
  }

  if (escaped) {
    token += '\\';
  }

  if (token !== '') {
    tokens.push(token);
  }

  if (quote !== null) {
    diagnostics.push(
      createDiagnostic('invalid-curl-command', 'error', 'Unterminated quote in curl command.')
    );
  }

  return { tokens, diagnostics };
}
