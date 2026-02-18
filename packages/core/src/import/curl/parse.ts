import { buildAuthHeaders } from '../normalize';
import { createDiagnostic } from './diagnostics';
import { setHeaderIfMissing } from './headers';
import { looksLikeUrl, normalizeFilePath } from './normalize';
import type { ParsedCurlCommand, ParsedFormField } from './types';

function parseUser(raw: string): { username: string; password: string } {
  const split = raw.indexOf(':');
  if (split === -1) {
    return { username: raw, password: '' };
  }
  return {
    username: raw.slice(0, split),
    password: raw.slice(split + 1)
  };
}

function parseHeader(raw: string): { key: string; value: string } | undefined {
  const index = raw.indexOf(':');
  if (index <= 0) {
    return undefined;
  }
  return {
    key: raw.slice(0, index).trim(),
    value: raw.slice(index + 1).trim()
  };
}

function parseFormField(raw: string): ParsedFormField | undefined {
  const separator = raw.indexOf('=');
  if (separator <= 0) {
    return undefined;
  }

  const name = raw.slice(0, separator).trim();
  const value = raw.slice(separator + 1);
  if (!name) {
    return undefined;
  }

  if (value.startsWith('@') || value.startsWith('<')) {
    const filePart = value.slice(1).split(';')[0]?.trim() ?? '';
    return {
      name,
      value: '',
      isFile: true,
      path: normalizeFilePath(filePart || 'file')
    };
  }

  return { name, value, isFile: false };
}

function readAttachedValue(token: string, shortFlag: string, longFlag: string): string | undefined {
  // Attached short-form values are only supported for single-char short flags:
  // e.g. "-dVALUE". We intentionally avoid treating "--..." or exact flag tokens as attached.
  const isSingleCharShortFlag =
    shortFlag.length === 2 && shortFlag.startsWith('-') && !shortFlag.startsWith('--');
  if (
    isSingleCharShortFlag &&
    token !== shortFlag &&
    !token.startsWith('--') &&
    token.startsWith(shortFlag)
  ) {
    return token.slice(shortFlag.length);
  }
  if (token.startsWith(`${longFlag}=`)) {
    return token.slice(longFlag.length + 1);
  }
  return undefined;
}

function matchesOption(
  token: string,
  shortFlag: string | undefined,
  longFlag: string,
  attachedValue: string | undefined
): boolean {
  return (
    token === longFlag ||
    (shortFlag !== undefined && token === shortFlag) ||
    attachedValue !== undefined
  );
}

const DATA_FLAGS = new Set(['-d', '--data', '--data-raw', '--data-binary', '--json']);

export function parseCurlTokens(tokens: string[]): ParsedCurlCommand {
  const parsed: ParsedCurlCommand = {
    headers: {},
    dataParts: [],
    dataUrlEncodedParts: [],
    formData: [],
    useGet: false,
    diagnostics: []
  };

  const commandStart = tokens.findIndex((token) => /(^|\/)curl(\.exe)?$/i.test(token));
  let index = commandStart >= 0 ? commandStart + 1 : 0;
  if (commandStart === -1) {
    parsed.diagnostics.push(
      createDiagnostic(
        'invalid-curl-command',
        'warning',
        'Input does not start with "curl"; attempted best-effort conversion.'
      )
    );
  }

  const takeNextValue = (flag: string): string | undefined => {
    const next = tokens[index + 1];
    if (next === undefined) {
      parsed.diagnostics.push(
        createDiagnostic('missing-option-value', 'error', `Option "${flag}" is missing a value.`)
      );
      return undefined;
    }
    index += 1;
    return next;
  };

  while (index < tokens.length) {
    const token = tokens[index] as string;

    if (!token.startsWith('-')) {
      if (parsed.url === undefined && looksLikeUrl(token)) {
        parsed.url = token;
      } else {
        parsed.diagnostics.push(
          createDiagnostic(
            'unexpected-argument',
            'warning',
            `Unrecognized argument "${token}" was ignored.`
          )
        );
      }
      index += 1;
      continue;
    }

    if (token === '-G' || token === '--get') {
      parsed.useGet = true;
      index += 1;
      continue;
    }

    if (token === '-I' || token === '--head') {
      parsed.method = 'HEAD';
      index += 1;
      continue;
    }

    const methodValue = readAttachedValue(token, '-X', '--request');
    if (matchesOption(token, '-X', '--request', methodValue)) {
      const value = methodValue ?? takeNextValue(token);
      if (value !== undefined && value.trim() !== '') {
        parsed.method = value.toUpperCase();
      }
      index += 1;
      continue;
    }

    const urlValue = readAttachedValue(token, '', '--url');
    if (matchesOption(token, undefined, '--url', urlValue)) {
      const value = urlValue ?? takeNextValue(token);
      if (value !== undefined) {
        parsed.url = value;
      }
      index += 1;
      continue;
    }

    const headerValue = readAttachedValue(token, '-H', '--header');
    if (matchesOption(token, '-H', '--header', headerValue)) {
      const value = headerValue ?? takeNextValue(token);
      if (value !== undefined) {
        const header = parseHeader(value);
        if (!header) {
          parsed.diagnostics.push(
            createDiagnostic(
              'invalid-header',
              'warning',
              `Header "${value}" is invalid and was ignored.`
            )
          );
        } else if (header.key !== '') {
          parsed.headers[header.key] = header.value;
        }
      }
      index += 1;
      continue;
    }

    const userValue = readAttachedValue(token, '-u', '--user');
    if (matchesOption(token, '-u', '--user', userValue)) {
      const value = userValue ?? takeNextValue(token);
      if (value !== undefined) {
        const auth = parseUser(value);
        Object.assign(parsed.headers, buildAuthHeaders('basic', auth));
      }
      index += 1;
      continue;
    }

    const formValue = readAttachedValue(token, '-F', '--form');
    if (matchesOption(token, '-F', '--form', formValue)) {
      const value = formValue ?? takeNextValue(token);
      if (value !== undefined) {
        const formField = parseFormField(value);
        if (!formField) {
          parsed.diagnostics.push(
            createDiagnostic(
              'invalid-form-field',
              'warning',
              `Form field "${value}" is invalid and was ignored.`
            )
          );
        } else {
          parsed.formData.push(formField);
        }
      }
      index += 1;
      continue;
    }

    const bodyValue =
      readAttachedValue(token, '-d', '--data') ??
      readAttachedValue(token, '', '--data-raw') ??
      readAttachedValue(token, '', '--data-binary') ??
      readAttachedValue(token, '', '--json');
    if (DATA_FLAGS.has(token) || bodyValue !== undefined) {
      const value = bodyValue ?? takeNextValue(token);
      if (value !== undefined) {
        parsed.dataParts.push(value);
        if (token === '--json' || token.startsWith('--json=')) {
          setHeaderIfMissing(parsed.headers, 'Content-Type', 'application/json');
          setHeaderIfMissing(parsed.headers, 'Accept', 'application/json');
        }
      }
      index += 1;
      continue;
    }

    const urlencodedValue = readAttachedValue(token, '', '--data-urlencode');
    if (matchesOption(token, undefined, '--data-urlencode', urlencodedValue)) {
      const value = urlencodedValue ?? takeNextValue(token);
      if (value !== undefined) {
        parsed.dataUrlEncodedParts.push(value);
      }
      index += 1;
      continue;
    }

    parsed.diagnostics.push(
      createDiagnostic(
        'unsupported-option',
        'warning',
        `Unsupported curl option "${token}" was ignored.`
      )
    );
    index += 1;
  }

  return parsed;
}
