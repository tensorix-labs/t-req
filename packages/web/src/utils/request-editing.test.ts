import { describe, expect, test } from 'bun:test';
import {
  applyRequestEditsToContent,
  applySpanEditToContent,
  areRequestRowsEqual,
  buildUrlWithQueryRows,
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
    expect(cloned[0]).not.toBe(source[0]);
  });

  test('preserves hasValue metadata for params', () => {
    const source = [
      { key: 'flag', value: '', hasValue: false },
      { key: 'empty', value: '', hasValue: true }
    ];

    expect(cloneRequestRows(source)).toEqual(source);
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

  test('returns false when hasValue differs', () => {
    expect(
      areRequestRowsEqual(
        [{ key: 'flag', value: '', hasValue: false }],
        [{ key: 'flag', value: '', hasValue: true }]
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

  test('preserves inline comment position when rebuilding headers', () => {
    const content = [
      'GET https://api.example.com/health',
      'Accept: application/json',
      '# auth token',
      'Authorization: Bearer old-token',
      '',
      '{"ok":true}'
    ].join('\n');

    const result = applyRequestEditsToContent(content, 0, 'https://api.example.com/health', [
      { key: 'Accept', value: 'text/plain' },
      { key: 'Authorization', value: 'Bearer new-token' }
    ]);

    expect(result).toEqual({
      ok: true,
      content: [
        'GET https://api.example.com/health',
        'Accept: text/plain',
        '# auth token',
        'Authorization: Bearer new-token',
        '',
        '{"ok":true}'
      ].join('\n')
    });
  });

  test('trims header values when normalizing edited rows', () => {
    const content = ['GET https://api.example.com/health', 'Accept: old', '', '{"ok":true}'].join(
      '\n'
    );

    const result = applyRequestEditsToContent(content, 0, 'https://api.example.com/health', [
      { key: 'Accept', value: ' application/json ' }
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

describe('applySpanEditToContent', () => {
  test('rewrites content inside the provided span', () => {
    const content = ['GET https://api.example.com/users', '', '{"name":"old"}'].join('\n');
    const startOffset = content.indexOf('{"name":"old"}');
    const endOffset = startOffset + '{"name":"old"}'.length;

    const result = applySpanEditToContent(content, { startOffset, endOffset }, '{"name":"new"}');

    expect(result).toEqual({
      ok: true,
      content: ['GET https://api.example.com/users', '', '{"name":"new"}'].join('\n')
    });
  });

  test('returns an error when span bounds are invalid', () => {
    const result = applySpanEditToContent(
      'GET https://api.example.com/users',
      {
        startOffset: 5,
        endOffset: 999
      },
      'replacement'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('out of bounds');
    }
  });
});

describe('buildUrlWithQueryRows', () => {
  test('replaces the existing query string with edited params', () => {
    expect(
      buildUrlWithQueryRows('https://api.example.com/users?tag=one&page=1', [
        { key: 'tag', value: 'two', hasValue: true },
        { key: 'page', value: '2', hasValue: true }
      ])
    ).toBe('https://api.example.com/users?tag=two&page=2');
  });

  test('preserves hash fragments while updating params', () => {
    expect(
      buildUrlWithQueryRows('https://api.example.com/search?q=one#results', [
        { key: 'q', value: 'two words', hasValue: true }
      ])
    ).toBe('https://api.example.com/search?q=two%20words#results');
  });

  test('preserves flag params without forcing an equals sign', () => {
    expect(
      buildUrlWithQueryRows('https://api.example.com/search?flag&empty=', [
        { key: 'flag', value: '', hasValue: false },
        { key: 'empty', value: '', hasValue: true }
      ])
    ).toBe('https://api.example.com/search?flag&empty=');
  });

  test('drops blank param names', () => {
    expect(
      buildUrlWithQueryRows('https://api.example.com/search?existing=1', [
        { key: ' ', value: 'ignored', hasValue: true },
        { key: 'page', value: '1', hasValue: true }
      ])
    ).toBe('https://api.example.com/search?page=1');
  });

  test('preserves template expressions in query values', () => {
    expect(
      buildUrlWithQueryRows('https://api.example.com/search', [
        { key: 't', value: '{{$timestamp()}}', hasValue: true }
      ])
    ).toBe('https://api.example.com/search?t={{$timestamp()}}');
  });

  test('encodes surrounding text while preserving template expressions', () => {
    expect(
      buildUrlWithQueryRows('https://api.example.com/search', [
        { key: 'q', value: 'before {{user.id}} after', hasValue: true }
      ])
    ).toBe('https://api.example.com/search?q=before%20{{user.id}}%20after');
  });
});
