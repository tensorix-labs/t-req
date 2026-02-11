import {
  BODY_OPERATOR_SET,
  type BodyOperator,
  HEADER_OPERATOR_SET,
  type HeaderOperator,
  JSONPATH_OPERATOR_SET,
  type JsonpathOperator,
  STATUS_OPERATOR_SET,
  type StatusOperator
} from '../domain/types';

export function isStatusOperator(value: string): value is StatusOperator {
  return STATUS_OPERATOR_SET.has(value);
}

export function isHeaderOperator(value: string): value is HeaderOperator {
  return HEADER_OPERATOR_SET.has(value);
}

export function isBodyOperator(value: string): value is BodyOperator {
  return BODY_OPERATOR_SET.has(value);
}

export function isJsonpathOperator(value: string): value is JsonpathOperator {
  return JSONPATH_OPERATOR_SET.has(value);
}
