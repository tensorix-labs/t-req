import { describe, expect, test } from 'bun:test';
import {
  applyRequestEditsToContent,
  areRequestRowsEqual,
  cloneRequestRows
} from './request-editing';

describe('cloneRequestRows', () => {
  test('returns a deep copy of row data', () => {
    const source = [
      { key: 'Accept', value: 'application/json' },
      { key: 'X-Trace', value: 'trace-1' }
    ];
    const cloned = cloneRequestRows(source);
    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);
  });
});

describe('areRequestRowsEqual', () => {
  test('returns true when row values and order match', () => {
    expect(
      areRequestRowsEqual(
        [
          { key: 'Accept', value: 'application/json' },
          { key: 'X-Trace', value: '1' }
        ],
        [
          { key: 'Accept', value: 'application/json' },
          { key: 'X-Trace', value: '1' }
        ]
      )
    ).toBe(true);
  });

  test('returns false when row values differ', () => {
    expect(
      areRequestRowsEqual(
        [{ key: 'Accept', value: 'application/json' }],
        [{ key: 'Accept', value: 'text/plain' }]
      )
    ).toBe(false);
  });
});

describe('applyRequestEditsToContent', () => {
  test('rewrites selected request URL and headers while preserving body and other requests', () => {
    const content = [
      'GET https://api.example.com/users?limit=10',
      'Accept: application/json',
      'Authorization: Bearer old-token',
      '',
      '{"cursor":"abc"}',
      '###',
      'POST https://api.example.com/login',
      'Content-Type: application/json',
      '',
      '{"email":"person@example.com"}'
    ].join('\n');

    const result = applyRequestEditsToContent(
      content,
      0,
      'https://api.example.com/users?limit=10',
      [
        { key: 'Accept', value: 'text/plain' },
        { key: 'X-Trace-Id', value: 'trace-123' }
      ]
    );

    expect(result).toEqual({
      ok: true,
      content: [
        'GET https://api.example.com/users?limit=10',
        'Accept: text/plain',
        'X-Trace-Id: trace-123',
        '',
        '{"cursor":"abc"}',
        '###',
        'POST https://api.example.com/login',
        'Content-Type: application/json',
        '',
        '{"email":"person@example.com"}'
      ].join('\n')
    });
  });

  test('supports adding headers to a request with no existing headers', () => {
    const content = ['GET https://api.example.com/health', '', '{"ok":true}'].join('\n');
    const result = applyRequestEditsToContent(content, 0, 'https://api.example.com/health', [
      { key: 'Accept', value: 'application/json' }
    ]);

    expect(result).toEqual({
      ok: true,
      content: [
        'GET https://api.example.com/health',
        'Accept: application/json',
        '',
        '{"ok":true}'
      ].join('\n')
    });
  });

  test('supports removing all headers from the selected request', () => {
    const content = [
      'GET https://api.example.com/health',
      'Accept: application/json',
      'X-Trace-Id: trace-1',
      '',
      '{"ok":true}'
    ].join('\n');
    const result = applyRequestEditsToContent(content, 0, 'https://api.example.com/health', []);

    expect(result).toEqual({
      ok: true,
      content: ['GET https://api.example.com/health', '', '{"ok":true}'].join('\n')
    });
  });

  test('rewrites header block correctly when comment lines are present', () => {
    const content = [
      'GET https://api.example.com/health',
      'Accept: application/json',
      '# inline comment',
      'X-Trace-Id: trace-1',
      '',
      '{"ok":true}'
    ].join('\n');
    const result = applyRequestEditsToContent(content, 0, 'https://api.example.com/health', [
      { key: 'Authorization', value: 'Bearer token' }
    ]);

    expect(result).toEqual({
      ok: true,
      content: [
        'GET https://api.example.com/health',
        'Authorization: Bearer token',
        '# inline comment',
        '',
        '{"ok":true}'
      ].join('\n')
    });
  });

  test('ignores non-HTTP body lines when locating request segments', () => {
    const content = [
      'GET https://api.example.com/one',
      'Accept: application/json',
      '',
      'token abc',
      '',
      'POST https://api.example.com/two',
      'Content-Type: application/json',
      '',
      '{"email":"person@example.com"}'
    ].join('\n');

    const result = applyRequestEditsToContent(content, 1, 'https://api.example.com/two-updated', [
      { key: 'X-Trace-Id', value: 'trace-123' }
    ]);

    expect(result).toEqual({
      ok: true,
      content: [
        'GET https://api.example.com/one',
        'Accept: application/json',
        '',
        'token abc',
        '',
        'POST https://api.example.com/two-updated',
        'X-Trace-Id: trace-123',
        '',
        '{"email":"person@example.com"}'
      ].join('\n')
    });
  });

  test('removes URL continuation lines before rebuilding headers', () => {
    const content = [
      'GET https://api.example.com/search',
      '  ?q=old',
      '  &page=1',
      'Accept: application/json',
      'X-Trace-Id: old',
      '',
      '{"keep":true}'
    ].join('\n');

    const result = applyRequestEditsToContent(
      content,
      0,
      'https://api.example.com/search?q=new&page=2',
      [{ key: 'Authorization', value: 'Bearer token' }]
    );

    expect(result).toEqual({
      ok: true,
      content: [
        'GET https://api.example.com/search?q=new&page=2',
        'Authorization: Bearer token',
        '',
        '{"keep":true}'
      ].join('\n')
    });
  });

  test('returns an error when the request index does not exist', () => {
    const result = applyRequestEditsToContent(
      'GET https://api.example.com/health',
      3,
      'https://api.example.com/health',
      []
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('could not be located');
    }
  });
});
