import { describe, expect, test } from 'bun:test';
import {
  analyzeParsedContent,
  DiagnosticCodes,
  getDiagnosticsForBlock,
  parseBlocks
} from '../../src/server/diagnostics';
import type { Diagnostic } from '../../src/server/schemas';

describe('parseBlocks', () => {
  test('should parse single block', () => {
    const content = 'GET https://example.com\n';
    const blocks = parseBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.startLine).toBe(0);
  });

  test('should parse multiple blocks separated by ###', () => {
    const content = `GET https://example.com/first

###

GET https://example.com/second`;
    const blocks = parseBlocks(content);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.startLine).toBe(0);
    // Block starts immediately after separator line (line 2), so at line 3
    expect(blocks[1]?.startLine).toBe(3);
  });

  test('should handle empty content', () => {
    const blocks = parseBlocks('');
    expect(blocks).toHaveLength(0);
  });
});

describe('analyzeParsedContent - unclosed variables', () => {
  test('should detect unclosed variable {{', () => {
    const content = 'GET https://example.com/{{id';
    const diagnostics = analyzeParsedContent(content);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe(DiagnosticCodes.UNCLOSED_VARIABLE);
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.message).toContain('missing }}');
  });

  test('should not flag properly closed variables', () => {
    const content = 'GET https://example.com/{{id}}';
    const diagnostics = analyzeParsedContent(content);

    const unclosed = diagnostics.filter((d) => d.code === DiagnosticCodes.UNCLOSED_VARIABLE);
    expect(unclosed).toHaveLength(0);
  });

  test('should detect multiple unclosed variables', () => {
    const content = 'GET https://{{host}/{{path';
    const diagnostics = analyzeParsedContent(content);

    const unclosed = diagnostics.filter((d) => d.code === DiagnosticCodes.UNCLOSED_VARIABLE);
    expect(unclosed).toHaveLength(2);
  });
});

describe('analyzeParsedContent - empty variables', () => {
  test('should detect empty variable {{}}', () => {
    const content = 'GET https://example.com/{{}}';
    const diagnostics = analyzeParsedContent(content);

    expect(diagnostics.some((d) => d.code === DiagnosticCodes.EMPTY_VARIABLE)).toBe(true);
    const emptyVar = diagnostics.find((d) => d.code === DiagnosticCodes.EMPTY_VARIABLE);
    expect(emptyVar?.severity).toBe('warning');
  });

  test('should detect empty variable with whitespace {{ }}', () => {
    const content = 'GET https://example.com/{{ }}';
    const diagnostics = analyzeParsedContent(content);

    expect(diagnostics.some((d) => d.code === DiagnosticCodes.EMPTY_VARIABLE)).toBe(true);
  });

  test('should not flag non-empty variables', () => {
    const content = 'GET https://example.com/{{id}}';
    const diagnostics = analyzeParsedContent(content);

    expect(diagnostics.some((d) => d.code === DiagnosticCodes.EMPTY_VARIABLE)).toBe(false);
  });
});

describe('analyzeParsedContent - missing URL', () => {
  test('should detect method without URL', () => {
    const content = 'GET';
    const diagnostics = analyzeParsedContent(content);

    expect(diagnostics.some((d) => d.code === DiagnosticCodes.MISSING_URL)).toBe(true);
    const missingUrl = diagnostics.find((d) => d.code === DiagnosticCodes.MISSING_URL);
    expect(missingUrl?.severity).toBe('error');
    expect(missingUrl?.message).toContain('GET');
  });

  test('should detect POST without URL', () => {
    const content = 'POST  ';
    const diagnostics = analyzeParsedContent(content);

    expect(diagnostics.some((d) => d.code === DiagnosticCodes.MISSING_URL)).toBe(true);
  });

  test('should not flag method with URL', () => {
    const content = 'GET https://example.com';
    const diagnostics = analyzeParsedContent(content);

    expect(diagnostics.some((d) => d.code === DiagnosticCodes.MISSING_URL)).toBe(false);
  });
});

describe('analyzeParsedContent - invalid method', () => {
  test('should detect typo DELTE', () => {
    const content = 'DELTE https://example.com';
    const diagnostics = analyzeParsedContent(content);

    expect(diagnostics.some((d) => d.code === DiagnosticCodes.INVALID_METHOD)).toBe(true);
    const invalid = diagnostics.find((d) => d.code === DiagnosticCodes.INVALID_METHOD);
    expect(invalid?.severity).toBe('warning');
    expect(invalid?.message).toContain('DELETE');
  });

  test('should detect typo PSOT', () => {
    const content = 'PSOT https://example.com';
    const diagnostics = analyzeParsedContent(content);

    const invalid = diagnostics.find((d) => d.code === DiagnosticCodes.INVALID_METHOD);
    expect(invalid?.message).toContain('POST');
  });

  test('should detect unknown method without suggestion', () => {
    const content = 'FETCH https://example.com';
    const diagnostics = analyzeParsedContent(content);

    const invalid = diagnostics.find((d) => d.code === DiagnosticCodes.INVALID_METHOD);
    expect(invalid).toBeDefined();
    expect(invalid?.message).toContain("Invalid HTTP method 'FETCH'");
  });

  test('should not flag valid methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    for (const method of methods) {
      const content = `${method} https://example.com`;
      const diagnostics = analyzeParsedContent(content);
      expect(diagnostics.some((d) => d.code === DiagnosticCodes.INVALID_METHOD)).toBe(false);
    }
  });
});

describe('analyzeParsedContent - duplicate headers', () => {
  test('should detect duplicate headers', () => {
    const content = `GET https://example.com
Content-Type: application/json
Accept: text/plain
Content-Type: text/xml`;
    const diagnostics = analyzeParsedContent(content);

    expect(diagnostics.some((d) => d.code === DiagnosticCodes.DUPLICATE_HEADER)).toBe(true);
    const dup = diagnostics.find((d) => d.code === DiagnosticCodes.DUPLICATE_HEADER);
    expect(dup?.severity).toBe('warning');
    expect(dup?.message).toContain('Content-Type');
  });

  test('should be case-insensitive for header names', () => {
    const content = `GET https://example.com
Content-Type: application/json
content-type: text/xml`;
    const diagnostics = analyzeParsedContent(content);

    expect(diagnostics.some((d) => d.code === DiagnosticCodes.DUPLICATE_HEADER)).toBe(true);
  });

  test('should not flag unique headers', () => {
    const content = `GET https://example.com
Content-Type: application/json
Accept: text/plain`;
    const diagnostics = analyzeParsedContent(content);

    expect(diagnostics.some((d) => d.code === DiagnosticCodes.DUPLICATE_HEADER)).toBe(false);
  });

  test('should track duplicates per block', () => {
    const content = `GET https://example.com/first
Content-Type: application/json

###

GET https://example.com/second
Content-Type: application/json`;
    const diagnostics = analyzeParsedContent(content);

    // Same header in different blocks should not be flagged
    expect(diagnostics.some((d) => d.code === DiagnosticCodes.DUPLICATE_HEADER)).toBe(false);
  });
});

describe('analyzeParsedContent - malformed headers', () => {
  test('should detect header without colon', () => {
    const content = `GET https://example.com
Authorization Bearer token`;
    const diagnostics = analyzeParsedContent(content);

    expect(diagnostics.some((d) => d.code === DiagnosticCodes.MALFORMED_HEADER)).toBe(true);
    const malformed = diagnostics.find((d) => d.code === DiagnosticCodes.MALFORMED_HEADER);
    expect(malformed?.severity).toBe('error');
  });

  test('should not flag valid headers', () => {
    const content = `GET https://example.com
Authorization: Bearer token
Content-Type: application/json`;
    const diagnostics = analyzeParsedContent(content);

    expect(diagnostics.some((d) => d.code === DiagnosticCodes.MALFORMED_HEADER)).toBe(false);
  });

  test('should not flag body content', () => {
    const content = `POST https://example.com
Content-Type: application/json

{"key": "value"}`;
    const diagnostics = analyzeParsedContent(content);

    expect(diagnostics.some((d) => d.code === DiagnosticCodes.MALFORMED_HEADER)).toBe(false);
  });
});

describe('getDiagnosticsForBlock', () => {
  test('should filter diagnostics by block range', () => {
    const diagnostics: Diagnostic[] = [
      {
        severity: 'error',
        code: 'test-1',
        message: 'Error in first block',
        range: { start: { line: 0, column: 0 }, end: { line: 0, column: 10 } }
      },
      {
        severity: 'warning',
        code: 'test-2',
        message: 'Warning in second block',
        range: { start: { line: 5, column: 0 }, end: { line: 5, column: 10 } }
      }
    ];

    const block = { startLine: 0, endLine: 2, startOffset: 0, endOffset: 50 };
    const filtered = getDiagnosticsForBlock(diagnostics, block);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.code).toBe('test-1');
  });
});

describe('analyzeParsedContent - options', () => {
  test('should return empty when includeDiagnostics is false', () => {
    const content = 'GET {{id';
    const diagnostics = analyzeParsedContent(content, { includeDiagnostics: false });

    expect(diagnostics).toHaveLength(0);
  });

  test('should return diagnostics when includeDiagnostics is true', () => {
    const content = 'GET {{id';
    const diagnostics = analyzeParsedContent(content, { includeDiagnostics: true });

    expect(diagnostics.length).toBeGreaterThan(0);
  });
});

describe('analyzeParsedContent - position accuracy', () => {
  test('should report correct line and column for error', () => {
    const content = `GET https://example.com
Content-Type: application/json

POST`;
    const diagnostics = analyzeParsedContent(content);

    const missingUrl = diagnostics.find((d) => d.code === DiagnosticCodes.MISSING_URL);
    expect(missingUrl).toBeDefined();
    expect(missingUrl?.range.start.line).toBe(3);
    expect(missingUrl?.range.start.column).toBe(0);
  });

  test('should sort diagnostics by position', () => {
    const content = `GET {{
POST`;
    const diagnostics = analyzeParsedContent(content);

    // Should be sorted by line, then column
    for (let i = 1; i < diagnostics.length; i++) {
      const prev = diagnostics[i - 1];
      const curr = diagnostics[i];
      if (!prev || !curr) continue;

      const prevPos = prev.range.start.line * 10000 + prev.range.start.column;
      const currPos = curr.range.start.line * 10000 + curr.range.start.column;
      expect(currPos).toBeGreaterThanOrEqual(prevPos);
    }
  });
});
