export type AssertDiagnosticCode =
  | 'assert.syntax'
  | 'assert.operator'
  | 'assert.target'
  | 'assert.missing-value'
  | 'assert.invalid-jsonpath'
  | 'assert.position'
  | 'assert.failed';

export interface AssertPluginOptions {
  /**
   * Directive name to parse (without @ prefix).
   * @default "assert"
   */
  directiveName?: string;
}

export interface AssertCheckReport {
  expression: string;
  line?: number;
  target?: AssertionTarget;
  operator?: string;
  passed: boolean;
  message: string;
  code?: AssertDiagnosticCode;
  actual?: unknown;
  expected?: unknown;
}

export interface AssertSummaryReport {
  kind: 'assert';
  passed: boolean;
  total: number;
  failed: number;
  checks: AssertCheckReport[];
}

export type AssertionTarget = 'status' | 'header' | 'body' | 'jsonpath';
export type StatusOperator = '==' | '!=' | '>' | '>=' | '<' | '<=';
export type HeaderOperator = 'exists' | '==' | '!=' | 'contains';
export type BodyOperator = 'contains' | 'not-contains';
export type JsonpathOperator = 'exists' | '==' | '!=';

export interface Token {
  value: string;
  raw: string;
  start: number;
  end: number;
}

export type ParsedAssertion =
  | {
      target: 'status';
      operator: StatusOperator;
      expected: number;
    }
  | {
      target: 'header';
      headerName: string;
      operator: HeaderOperator;
      expected?: string;
    }
  | {
      target: 'body';
      operator: BodyOperator;
      expected: string;
    }
  | {
      target: 'jsonpath';
      path: string;
      operator: JsonpathOperator;
      expected?: unknown;
    };

export type ParseResult =
  | {
      ok: true;
      assertion: ParsedAssertion;
    }
  | {
      ok: false;
      code: AssertDiagnosticCode;
      message: string;
      columnStart: number;
      columnEnd: number;
    };

export const STATUS_OPERATOR_SET: ReadonlySet<string> = new Set(['==', '!=', '>', '>=', '<', '<=']);
export const HEADER_OPERATOR_SET: ReadonlySet<string> = new Set(['exists', '==', '!=', 'contains']);
export const BODY_OPERATOR_SET: ReadonlySet<string> = new Set(['contains', 'not-contains']);
export const JSONPATH_OPERATOR_SET: ReadonlySet<string> = new Set(['exists', '==', '!=']);

export const REQUEST_LINE_PATTERN = /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s+/i;

export interface AssertLineOccurrence {
  line: number;
  directiveColumn: number;
  expressionColumn: number;
  expression: string;
  afterRequestLine: boolean;
}
