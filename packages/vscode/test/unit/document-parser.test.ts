import { describe, expect, test } from 'bun:test';
import { findNearestRequestIndex, parseDocumentRequests } from '../../src/document-parser';

describe('document parser', () => {
  test('maps request lines while accounting for file variables', () => {
    const content = [
      '@host = https://example.test',
      '### List users',
      'GET {{host}}/users',
      'Authorization: Bearer {{token}}',
      '',
      '### Live stream',
      '# @sse',
      'GET https://example.test/events'
    ].join('\n');

    const parsed = parseDocumentRequests(content);
    expect(Object.keys(parsed.fileVariables)).toEqual(['host']);
    expect(parsed.requests).toHaveLength(2);

    const first = parsed.requests[0];
    expect(first?.name).toBe('List users');
    expect(first?.method).toBe('GET');
    expect(first?.startLine).toBe(2);
    expect(first?.methodLine).toBe(2);
    expect(first?.endLine).toBe(4);

    const second = parsed.requests[1];
    expect(second?.name).toBe('Live stream');
    expect(second?.protocol).toBe('sse');
    expect(second?.startLine).toBe(6);
    expect(second?.methodLine).toBe(7);
    expect(second?.endLine).toBe(7);
  });

  test('finds nearest request by cursor location', () => {
    const parsed = parseDocumentRequests(
      [
        '### One',
        'GET https://example.test/one',
        '',
        '### Two',
        'POST https://example.test/two'
      ].join('\n')
    );

    expect(findNearestRequestIndex(parsed.requests, 1)).toBe(0);
    expect(findNearestRequestIndex(parsed.requests, 4)).toBe(1);
    expect(findNearestRequestIndex(parsed.requests, 0)).toBe(0);
    expect(findNearestRequestIndex(parsed.requests, 100)).toBe(1);
  });
});
