import { describe, expect, it } from 'bun:test';
import {
  formatDuration,
  formatElapsed,
  formatTime,
  prettyPrintJson
} from '../../../src/tui/util/format';

describe('formatTime', () => {
  it('formats a timestamp as HH:MM:SS.mmm', () => {
    // 2024-01-15T10:30:45.123Z — use local Date to avoid timezone issues
    const d = new Date(2024, 0, 15, 10, 30, 45, 123);
    expect(formatTime(d.getTime())).toBe('10:30:45.123');
  });

  it('pads single-digit values with zeros', () => {
    const d = new Date(2024, 0, 1, 1, 2, 3, 7);
    expect(formatTime(d.getTime())).toBe('01:02:03.007');
  });

  it('handles midnight', () => {
    const d = new Date(2024, 0, 1, 0, 0, 0, 0);
    expect(formatTime(d.getTime())).toBe('00:00:00.000');
  });
});

describe('formatElapsed', () => {
  it('returns empty string when startedAt is undefined', () => {
    expect(formatElapsed(undefined, undefined)).toBe('');
  });

  it('returns empty string when startedAt is 0', () => {
    expect(formatElapsed(0, undefined)).toBe('');
  });

  it('formats seconds only', () => {
    const start = 1000;
    const end = 46000; // 45 seconds later
    expect(formatElapsed(start, end)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    const start = 1000;
    const end = 1000 + 125000; // 2m 5s later
    expect(formatElapsed(start, end)).toBe('2m 5s');
  });

  it('returns 0s for zero elapsed time', () => {
    const ts = 1000;
    expect(formatElapsed(ts, ts)).toBe('0s');
  });
});

describe('formatDuration', () => {
  it('returns empty string by default when ms is undefined', () => {
    expect(formatDuration(undefined)).toBe('');
  });

  it('returns custom emptyValue when ms is undefined', () => {
    expect(formatDuration(undefined, { emptyValue: 'N/A' })).toBe('N/A');
  });

  it('formats milliseconds for values under 1000', () => {
    expect(formatDuration(450)).toBe('450ms');
  });

  it('rounds milliseconds', () => {
    expect(formatDuration(123.7)).toBe('124ms');
  });

  it('formats seconds with default precision of 1', () => {
    expect(formatDuration(2345)).toBe('2.3s');
  });

  it('formats seconds with custom precision of 2', () => {
    expect(formatDuration(2345, { precision: 2 })).toBe('2.35s');
  });

  it('formats exactly 1000ms as seconds', () => {
    expect(formatDuration(1000)).toBe('1.0s');
  });

  it('handles 0ms', () => {
    expect(formatDuration(0)).toBe('0ms');
  });
});

describe('prettyPrintJson', () => {
  it('pretty-prints valid JSON', () => {
    expect(prettyPrintJson('{"a":1,"b":2}')).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  it('returns original string for invalid JSON', () => {
    expect(prettyPrintJson('not json')).toBe('not json');
  });

  it('handles JSON arrays', () => {
    expect(prettyPrintJson('[1,2,3]')).toBe('[\n  1,\n  2,\n  3\n]');
  });

  it('handles empty object', () => {
    expect(prettyPrintJson('{}')).toBe('{}');
  });

  it('handles nested JSON', () => {
    const input = '{"a":{"b":"c"}}';
    const expected = '{\n  "a": {\n    "b": "c"\n  }\n}';
    expect(prettyPrintJson(input)).toBe(expected);
  });
});
