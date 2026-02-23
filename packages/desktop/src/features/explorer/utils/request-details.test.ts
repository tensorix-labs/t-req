import { describe, expect, it } from 'bun:test';
import type { ParseDiagnostic, ParsedRequest, ParseRequestBlock } from './request-details';
import {
  findRequestBlock,
  formatDiagnosticLocation,
  toRequestBodySummary,
  toRequestHeaders,
  toRequestParams
} from './request-details';

function createParsedRequest(index: number, overrides: Partial<ParsedRequest> = {}): ParsedRequest {
  return {
    index,
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: {},
    hasBody: false,
    hasFormData: false,
    hasBodyFile: false,
    meta: {},
    ...overrides
  };
}

function createBlock(index: number, diagnostics: ParseDiagnostic[] = []): ParseRequestBlock {
  return {
    request: createParsedRequest(index),
    diagnostics
  };
}

function createDiagnostic(overrides: Partial<ParseDiagnostic> = {}): ParseDiagnostic {
  return {
    severity: 'warning',
    code: 'duplicate-header',
    message: 'Duplicate header',
    range: {
      start: { line: 2, column: 4 },
      end: { line: 2, column: 10 }
    },
    ...overrides
  };
}

describe('toRequestParams', () => {
  it('returns query parameters in order', () => {
    expect(toRequestParams('https://api.example.com/users?limit=100&sort=desc')).toEqual([
      { key: 'limit', value: '100' },
      { key: 'sort', value: 'desc' }
    ]);
  });

  it('decodes encoded values and supports params without values', () => {
    expect(toRequestParams('{{baseUrl}}/search?q=foo+bar&name=Jos%C3%A9&flag')).toEqual([
      { key: 'q', value: 'foo bar' },
      { key: 'name', value: 'José' },
      { key: 'flag', value: '' }
    ]);
  });

  it('returns empty array when URL has no query string', () => {
    expect(toRequestParams('https://api.example.com/users')).toEqual([]);
  });

  it('falls back to raw content for malformed encoded values', () => {
    expect(toRequestParams('https://api.example.com/users?name=%E0%A4%A')).toEqual([
      { key: 'name', value: '%E0%A4%A' }
    ]);
  });
});

describe('toRequestHeaders', () => {
  it('maps headers into table rows', () => {
    expect(toRequestHeaders({ Accept: 'application/json', Authorization: 'Bearer token' })).toEqual(
      [
        { key: 'Accept', value: 'application/json' },
        { key: 'Authorization', value: 'Bearer token' }
      ]
    );
  });
});

describe('findRequestBlock', () => {
  it('returns the block for the selected request index', () => {
    const block = createBlock(3);
    expect(findRequestBlock([createBlock(0), block], 3)).toBe(block);
  });

  it('returns undefined when the index is not found', () => {
    const blockWithoutRequest: ParseRequestBlock = {
      diagnostics: [createDiagnostic()]
    };
    expect(findRequestBlock([createBlock(0), blockWithoutRequest], 2)).toBe(undefined);
  });
});

describe('toRequestBodySummary', () => {
  it('returns none when body is not defined', () => {
    expect(toRequestBodySummary(createParsedRequest(0))).toEqual({
      kind: 'none',
      hasBody: false,
      hasFormData: false,
      hasBodyFile: false,
      description: 'No body is defined for this request.'
    });
  });

  it('returns inline summary when request has inline body', () => {
    expect(toRequestBodySummary(createParsedRequest(0, { hasBody: true }))).toEqual({
      kind: 'inline',
      hasBody: true,
      hasFormData: false,
      hasBodyFile: false,
      description: 'Request includes an inline body payload.'
    });
  });

  it('prioritizes form-data summary when form-data is present', () => {
    expect(
      toRequestBodySummary(createParsedRequest(0, { hasBody: true, hasFormData: true }))
    ).toEqual({
      kind: 'form-data',
      hasBody: true,
      hasFormData: true,
      hasBodyFile: false,
      description: 'Request includes form data fields.'
    });
  });

  it('returns combined form-data and file message when both are present', () => {
    expect(
      toRequestBodySummary(createParsedRequest(0, { hasFormData: true, hasBodyFile: true }))
    ).toEqual({
      kind: 'form-data',
      hasBody: false,
      hasFormData: true,
      hasBodyFile: true,
      description: 'Request includes form data fields and file references.'
    });
  });
});

describe('formatDiagnosticLocation', () => {
  it('formats zero-based diagnostic coordinates as human-readable locations', () => {
    expect(
      formatDiagnosticLocation(
        createDiagnostic({ range: { start: { line: 0, column: 0 }, end: { line: 0, column: 3 } } })
      )
    ).toBe('L1:C1');
  });
});
