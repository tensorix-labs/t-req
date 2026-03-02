import { describe, expect, test } from 'bun:test';
import type { ParsedRequest, ParseRequestBlock } from './request-details';
import {
  findRequestBlock,
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

function createBlock(index: number): ParseRequestBlock {
  return {
    request: createParsedRequest(index),
    diagnostics: []
  };
}

describe('toRequestParams', () => {
  test('returns params in order and keeps repeated keys', () => {
    expect(toRequestParams('https://api.example.com/users?tag=one&tag=two&page=1')).toEqual([
      { key: 'tag', value: 'one' },
      { key: 'tag', value: 'two' },
      { key: 'page', value: '1' }
    ]);
  });

  test('decodes encoded values and plus signs', () => {
    expect(toRequestParams('https://api.example.com/search?q=foo+bar&name=Jos%C3%A9')).toEqual([
      { key: 'q', value: 'foo bar' },
      { key: 'name', value: 'José' }
    ]);
  });

  test('supports params without values', () => {
    expect(toRequestParams('https://api.example.com/search?flag&empty=')).toEqual([
      { key: 'flag', value: '' },
      { key: 'empty', value: '' }
    ]);
  });

  test('returns empty array when URL has no query string', () => {
    expect(toRequestParams('https://api.example.com/users')).toEqual([]);
  });

  test('ignores hash fragments while parsing query string', () => {
    expect(toRequestParams('https://api.example.com/users?limit=50#section')).toEqual([
      { key: 'limit', value: '50' }
    ]);
  });

  test('falls back to raw content for malformed encoded values', () => {
    expect(toRequestParams('https://api.example.com/users?name=%E0%A4%A')).toEqual([
      { key: 'name', value: '%E0%A4%A' }
    ]);
  });
});

describe('toRequestHeaders', () => {
  test('maps headers into key/value rows', () => {
    expect(toRequestHeaders({ Accept: 'application/json', Authorization: 'Bearer token' })).toEqual(
      [
        { key: 'Accept', value: 'application/json' },
        { key: 'Authorization', value: 'Bearer token' }
      ]
    );
  });
});

describe('findRequestBlock', () => {
  test('returns the block for the selected request index', () => {
    const block = createBlock(3);
    expect(findRequestBlock([createBlock(0), block], 3)).toBe(block);
  });

  test('returns undefined when the request index is not found', () => {
    const blockWithoutRequest: ParseRequestBlock = {
      diagnostics: []
    };
    expect(findRequestBlock([createBlock(0), blockWithoutRequest], 2)).toBe(undefined);
  });
});

describe('toRequestBodySummary', () => {
  test('returns none when body is not defined', () => {
    expect(toRequestBodySummary(createParsedRequest(0))).toEqual({
      kind: 'none',
      hasBody: false,
      hasFormData: false,
      hasBodyFile: false,
      description: 'No body is defined for this request.'
    });
  });

  test('maps parsed inline body payload details', () => {
    expect(
      toRequestBodySummary(
        createParsedRequest(0, {
          hasBody: true,
          body: {
            kind: 'inline',
            text: '{\n  "name": "test"\n}',
            contentType: 'application/json',
            isJsonLike: true
          },
          spans: {
            block: { startOffset: 0, endOffset: 40 },
            requestLine: { startOffset: 0, endOffset: 20 },
            url: { startOffset: 4, endOffset: 20 },
            body: { startOffset: 25, endOffset: 40 }
          }
        })
      )
    ).toEqual({
      kind: 'inline',
      hasBody: true,
      hasFormData: false,
      hasBodyFile: false,
      description: 'Request includes an inline body payload.',
      text: '{\n  "name": "test"\n}',
      contentType: 'application/json',
      isJsonLike: true,
      spans: {
        block: { startOffset: 0, endOffset: 40 },
        requestLine: { startOffset: 0, endOffset: 20 },
        url: { startOffset: 4, endOffset: 20 },
        body: { startOffset: 25, endOffset: 40 }
      }
    });
  });

  test('returns form-data summary when form-data is present', () => {
    expect(
      toRequestBodySummary(
        createParsedRequest(0, {
          hasFormData: true,
          body: {
            kind: 'form-data',
            fields: [
              { name: 'name', value: 'Andrew', isFile: false },
              { name: 'avatar', value: 'avatar.png', isFile: true, path: './avatar.png' }
            ],
            contentType: 'multipart/form-data'
          }
        })
      )
    ).toEqual({
      kind: 'form-data',
      hasBody: false,
      hasFormData: true,
      hasBodyFile: false,
      description: 'Request includes form data fields and file references.',
      fields: [
        { name: 'name', value: 'Andrew', isFile: false },
        { name: 'avatar', value: 'avatar.png', isFile: true, path: './avatar.png' }
      ],
      contentType: 'multipart/form-data'
    });
  });

  test('returns empty form-data description when parsed form-data has no fields', () => {
    expect(
      toRequestBodySummary(
        createParsedRequest(0, {
          hasFormData: true,
          body: {
            kind: 'form-data',
            fields: []
          }
        })
      )
    ).toEqual({
      kind: 'form-data',
      hasBody: false,
      hasFormData: true,
      hasBodyFile: false,
      description: 'No form-data fields were parsed for this request.',
      fields: []
    });
  });

  test('returns empty form-data description for defensive hasFormData + hasBodyFile fallback', () => {
    expect(
      toRequestBodySummary(
        createParsedRequest(0, {
          hasFormData: true,
          hasBodyFile: true
        })
      )
    ).toEqual({
      kind: 'form-data',
      hasBody: false,
      hasFormData: true,
      hasBodyFile: true,
      fields: [],
      description: 'No form-data fields were parsed for this request.'
    });
  });

  test('returns file summary when request body is loaded from a file', () => {
    expect(
      toRequestBodySummary(
        createParsedRequest(0, {
          hasBodyFile: true,
          body: {
            kind: 'file',
            path: './payload.json',
            contentType: 'application/json'
          }
        })
      )
    ).toEqual({
      kind: 'file',
      hasBody: false,
      hasFormData: false,
      hasBodyFile: true,
      description: 'Request body is loaded from a file reference.',
      filePath: './payload.json',
      contentType: 'application/json'
    });
  });

  test('returns unavailable description when hasBody is true without parsed inline text', () => {
    expect(
      toRequestBodySummary(
        createParsedRequest(0, {
          hasBody: true
        })
      )
    ).toEqual({
      kind: 'inline',
      hasBody: true,
      hasFormData: false,
      hasBodyFile: false,
      description: 'Request body content is unavailable for this request.'
    });
  });
});
