import { buildAuthHeaders } from '../normalize';
import { createDiagnostic } from './diagnostics';
import { setHeaderIfMissing } from './headers';
import { looksLikeUrl, normalizeFilePath } from './normalize';
import type { ParsedCurlCommand, ParsedFormField } from './types';

interface OptionDefinition {
  short?: string;
  long: string;
}

type OptionMatch = { matched: false } | { matched: true; value: string | undefined };

interface ParseContext {
  tokens: string[];
  parsed: ParsedCurlCommand;
  index: number;
}

type OptionHandler = (context: ParseContext, token: string) => boolean;

const METHOD_OPTION: OptionDefinition = { short: '-X', long: '--request' };
const URL_OPTION: OptionDefinition = { long: '--url' };
const HEADER_OPTION: OptionDefinition = { short: '-H', long: '--header' };
const USER_OPTION: OptionDefinition = { short: '-u', long: '--user' };
const COOKIE_OPTION: OptionDefinition = { short: '-b', long: '--cookie' };
const REFERER_OPTION: OptionDefinition = { short: '-e', long: '--referer' };
const USER_AGENT_OPTION: OptionDefinition = { short: '-A', long: '--user-agent' };
const FORM_OPTION: OptionDefinition = { short: '-F', long: '--form' };
const URLENCODE_OPTION: OptionDefinition = { long: '--data-urlencode' };
const DATA_OPTIONS: OptionDefinition[] = [
  { short: '-d', long: '--data' },
  { long: '--data-raw' },
  { long: '--data-binary' },
  { long: '--json' }
];
const IGNORED_VALUE_OPTIONS: OptionDefinition[] = [
  { short: '-o', long: '--output' },
  { short: '-x', long: '--proxy' },
  { long: '--retry' },
  { long: '--max-time' },
  { long: '--connect-timeout' },
  { long: '--cacert' },
  { long: '--cert' },
  { long: '--key' }
];
const IGNORED_FLAG_OPTIONS = new Set([
  '-L',
  '--location',
  '-k',
  '--insecure',
  '--compressed',
  '-s',
  '--silent',
  '-S',
  '--show-error',
  '-v',
  '--verbose',
  '--http1.1',
  '--http2',
  '--http3'
]);

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

function takeNextValue(context: ParseContext, flag: string): string | undefined {
  const next = context.tokens[context.index + 1];
  if (next === undefined) {
    context.parsed.diagnostics.push(
      createDiagnostic('missing-option-value', 'error', `Option "${flag}" is missing a value.`)
    );
    return undefined;
  }
  context.index += 1;
  return next;
}

function matchOption(context: ParseContext, token: string, option: OptionDefinition): OptionMatch {
  const attached = readAttachedValue(token, option.short ?? '', option.long);
  const matchesLong = token === option.long;
  const matchesShort = option.short !== undefined && token === option.short;
  if (!matchesLong && !matchesShort && attached === undefined) {
    return { matched: false };
  }

  return {
    matched: true,
    value: attached ?? takeNextValue(context, token)
  };
}

function handleGetOption(context: ParseContext, token: string): boolean {
  if (token !== '-G' && token !== '--get') {
    return false;
  }
  context.parsed.useGet = true;
  return true;
}

function handleHeadOption(context: ParseContext, token: string): boolean {
  if (token !== '-I' && token !== '--head') {
    return false;
  }
  context.parsed.method = 'HEAD';
  return true;
}

function handleMethodOption(context: ParseContext, token: string): boolean {
  const match = matchOption(context, token, METHOD_OPTION);
  if (!match.matched) {
    return false;
  }
  if (match.value !== undefined && match.value.trim() !== '') {
    context.parsed.method = match.value.toUpperCase();
  }
  return true;
}

function handleUrlOption(context: ParseContext, token: string): boolean {
  const match = matchOption(context, token, URL_OPTION);
  if (!match.matched) {
    return false;
  }
  if (match.value !== undefined) {
    context.parsed.url = match.value;
  }
  return true;
}

function handleHeaderOption(context: ParseContext, token: string): boolean {
  const match = matchOption(context, token, HEADER_OPTION);
  if (!match.matched) {
    return false;
  }
  if (match.value === undefined) {
    return true;
  }

  const header = parseHeader(match.value);
  if (!header) {
    context.parsed.diagnostics.push(
      createDiagnostic(
        'invalid-header',
        'warning',
        `Header "${match.value}" is invalid and was ignored.`
      )
    );
    return true;
  }

  if (header.key !== '') {
    context.parsed.headers[header.key] = header.value;
  }
  return true;
}

function handleUserOption(context: ParseContext, token: string): boolean {
  const match = matchOption(context, token, USER_OPTION);
  if (!match.matched) {
    return false;
  }
  if (match.value !== undefined) {
    const auth = parseUser(match.value);
    Object.assign(context.parsed.headers, buildAuthHeaders('basic', auth));
  }
  return true;
}

function handleCookieOption(context: ParseContext, token: string): boolean {
  const match = matchOption(context, token, COOKIE_OPTION);
  if (!match.matched) {
    return false;
  }
  if (match.value === undefined || match.value.trim() === '') {
    return true;
  }

  if (match.value.startsWith('@')) {
    context.parsed.diagnostics.push(
      createDiagnostic(
        'unsupported-cookie-file',
        'warning',
        `Cookie file "${match.value}" cannot be imported and was ignored.`,
        { value: match.value }
      )
    );
    return true;
  }

  context.parsed.headers['Cookie'] = match.value;
  return true;
}

function handleRefererOption(context: ParseContext, token: string): boolean {
  const match = matchOption(context, token, REFERER_OPTION);
  if (!match.matched) {
    return false;
  }
  if (match.value !== undefined && match.value.trim() !== '') {
    context.parsed.headers['Referer'] = match.value;
  }
  return true;
}

function handleUserAgentOption(context: ParseContext, token: string): boolean {
  const match = matchOption(context, token, USER_AGENT_OPTION);
  if (!match.matched) {
    return false;
  }
  if (match.value !== undefined && match.value.trim() !== '') {
    context.parsed.headers['User-Agent'] = match.value;
  }
  return true;
}

function handleFormOption(context: ParseContext, token: string): boolean {
  const match = matchOption(context, token, FORM_OPTION);
  if (!match.matched) {
    return false;
  }
  if (match.value === undefined) {
    return true;
  }

  const formField = parseFormField(match.value);
  if (!formField) {
    context.parsed.diagnostics.push(
      createDiagnostic(
        'invalid-form-field',
        'warning',
        `Form field "${match.value}" is invalid and was ignored.`
      )
    );
    return true;
  }

  context.parsed.formData.push(formField);
  return true;
}

function handleDataOption(context: ParseContext, token: string): boolean {
  for (const option of DATA_OPTIONS) {
    const match = matchOption(context, token, option);
    if (!match.matched) {
      continue;
    }

    if (match.value !== undefined) {
      context.parsed.dataParts.push(match.value);
      if (option.long === '--json') {
        setHeaderIfMissing(context.parsed.headers, 'Content-Type', 'application/json');
        setHeaderIfMissing(context.parsed.headers, 'Accept', 'application/json');
      }
    }

    return true;
  }

  return false;
}

function handleUrlEncodedDataOption(context: ParseContext, token: string): boolean {
  const match = matchOption(context, token, URLENCODE_OPTION);
  if (!match.matched) {
    return false;
  }
  if (match.value !== undefined) {
    context.parsed.dataUrlEncodedParts.push(match.value);
  }
  return true;
}

function pushIgnoredOptionDiagnostic(context: ParseContext, token: string): void {
  context.parsed.diagnostics.push(
    createDiagnostic(
      'unsupported-option',
      'warning',
      `Unsupported curl option "${token}" was ignored.`
    )
  );
}

function handleIgnoredOption(context: ParseContext, token: string): boolean {
  if (IGNORED_FLAG_OPTIONS.has(token)) {
    pushIgnoredOptionDiagnostic(context, token);
    return true;
  }

  for (const option of IGNORED_VALUE_OPTIONS) {
    const match = matchOption(context, token, option);
    if (!match.matched) {
      continue;
    }

    pushIgnoredOptionDiagnostic(context, token);
    return true;
  }

  return false;
}

const OPTION_HANDLERS: OptionHandler[] = [
  handleGetOption,
  handleHeadOption,
  handleMethodOption,
  handleUrlOption,
  handleHeaderOption,
  handleUserOption,
  handleCookieOption,
  handleRefererOption,
  handleUserAgentOption,
  handleFormOption,
  handleDataOption,
  handleUrlEncodedDataOption,
  handleIgnoredOption
];

function handlePositionalArgument(context: ParseContext, token: string): void {
  if (context.parsed.url === undefined && looksLikeUrl(token)) {
    context.parsed.url = token;
    return;
  }

  context.parsed.diagnostics.push(
    createDiagnostic(
      'unexpected-argument',
      'warning',
      `Unrecognized argument "${token}" was ignored.`
    )
  );
}

export function parseCurlTokens(tokens: string[]): ParsedCurlCommand {
  const context: ParseContext = {
    tokens,
    index: 0,
    parsed: {
      headers: {},
      dataParts: [],
      dataUrlEncodedParts: [],
      formData: [],
      useGet: false,
      diagnostics: []
    }
  };

  const commandStart = tokens.findIndex((token) => /(^|\/)curl(\.exe)?$/i.test(token));
  context.index = commandStart >= 0 ? commandStart + 1 : 0;
  if (commandStart === -1) {
    context.parsed.diagnostics.push(
      createDiagnostic(
        'invalid-curl-command',
        'warning',
        'Input does not start with "curl"; attempted best-effort conversion.'
      )
    );
  }

  while (context.index < tokens.length) {
    const token = tokens[context.index] as string;

    if (!token.startsWith('-')) {
      handlePositionalArgument(context, token);
      context.index += 1;
      continue;
    }

    let handled = false;
    for (const handler of OPTION_HANDLERS) {
      if (handler(context, token)) {
        handled = true;
        break;
      }
    }

    if (!handled) {
      pushIgnoredOptionDiagnostic(context, token);
    }

    context.index += 1;
  }

  return context.parsed;
}
