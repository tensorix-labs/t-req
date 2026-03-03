import { describe, expect, test } from 'bun:test';
import { cloneFormDataFields, serializeFormDataBody } from './request-form-data';

describe('cloneFormDataFields', () => {
  test('returns a deep copy of fields', () => {
    const source = [
      { name: 'title', value: 'hello', isFile: false },
      { name: 'document', value: '', isFile: true, path: './payload.json', filename: 'payload' }
    ];

    const cloned = cloneFormDataFields(source);

    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);
  });
});

describe('serializeFormDataBody', () => {
  test('serializes text and file fields with parser-compatible syntax', () => {
    expect(
      serializeFormDataBody([
        { name: 'title', value: 'Quarterly Report', isFile: false },
        {
          name: 'document',
          value: '',
          isFile: true,
          path: './reports/q4.pdf',
          filename: 'annual-report.pdf'
        },
        { name: 'image', value: '', isFile: true, path: '@./images/logo.png' }
      ])
    ).toBe(
      [
        'title = Quarterly Report',
        'document = @./reports/q4.pdf | annual-report.pdf',
        'image = @./images/logo.png'
      ].join('\n')
    );
  });

  test('omits rows without names', () => {
    expect(
      serializeFormDataBody([
        { name: '   ', value: 'unused', isFile: false },
        { name: 'enabled', value: 'true', isFile: false }
      ])
    ).toBe('enabled = true');
  });

  test('normalizes file paths to parser-compatible syntax', () => {
    expect(
      serializeFormDataBody([
        { name: 'docA', value: '', isFile: true, path: 'reports/q4.pdf' },
        { name: 'docB', value: '', isFile: true, path: '/tmp/report.pdf' },
        { name: 'docC', value: '', isFile: true, path: '' },
        { name: 'docD', value: '', isFile: true, path: '{{filesDir}}/payload.json' }
      ])
    ).toBe(
      [
        'docA = @./reports/q4.pdf',
        'docB = @./tmp/report.pdf',
        'docC = @./',
        'docD = @{{filesDir}}/payload.json'
      ].join('\n')
    );
  });
});
