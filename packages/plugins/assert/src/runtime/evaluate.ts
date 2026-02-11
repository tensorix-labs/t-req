import deepEqual from 'fast-deep-equal';
import { JSONPath } from 'jsonpath-plus';
import type {
  AssertCheckReport,
  AssertDiagnosticCode,
  ParsedAssertion,
  StatusOperator
} from '../domain/types';
import type { createBodyReader } from './body-reader';

function compareStatus(operator: StatusOperator, actual: number, expected: number): boolean {
  switch (operator) {
    case '==':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '>':
      return actual > expected;
    case '>=':
      return actual >= expected;
    case '<':
      return actual < expected;
    case '<=':
      return actual <= expected;
  }
}

function toMessage(assertion: ParsedAssertion): string {
  switch (assertion.target) {
    case 'status':
      return `status ${assertion.operator} ${assertion.expected}`;
    case 'header':
      return assertion.operator === 'exists'
        ? `header ${assertion.headerName} exists`
        : `header ${assertion.headerName} ${assertion.operator} ${assertion.expected ?? ''}`.trim();
    case 'body':
      return `body ${assertion.operator} ${assertion.expected}`;
    case 'jsonpath':
      return assertion.operator === 'exists'
        ? `jsonpath ${assertion.path} exists`
        : `jsonpath ${assertion.path} ${assertion.operator} ${JSON.stringify(assertion.expected)}`;
  }
}

function failureCode(passed: boolean): { code?: AssertDiagnosticCode } {
  return passed ? {} : { code: 'assert.failed' };
}

export async function evaluateAssertion(
  parsed: ParsedAssertion,
  response: Response,
  bodyReader: ReturnType<typeof createBodyReader>
): Promise<Omit<AssertCheckReport, 'expression' | 'line'>> {
  switch (parsed.target) {
    case 'status': {
      const actual = response.status;
      const passed = compareStatus(parsed.operator, actual, parsed.expected);
      return {
        target: parsed.target,
        operator: parsed.operator,
        passed,
        message: passed
          ? `Passed: ${toMessage(parsed)}`
          : `Expected status ${parsed.operator} ${parsed.expected}, got ${actual}`,
        ...failureCode(passed),
        actual,
        expected: parsed.expected
      };
    }

    case 'header': {
      const actual = response.headers.get(parsed.headerName);

      if (parsed.operator === 'exists') {
        const passed = actual !== null;
        return {
          target: parsed.target,
          operator: parsed.operator,
          passed,
          message: passed
            ? `Passed: ${toMessage(parsed)}`
            : `Expected header "${parsed.headerName}" to exist`,
          ...failureCode(passed),
          actual
        };
      }

      if (actual === null) {
        return {
          target: parsed.target,
          operator: parsed.operator,
          passed: false,
          message: `Header "${parsed.headerName}" was not present`,
          code: 'assert.failed',
          actual,
          expected: parsed.expected
        };
      }

      let passed = false;
      switch (parsed.operator) {
        case '==':
          passed = actual === parsed.expected;
          break;
        case '!=':
          passed = actual !== parsed.expected;
          break;
        case 'contains':
          passed = actual.includes(parsed.expected ?? '');
          break;
      }

      return {
        target: parsed.target,
        operator: parsed.operator,
        passed,
        message: passed
          ? `Passed: ${toMessage(parsed)}`
          : `Header "${parsed.headerName}" assertion failed`,
        ...failureCode(passed),
        actual,
        expected: parsed.expected
      };
    }

    case 'body': {
      const body = await bodyReader.getText();
      const expected = parsed.expected;
      const passed =
        parsed.operator === 'contains' ? body.includes(expected) : !body.includes(expected);

      return {
        target: parsed.target,
        operator: parsed.operator,
        passed,
        message: passed
          ? `Passed: ${toMessage(parsed)}`
          : `Body assertion failed for "${expected}"`,
        ...failureCode(passed),
        actual: body,
        expected
      };
    }

    case 'jsonpath': {
      const parsedBody = await bodyReader.getJson();
      if (parsedBody.error !== undefined) {
        return {
          target: parsed.target,
          operator: parsed.operator,
          passed: false,
          message: `JSON parsing failed before evaluating jsonpath: ${parsedBody.error}`,
          code: 'assert.failed'
        };
      }

      let matches: unknown[] = [];
      try {
        matches = JSONPath({
          path: parsed.path,
          json: parsedBody.value ?? null,
          wrap: true
        }) as unknown[];
      } catch (err) {
        return {
          target: parsed.target,
          operator: parsed.operator,
          passed: false,
          message: `Invalid JSONPath expression "${parsed.path}": ${
            err instanceof Error ? err.message : String(err)
          }`,
          code: 'assert.invalid-jsonpath'
        };
      }

      if (parsed.operator === 'exists') {
        const passed = matches.length > 0;
        return {
          target: parsed.target,
          operator: parsed.operator,
          passed,
          message: passed
            ? `Passed: ${toMessage(parsed)}`
            : `Expected jsonpath "${parsed.path}" to return at least one value`,
          ...failureCode(passed),
          actual: matches
        };
      }

      if (parsed.operator === '==') {
        const passed = matches.some((match) => deepEqual(match, parsed.expected));
        return {
          target: parsed.target,
          operator: parsed.operator,
          passed,
          message: passed
            ? `Passed: ${toMessage(parsed)}`
            : `Expected at least one jsonpath result at "${parsed.path}" to equal expected value`,
          ...failureCode(passed),
          actual: matches,
          expected: parsed.expected
        };
      }

      const passed =
        matches.length > 0 && matches.every((match) => !deepEqual(match, parsed.expected));
      return {
        target: parsed.target,
        operator: parsed.operator,
        passed,
        message: passed
          ? `Passed: ${toMessage(parsed)}`
          : `Expected all jsonpath results at "${parsed.path}" to differ from expected value`,
        ...failureCode(passed),
        actual: matches,
        expected: parsed.expected
      };
    }
  }
}
