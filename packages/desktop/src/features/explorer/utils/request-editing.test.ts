import { describe, expect, it } from 'bun:test';
import {
  applyRequestEditsToContent,
  applySpanEditToContent,
  areRequestRowsEqual,
  buildUrlWithParams,
  cloneRequestRows,
  insertRequestBodyIntoContent
} from './request-editing';

describe('cloneRequestRows', () => {
  it('returns a deep copy of row data', () => {
    const source = [
      { key: 'limit', value: '100' },
      { key: 'sort', value: 'desc' }
    ];
    const cloned = cloneRequestRows(source);
    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);
  });
});

describe('areRequestRowsEqual', () => {
  it('returns true when row values and order match', () => {
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

  it('returns false when row values differ', () => {
    expect(
      areRequestRowsEqual(
        [{ key: 'Accept', value: 'application/json' }],
        [{ key: 'Accept', value: 'text/plain' }]
      )
    ).toBe(false);
  });
});

describe('buildUrlWithParams', () => {
  it('replaces query string and keeps hash fragments', () => {
    expect(
      buildUrlWithParams('https://api.example.com/users?limit=10#section', [
        { key: 'limit', value: '25' },
        { key: 'sort', value: 'desc' }
      ])
    ).toBe('https://api.example.com/users?limit=25&sort=desc#section');
  });

  it('removes query string when params are empty', () => {
    expect(buildUrlWithParams('https://api.example.com/users?limit=10', [])).toBe(
      'https://api.example.com/users'
    );
  });

  it('encodes params and filters empty keys', () => {
    expect(
      buildUrlWithParams('https://api.example.com/search', [
        { key: 'q', value: 'foo bar' },
        { key: 'name', value: 'José' },
        { key: '', value: 'unused' }
      ])
    ).toBe('https://api.example.com/search?q=foo%20bar&name=Jos%C3%A9');
  });

  it('rebuilds query params from the edited URL base and preserves hash fragments', () => {
    expect(
      buildUrlWithParams('{{baseUrl}}/users/me?limit=10#profile', [{ key: 'sort', value: 'desc' }])
    ).toBe('{{baseUrl}}/users/me?sort=desc#profile');
  });
});

describe('applyRequestEditsToContent', () => {
  it('rewrites selected request URL and headers while preserving body and other requests', () => {
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
      'https://api.example.com/users?limit=25&sort=desc',
      [
        { key: 'Accept', value: 'text/plain' },
        { key: 'X-Trace-Id', value: 'trace-123' }
      ]
    );

    expect(result).toEqual({
      ok: true,
      content: [
        'GET https://api.example.com/users?limit=25&sort=desc',
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

  it('supports adding headers to a request with no existing headers', () => {
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

  it('supports adding headers when request has no existing headers and no trailing lines', () => {
    const content = 'GET https://api.example.com/health';
    const result = applyRequestEditsToContent(content, 0, 'https://api.example.com/health', [
      { key: 'Accept', value: 'application/json' }
    ]);

    expect(result).toEqual({
      ok: true,
      content: ['GET https://api.example.com/health', 'Accept: application/json'].join('\n')
    });
  });

  it('preserves HTTP version suffix and CRLF endings', () => {
    const content = 'GET https://api.example.com/health HTTP/1.1\r\nAccept: */*\r\n';
    const result = applyRequestEditsToContent(
      content,
      0,
      'https://api.example.com/health?full=true',
      [{ key: 'Accept', value: 'application/json' }]
    );

    expect(result).toEqual({
      ok: true,
      content:
        'GET https://api.example.com/health?full=true HTTP/1.1\r\nAccept: application/json\r\n'
    });
  });

  it('returns an error when the request index does not exist', () => {
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

describe('applySpanEditToContent', () => {
  it('replaces the content inside the provided span', () => {
    const result = applySpanEditToContent('abc123xyz', { startOffset: 3, endOffset: 6 }, '---');
    expect(result).toEqual({ ok: true, content: 'abc---xyz' });
  });

  it('returns an error for out-of-bounds spans', () => {
    const result = applySpanEditToContent('abc', { startOffset: 1, endOffset: 10 }, 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('out of bounds');
    }
  });
});

describe('insertRequestBodyIntoContent', () => {
  it('inserts a new body for a request with no body', () => {
    const content = 'GET https://api.example.com/health';
    const result = insertRequestBodyIntoContent(content, 0, '{"ok":true}');

    expect(result).toEqual({
      ok: true,
      content: ['GET https://api.example.com/health', '', '{"ok":true}'].join('\n')
    });
  });

  it('inserts body before separators and preserves following requests', () => {
    const content = [
      'GET https://api.example.com/health',
      'Accept: application/json',
      '',
      '###',
      'POST https://api.example.com/login',
      '',
      '{"email":"person@example.com"}'
    ].join('\n');
    const result = insertRequestBodyIntoContent(content, 0, 'trace = true');

    expect(result).toEqual({
      ok: true,
      content: [
        'GET https://api.example.com/health',
        'Accept: application/json',
        '',
        'trace = true',
        '###',
        'POST https://api.example.com/login',
        '',
        '{"email":"person@example.com"}'
      ].join('\n')
    });
  });

  it('normalizes inserted body line endings for CRLF content', () => {
    const content = 'GET https://api.example.com/health HTTP/1.1\r\nAccept: */*\r\n';
    const result = insertRequestBodyIntoContent(content, 0, '{\n  "ok": true\n}');

    expect(result).toEqual({
      ok: true,
      content:
        'GET https://api.example.com/health HTTP/1.1\r\nAccept: */*\r\n\r\n{\r\n  "ok": true\r\n}'
    });
  });
});
