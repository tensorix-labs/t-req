import { beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import * as oniguruma from 'vscode-oniguruma';
import { INITIAL, type IRawGrammar, Registry } from 'vscode-textmate';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dir, '..', '..');
const GRAMMAR_PATH = path.join(ROOT, 'syntaxes', 'http.tmLanguage.json');
const FIXTURE_PATH = path.join(ROOT, 'test', 'fixtures', 'grammar', 'sample.http');

type TokenLine = {
  startIndex: number;
  endIndex: number;
  scopes: string[];
}[];

let grammar: Awaited<ReturnType<Registry['loadGrammar']>>;

beforeAll(async () => {
  const wasmPath = require.resolve('vscode-oniguruma/release/onig.wasm');
  const wasm = await fs.readFile(wasmPath);
  await oniguruma.loadWASM(wasm.buffer);

  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner(patterns: string[]) {
        return new oniguruma.OnigScanner(patterns);
      },
      createOnigString(input: string) {
        return new oniguruma.OnigString(input);
      }
    }),
    async loadGrammar(scopeName): Promise<IRawGrammar | null> {
      if (scopeName !== 'source.http') {
        return null;
      }
      const content = await fs.readFile(GRAMMAR_PATH, 'utf8');
      return JSON.parse(content) as IRawGrammar;
    }
  });

  grammar = await registry.loadGrammar('source.http');
  if (!grammar) {
    throw new Error('Unable to load source.http grammar');
  }
});

function tokenizeFixture(content: string): TokenLine[] {
  if (!grammar) {
    throw new Error('Grammar not loaded');
  }

  let stack = INITIAL;
  const lines = content.split('\n');
  const tokensByLine: TokenLine[] = [];
  for (const line of lines) {
    const tokenized = grammar.tokenizeLine(line, stack);
    tokensByLine.push(tokenized.tokens);
    stack = tokenized.ruleStack;
  }
  return tokensByLine;
}

function findToken(tokens: TokenLine, text: string, line: string): TokenLine[number] | undefined {
  return tokens.find((token) => line.slice(token.startIndex, token.endIndex).includes(text));
}

function hasScope(token: TokenLine[number] | undefined, expectedScope: string): boolean {
  if (!token) return false;
  return token.scopes.some((scope) => scope === expectedScope);
}

describe('http.tmLanguage', () => {
  test('assigns core scopes for methods, directives, headers, variables, and JSON', async () => {
    const content = await fs.readFile(FIXTURE_PATH, 'utf8');
    const lines = content.split('\n');
    const tokensByLine = tokenizeFixture(content);

    const fileVarToken = findToken(tokensByLine[0] ?? [], '@host', lines[0] ?? '');
    expect(hasScope(fileVarToken, 'variable.other.file-variable.http')).toBe(true);

    const separatorToken = findToken(tokensByLine[1] ?? [], '###', lines[1] ?? '');
    expect(hasScope(separatorToken, 'comment.line.separator.http')).toBe(true);

    const directiveToken = findToken(tokensByLine[2] ?? [], '@name', lines[2] ?? '');
    expect(hasScope(directiveToken, 'keyword.other.directive.http')).toBe(true);

    const methodToken = findToken(tokensByLine[3] ?? [], 'GET', lines[3] ?? '');
    expect(hasScope(methodToken, 'keyword.other.method.http')).toBe(true);

    const urlToken = findToken(
      tokensByLine[3] ?? [],
      'https://api.example.test/users',
      lines[3] ?? ''
    );
    expect(hasScope(urlToken, 'string.other.url.http')).toBe(true);

    const headerToken = findToken(tokensByLine[4] ?? [], 'Authorization', lines[4] ?? '');
    expect(hasScope(headerToken, 'variable.other.property.header.http')).toBe(true);

    const templateVarToken = findToken(tokensByLine[4] ?? [], '{{token}}', lines[4] ?? '');
    expect(hasScope(templateVarToken, 'variable.other.template.http')).toBe(true);

    const resolverToken = findToken(tokensByLine[5] ?? [], '{{$uuid()}}', lines[5] ?? '');
    expect(hasScope(resolverToken, 'variable.other.resolver.http')).toBe(true);

    const jsonToken = findToken(tokensByLine[8] ?? [], '"ok"', lines[8] ?? '');
    expect(jsonToken?.scopes.some((scope) => scope.includes('meta.embedded.block.json'))).toBe(
      true
    );
  });

  test('handles resolver whitespace and avoids false resolver matches', () => {
    const content = [
      'GET https://api.example.test/users',
      'X-Resolver: {{$uuid() }}',
      'X-Template: {{ token }}',
      'X-NotResolver: {{ $uuid() }}',
      'X-Invalid: {{$}}'
    ].join('\n');

    const lines = content.split('\n');
    const tokensByLine = tokenizeFixture(content);

    const resolverWithSpace = findToken(tokensByLine[1] ?? [], '{{$uuid() }}', lines[1] ?? '');
    expect(hasScope(resolverWithSpace, 'variable.other.resolver.http')).toBe(true);

    const spacedTemplate = findToken(tokensByLine[2] ?? [], '{{ token }}', lines[2] ?? '');
    expect(hasScope(spacedTemplate, 'variable.other.template.http')).toBe(true);

    const spacedResolver = findToken(tokensByLine[3] ?? [], '{{ $uuid() }}', lines[3] ?? '');
    expect(hasScope(spacedResolver, 'variable.other.resolver.http')).toBe(true);

    const invalidResolver = findToken(tokensByLine[4] ?? [], '{{$}}', lines[4] ?? '');
    expect(hasScope(invalidResolver, 'variable.other.resolver.http')).toBe(false);
  });
});
