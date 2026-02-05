import { describe, expect, test } from 'bun:test';
import { formatSSEMessage } from '../../src/server/sse-format';

describe('formatSSEMessage', () => {
  test('formats simple data message', () => {
    const formatted = formatSSEMessage({ data: 'hello' });
    expect(formatted).toBe('data: hello\n\n');
  });

  test('formats message with event type', () => {
    const formatted = formatSSEMessage({ event: 'update', data: 'payload' });
    expect(formatted).toBe('event: update\ndata: payload\n\n');
  });

  test('formats message with id', () => {
    const formatted = formatSSEMessage({ id: 'msg-001', data: 'payload' });
    expect(formatted).toBe('id: msg-001\ndata: payload\n\n');
  });

  test('formats message with retry', () => {
    const formatted = formatSSEMessage({ retry: 5000, data: 'payload' });
    expect(formatted).toBe('retry: 5000\ndata: payload\n\n');
  });

  test('formats message with all fields', () => {
    const formatted = formatSSEMessage({
      event: 'message',
      id: 'msg-001',
      retry: 3000,
      data: '{"status":"ok"}'
    });
    expect(formatted).toBe('event: message\nid: msg-001\nretry: 3000\ndata: {"status":"ok"}\n\n');
  });

  test('handles multi-line data correctly', () => {
    const formatted = formatSSEMessage({
      event: 'message',
      data: 'line1\nline2\nline3'
    });
    expect(formatted).toBe('event: message\ndata: line1\ndata: line2\ndata: line3\n\n');
  });

  test('handles data with JSON containing newlines', () => {
    const json = JSON.stringify({ key: 'value' }, null, 2);
    const formatted = formatSSEMessage({ data: json });

    const lines = formatted.split('\n');
    // Every non-empty line before the final blank line should start with "data: "
    const dataLines = lines.slice(0, -2); // exclude trailing \n\n
    for (const line of dataLines) {
      expect(line.startsWith('data: ')).toBe(true);
    }
  });

  test('handles data with empty lines in between', () => {
    const formatted = formatSSEMessage({ data: 'before\n\nafter' });
    expect(formatted).toBe('data: before\ndata: \ndata: after\n\n');
  });

  test('handles single-line data without modification', () => {
    const formatted = formatSSEMessage({ data: 'single line' });
    expect(formatted).toBe('data: single line\n\n');
  });
});
