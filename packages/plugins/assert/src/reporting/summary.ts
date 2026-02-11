import type { AssertCheckReport, AssertSummaryReport } from '../domain/types';

export function buildSummaryReport(checks: AssertCheckReport[]): AssertSummaryReport {
  const failed = checks.filter((check) => check.passed === false).length;

  return {
    kind: 'assert',
    passed: failed === 0,
    total: checks.length,
    failed,
    checks
  };
}
