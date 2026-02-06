/**
 * Format a timestamp as HH:MM:SS.mmm
 */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Format elapsed time between two timestamps as "Xm Ys" or "Xs".
 * Uses Date.now() as end when endedAt is not provided.
 */
export function formatElapsed(startedAt: number | undefined, endedAt: number | undefined): string {
  if (!startedAt) return '';
  const end = endedAt ?? Date.now();
  const totalSec = Math.floor((end - startedAt) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min}m ${sec}s`;
  return `${sec}s`;
}

export interface FormatDurationOptions {
  precision?: number;
  emptyValue?: string;
}

/**
 * Format a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms?: number, opts?: FormatDurationOptions): string {
  const { precision = 1, emptyValue = '' } = opts ?? {};
  if (ms === undefined) return emptyValue;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(precision)}s`;
}

/**
 * Pretty-print a JSON string. Returns the original string if parsing fails.
 */
export function prettyPrintJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
