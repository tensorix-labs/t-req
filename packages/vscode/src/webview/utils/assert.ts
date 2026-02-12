export type AssertCheckReport = {
  expression: string;
  line?: number;
  target?: string;
  operator?: string;
  passed: boolean;
  message: string;
  code?: string;
  actual?: unknown;
  expected?: unknown;
};

export type AssertSummaryReport = {
  kind: 'assert';
  passed: boolean;
  total: number;
  failed: number;
  checks: AssertCheckReport[];
};

export function isAssertSummaryReport(data: unknown): data is AssertSummaryReport {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const record = data as Record<string, unknown>;
  return record.kind === 'assert' && Array.isArray(record.checks);
}
