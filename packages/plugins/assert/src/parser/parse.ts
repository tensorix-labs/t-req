import { JSONPath } from 'jsonpath-plus';
import type { AssertDiagnosticCode, JsonpathOperator, ParseResult, Token } from '../domain/types';
import { JSONPATH_OPERATOR_SET } from '../domain/types';
import { isBodyOperator, isHeaderOperator, isJsonpathOperator, isStatusOperator } from './guards';
import { parseExpectedJsonValue, parseExpectedString, tokenize } from './tokenize';

function parseFailure(
  code: AssertDiagnosticCode,
  message: string,
  columnStart: number,
  columnEnd: number
): ParseResult {
  return {
    ok: false,
    code,
    message,
    columnStart,
    columnEnd
  };
}

function parseStatusAssertion(expression: string, tokens: Token[]): ParseResult {
  const operatorToken = tokens[1];
  if (!operatorToken) {
    return parseFailure(
      'assert.operator',
      'Missing status operator',
      expression.length,
      expression.length
    );
  }

  if (!isStatusOperator(operatorToken.value)) {
    return parseFailure(
      'assert.operator',
      `Invalid status operator "${operatorToken.value}"`,
      operatorToken.start,
      operatorToken.end
    );
  }

  const valueToken = tokens[2];
  if (!valueToken) {
    return parseFailure(
      'assert.missing-value',
      'Missing status comparison value',
      expression.length,
      expression.length
    );
  }

  const valueRaw = expression.slice(valueToken.start).trim();
  const parsed = parseExpectedJsonValue(valueRaw);
  const numeric = typeof parsed === 'number' ? parsed : Number(String(parsed));
  if (!Number.isFinite(numeric)) {
    return parseFailure(
      'assert.syntax',
      `Status comparison value must be numeric, received "${valueRaw}"`,
      valueToken.start,
      expression.length
    );
  }

  return {
    ok: true,
    assertion: {
      target: 'status',
      operator: operatorToken.value,
      expected: numeric
    }
  };
}

function parseHeaderAssertion(expression: string, tokens: Token[]): ParseResult {
  const headerToken = tokens[1];
  if (!headerToken) {
    return parseFailure(
      'assert.syntax',
      'Missing header name',
      expression.length,
      expression.length
    );
  }

  const operatorToken = tokens[2];
  if (!operatorToken) {
    return parseFailure(
      'assert.operator',
      'Missing header operator',
      expression.length,
      expression.length
    );
  }

  if (!isHeaderOperator(operatorToken.value)) {
    return parseFailure(
      'assert.operator',
      `Invalid header operator "${operatorToken.value}"`,
      operatorToken.start,
      operatorToken.end
    );
  }

  if (operatorToken.value === 'exists') {
    return {
      ok: true,
      assertion: {
        target: 'header',
        headerName: headerToken.value,
        operator: operatorToken.value
      }
    };
  }

  const valueToken = tokens[3];
  if (!valueToken) {
    return parseFailure(
      'assert.missing-value',
      'Missing header comparison value',
      expression.length,
      expression.length
    );
  }

  const valueRaw = expression.slice(valueToken.start).trim();

  return {
    ok: true,
    assertion: {
      target: 'header',
      headerName: headerToken.value,
      operator: operatorToken.value,
      expected: parseExpectedString(valueRaw)
    }
  };
}

function parseBodyAssertion(expression: string, tokens: Token[]): ParseResult {
  const operatorToken = tokens[1];
  if (!operatorToken) {
    return parseFailure(
      'assert.operator',
      'Missing body operator',
      expression.length,
      expression.length
    );
  }

  if (!isBodyOperator(operatorToken.value)) {
    return parseFailure(
      'assert.operator',
      `Invalid body operator "${operatorToken.value}"`,
      operatorToken.start,
      operatorToken.end
    );
  }

  const valueToken = tokens[2];
  if (!valueToken) {
    return parseFailure(
      'assert.missing-value',
      'Missing body comparison value',
      expression.length,
      expression.length
    );
  }

  const valueRaw = expression.slice(valueToken.start).trim();

  return {
    ok: true,
    assertion: {
      target: 'body',
      operator: operatorToken.value,
      expected: parseExpectedString(valueRaw)
    }
  };
}

function isValidJsonPath(path: string): boolean {
  if (!path.startsWith('$')) return false;
  try {
    JSONPath({ path, json: {}, wrap: true });
    return true;
  } catch {
    return false;
  }
}

function parseJsonpathAssertion(expression: string, tokens: Token[]): ParseResult {
  if (tokens.length < 3) {
    return parseFailure('assert.syntax', 'Invalid jsonpath assertion syntax', 0, expression.length);
  }

  let operatorIndex = -1;
  let operator: JsonpathOperator | undefined;

  const last = tokens[tokens.length - 1];
  if (last?.value === 'exists') {
    operatorIndex = tokens.length - 1;
    operator = 'exists';
  } else {
    for (let i = tokens.length - 2; i >= 1; i--) {
      const candidate = tokens[i]?.value;
      if (candidate === '==' || candidate === '!=') {
        operatorIndex = i;
        operator = candidate;
        break;
      }
    }
  }

  if (operatorIndex === -1 || !operator || !JSONPATH_OPERATOR_SET.has(operator)) {
    return parseFailure(
      'assert.operator',
      'Missing or invalid jsonpath operator',
      0,
      expression.length
    );
  }

  if (!isJsonpathOperator(operator)) {
    return parseFailure(
      'assert.operator',
      'Missing or invalid jsonpath operator',
      0,
      expression.length
    );
  }

  const pathStart = tokens[1]?.start ?? 0;
  const pathEnd = tokens[operatorIndex]?.start ?? expression.length;
  const path = expression.slice(pathStart, pathEnd).trim();

  if (path.length === 0) {
    return parseFailure('assert.syntax', 'Missing jsonpath expression', 0, expression.length);
  }

  if (!isValidJsonPath(path)) {
    return parseFailure(
      'assert.invalid-jsonpath',
      `Invalid JSONPath expression "${path}"`,
      pathStart,
      pathEnd
    );
  }

  if (operator === 'exists') {
    return {
      ok: true,
      assertion: {
        target: 'jsonpath',
        path,
        operator
      }
    };
  }

  const valueToken = tokens[operatorIndex + 1];
  if (!valueToken) {
    return parseFailure(
      'assert.missing-value',
      'Missing jsonpath comparison value',
      expression.length,
      expression.length
    );
  }

  const valueRaw = expression.slice(valueToken.start).trim();

  return {
    ok: true,
    assertion: {
      target: 'jsonpath',
      path,
      operator,
      expected: parseExpectedJsonValue(valueRaw)
    }
  };
}

export function parseAssertionExpression(expression: string): ParseResult {
  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    return parseFailure('assert.syntax', 'Assertion expression is empty', 0, 0);
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return parseFailure('assert.syntax', 'Assertion expression is empty', 0, 0);
  }

  const target = tokens[0]?.value.toLowerCase();
  switch (target) {
    case 'status':
      return parseStatusAssertion(trimmed, tokens);
    case 'header':
      return parseHeaderAssertion(trimmed, tokens);
    case 'body':
      return parseBodyAssertion(trimmed, tokens);
    case 'jsonpath':
      return parseJsonpathAssertion(trimmed, tokens);
    default: {
      const first = tokens[0];
      return parseFailure(
        'assert.target',
        `Unknown assertion target "${first?.value ?? ''}"`,
        first?.start ?? 0,
        first?.end ?? trimmed.length
      );
    }
  }
}
